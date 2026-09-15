import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { Op, Transaction } from 'sequelize';
import { sequelize } from '../data';
import {
  RuntimeInstallation,
  RuntimeInstallationModel,
  RuntimeProviderModel,
  RuntimeOperation,
  RuntimeOperationModel,
} from '../data/runtime';
import {
  NodeEnvironmentModel as Envs,
  NodeEnvironmentRevisionModel as Revisions,
  NodeEnvironmentBuildModel as Builds,
  NodePackageManagerToolchainModel as Tools,
  NodeEnvironment,
  NodeEnvironmentBuild,
  NodeEnvironmentRevision,
} from '../data/nodeEnvironment';
import {
  NodeDependency,
  NodeOperationType,
  NodeOperationInput,
} from '../shared/nodeEnvironment';
import { RuntimeError, runtimeId } from '../shared/runtime';
import { ProviderContext } from './pyenvProvider';
import { RuntimeLease, RuntimeCommand } from './runtimeProcess';
import NodePathResolver, { nodeHash } from './nodePaths';
import NodeDistributionProvider, {
  exactNodeVersion,
  nodePlatform,
} from './nodeDistributionProvider';
import NodePackageManager from './nodePackageManager';
import type RuntimeReferenceService from './runtimeReferences';
export type NodeDefinitionInput = {
  name: string;
  description?: string;
  runtime_id: number;
  toolchain_id: number;
  dependencies: NodeDependency[];
  production_only?: boolean;
  install_scripts_policy?: 'ALLOW' | 'IGNORE';
  expected_version?: number;
};
const newBuildTypes = [
  'NODE_ENV_BUILD',
  'NODE_ENV_REBUILD',
  'NODE_ENV_RESOLVE',
];
/** Node domain handler for the shared RuntimeOperation executor; no job runner here. */
export default class NodeEnvironmentService {
  readonly paths: NodePathResolver;
  readonly packages: NodePackageManager;
  constructor(
    readonly distribution = new NodeDistributionProvider(),
    registry?: string,
  ) {
    this.paths = distribution.paths;
    this.packages = new NodePackageManager(this.paths, registry);
  }
  async getProvider() {
    const [p] = await RuntimeProviderModel.findOrCreate({
      where: { language: 'NODE', provider_type: 'NODE_DISTRIBUTION' },
      defaults: {
        language: 'NODE',
        provider_type: 'NODE_DISTRIBUTION',
        state: 'READY',
        install_root: 'runtime/node',
        catalog: [],
        version: 1,
      },
    });
    return p.get({ plain: true });
  }
  async runtime(id: number, transaction?: Transaction) {
    const r = await RuntimeInstallationModel.findByPk(runtimeId(id), {
      transaction,
    });
    if (!r || r.get('language') !== 'NODE' || r.get('state') === 'REMOVED')
      throw new RuntimeError('NODE_RUNTIME_NOT_FOUND', 404);
    return r.get({ plain: true });
  }
  async toolchain(id: number, transaction?: Transaction) {
    const r = await Tools.findByPk(runtimeId(id), { transaction });
    if (!r || r.get('state') === 'REMOVED')
      throw new RuntimeError('NODE_TOOLCHAIN_NOT_FOUND', 404);
    return r.get({ plain: true });
  }
  async environment(id: number, transaction?: Transaction) {
    const r = await Envs.findByPk(runtimeId(id), { transaction });
    if (!r) throw new RuntimeError('NODE_ENVIRONMENT_NOT_FOUND', 404);
    return r.get({ plain: true });
  }
  async revision(id: number, transaction?: Transaction) {
    const r = await Revisions.findByPk(runtimeId(id), { transaction });
    if (!r) throw new RuntimeError('NODE_REVISION_NOT_FOUND', 404);
    return r.get({ plain: true });
  }
  async build(id: number, environment: number, transaction?: Transaction) {
    const r = await Builds.findOne({
      where: { id: runtimeId(id), environment_id: runtimeId(environment) },
      transaction,
    });
    if (!r) throw new RuntimeError('NODE_BUILD_NOT_FOUND', 404);
    return r.get({ plain: true });
  }
  async runtimes() {
    const rows = await RuntimeInstallationModel.findAll({
      where: { language: 'NODE', state: { [Op.ne]: 'REMOVED' } },
      order: [['id', 'DESC']],
    });
    return Promise.all(
      rows.map(async (r) => {
        const value = r.get({ plain: true });
        let health = 'INVALID';
        try {
          const root = await this.paths.assertOwned('runtime', value.id);
          await this.paths.file(root, 'bin/node');
          health = value.state === 'READY' ? 'HEALTHY' : 'BUSY';
        } catch (e) {
          health =
            (e as NodeJS.ErrnoException).code === 'ENOENT'
              ? 'MISSING'
              : 'INVALID';
        }
        return { ...value, health };
      }),
    );
  }
  async toolchains() {
    return (
      await Tools.findAll({
        where: { state: { [Op.ne]: 'REMOVED' } },
        order: [['id', 'DESC']],
      })
    ).map((x) => x.get({ plain: true }));
  }
  async environments() {
    return Promise.all(
      (await Envs.findAll({ order: [['id', 'DESC']] })).map(async (x) => {
        const env = x.get({ plain: true });
        let health = 'UNVERIFIED';
        if (env.current_build_id)
          try {
            const b = await this.build(env.current_build_id, env.id);
            await this.paths.assertOwned('build', b.id, env.id);
            health = b.health;
          } catch (e) {
            health =
              (e as NodeJS.ErrnoException).code === 'ENOENT'
                ? 'MISSING'
                : 'INVALID';
          }
        return {
          ...env,
          health,
          state: ['INVALID', 'MISSING'].includes(health) ? 'ERROR' : env.state,
        };
      }),
    );
  }
  async builds(id: number) {
    await this.environment(id);
    return (
      await Builds.findAll({
        where: { environment_id: id },
        order: [['id', 'DESC']],
      })
    ).map((x) => x.get({ plain: true }));
  }
  async revisions(id: number) {
    await this.environment(id);
    return (
      await Revisions.findAll({
        where: { environment_id: id },
        order: [['id', 'DESC']],
      })
    ).map((x) => x.get({ plain: true }));
  }
  async toolchainReferences(id: number) {
    const references = [];
    for (const [type, model] of [
      ['NodeEnvironment', Envs],
      ['NodeEnvironmentRevision', Revisions],
      ['NodeEnvironmentBuild', Builds],
    ] as const)
      for (const row of await (model as any).findAll({
        where: { toolchain_id: runtimeId(id) },
        attributes: ['id'],
      }))
        references.push({ type, id: Number(row.get('id')) });
    return { count: references.length, references };
  }
  assertVersion(env: NodeEnvironment, version: unknown) {
    if (!Number.isSafeInteger(version) || env.version !== version)
      throw new RuntimeError('NODE_ENVIRONMENT_VERSION_CONFLICT');
    if (['BUILDING', 'DELETING'].includes(env.state))
      throw new RuntimeError('RUNTIME_BUSY');
  }
  async definition(input: NodeDefinitionInput, id?: number) {
    if (
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 100 ||
      /[\x00-\x1f]/.test(input.name) ||
      (input.description?.length ?? 0) > 1000
    )
      throw new RuntimeError('NODE_ENVIRONMENT_REQUEST_INVALID', 400);
    const leases: RuntimeLease[] = [];
    let directory: string | undefined;
    try {
      leases.push(
        await this.paths.lease(
          'runtime',
          runtimeId(input.runtime_id),
          'shared',
        ),
      );
      leases.push(
        await this.paths.lease(
          'toolchain',
          runtimeId(input.toolchain_id),
          'shared',
        ),
      );
      if (id) leases.push(await this.paths.lease('environment', id));
      const runtime = await this.runtime(input.runtime_id),
        tool = await this.toolchain(input.toolchain_id);
      if (
        runtime.state !== 'READY' ||
        tool.state !== 'READY' ||
        tool.runtime_id !== runtime.id
      )
        throw new RuntimeError('NODE_TOOLCHAIN_NOT_READY');
      const previous = id ? await this.environment(id) : null;
      if (previous) this.assertVersion(previous, input.expected_version);
      directory = await this.paths.directory(
        'tmp/runtime/node/definition-' + randomUUID(),
        true,
      );
      const command = new RuntimeCommand(
        leases[0],
        30,
        async () => {},
        leases.slice(1),
      );
      const ctx: ProviderContext = {
        id: 0,
        providerId: runtime.provider_id,
        directory,
        environment: {
          PATH: '/usr/bin:/bin',
          HOME: directory,
          TMPDIR: directory,
        },
        command,
        stage: async () => {},
      };
      const dependencies = await this.packages.validate(
        ctx,
        runtime,
        input.dependencies,
      );
      await this.packages.verify(ctx, runtime, tool);
      const policies = {
        production_only: input.production_only ?? false,
        install_scripts_policy: input.install_scripts_policy ?? 'ALLOW',
      } as const;
      if (
        typeof policies.production_only !== 'boolean' ||
        !['ALLOW', 'IGNORE'].includes(policies.install_scripts_policy)
      )
        throw new RuntimeError('NODE_ENVIRONMENT_REQUEST_INVALID', 400);
      return await sequelize.transaction(async (transaction) => {
        let env = previous;
        if (env) {
          const current = await this.environment(env.id, transaction);
          this.assertVersion(current, input.expected_version);
        } else
          env = (
            await Envs.create(
              {
                name: input.name.trim(),
                description: input.description ?? '',
                runtime_id: runtime.id,
                toolchain_id: tool.id,
                state: 'EMPTY',
                ...policies,
              },
              { transaction },
            )
          ).get({ plain: true });
        const revision = await Revisions.create(
          {
            environment_id: env.id,
            runtime_id: runtime.id,
            toolchain_id: tool.id,
            dependencies,
            ...policies,
            spec_hash: nodeHash(
              JSON.stringify({
                runtime: runtime.id,
                tool: tool.id,
                dependencies,
                ...policies,
                registry: this.packages.registry,
              }),
            ),
          },
          { transaction },
        );
        if (!previous) await this.paths.create('environment', env.id);
        await Envs.update(
          {
            name: input.name.trim(),
            description: input.description ?? '',
            runtime_id: runtime.id,
            toolchain_id: tool.id,
            current_revision_id: Number(revision.get('id')),
            version: previous ? env.version + 1 : 1,
            ...policies,
          },
          { where: { id: env.id }, transaction },
        );
        return this.environment(env.id, transaction);
      });
    } finally {
      try {
        if (directory) {
          await this.paths.directory(
            path
              .relative(await this.paths.root(), directory)
              .split(path.sep)
              .join('/'),
          );
          await fs.rm(directory, { recursive: true });
        }
      } finally {
        for (const l of leases.reverse()) await l.release();
      }
    }
  }
  async metadata(
    id: number,
    input: { name: string; description: string; expected_version: number },
  ) {
    const lease = await this.paths.lease('environment', id);
    try {
      const env = await this.environment(id);
      this.assertVersion(env, input.expected_version);
      if (
        !input.name.trim() ||
        input.name.length > 100 ||
        input.description.length > 1000
      )
        throw new RuntimeError('NODE_ENVIRONMENT_REQUEST_INVALID', 400);
      await Envs.update(
        {
          name: input.name.trim(),
          description: input.description,
          version: env.version + 1,
        },
        { where: { id } },
      );
      return this.environment(id);
    } finally {
      await lease.release();
    }
  }
  async clone(id: number, name: string) {
    const env = await this.environment(id),
      rev = await this.revision(env.current_revision_id!);
    return this.definition({
      name,
      description: env.description,
      runtime_id: rev.runtime_id,
      toolchain_id: rev.toolchain_id,
      dependencies: rev.dependencies,
      production_only: rev.production_only,
      install_scripts_policy: rev.install_scripts_policy,
    });
  }
  async prepare(
    type: NodeOperationType,
    input: NodeOperationInput,
    transaction: Transaction,
    leases: RuntimeLease[],
    references: RuntimeReferenceService,
  ) {
    const provider = (await RuntimeProviderModel.findOne({
      where: { language: 'NODE', provider_type: 'NODE_DISTRIBUTION' },
      transaction,
    }))!.get({ plain: true });
    let runtime: RuntimeInstallation | undefined;
    const metadata: Record<string, unknown> = {};
    if (type === 'NODE_CATALOG_REFRESH') {
      leases.push(await this.paths.lease('provider', provider.id));
      return { provider, runtime_id: null, metadata };
    }
    if (type === 'NODE_RUNTIME_INSTALL') {
      leases.push(await this.paths.lease('provider', provider.id));
      const version = exactNodeVersion(input.version);
      nodePlatform();
      const entries = provider.catalog as unknown as {
        version: string;
        files: string[];
      }[];
      const entry = entries.find((x) => x.version === version);
      if (
        !entry ||
        !entry.files.includes(
          process.platform === 'darwin'
            ? 'osx-' + process.arch + '-tar'
            : nodePlatform(),
        )
      )
        throw new RuntimeError('NODE_RUNTIME_ARTIFACT_UNAVAILABLE', 400);
      const previous = await RuntimeInstallationModel.findOne({
        where: { provider_id: provider.id, implementation: 'NODEJS', version },
        transaction,
      });
      if (previous && previous.get('state') !== 'REMOVED')
        throw new RuntimeError('RUNTIME_ALREADY_INSTALLED');
      runtime =
        previous?.get({ plain: true }) ??
        (
          await RuntimeInstallationModel.create(
            {
              provider_id: provider.id,
              language: 'NODE',
              implementation: 'NODEJS',
              version,
              state: 'INSTALLING',
              executable_relative_path: 'bin/node',
              metadata: {},
            },
            { transaction },
          )
        ).get({ plain: true });
      leases.push(await this.paths.lease('runtime', runtime.id));
      await RuntimeInstallationModel.update(
        { state: 'INSTALLING', last_error: null },
        { where: { id: runtime.id }, transaction },
      );
    } else if (type.startsWith('NODE_RUNTIME_')) {
      leases.push(
        await this.paths.lease('runtime', runtimeId(input.runtime_id)),
      );
      runtime = await this.runtime(input.runtime_id!, transaction);
      if (['INSTALLING', 'VERIFYING', 'REMOVING'].includes(runtime.state))
        throw new RuntimeError('RUNTIME_BUSY');
      if (type !== 'NODE_RUNTIME_VERIFY')
        await references.requireUnused(runtime.id);
      await RuntimeInstallationModel.update(
        {
          state:
            type === 'NODE_RUNTIME_REMOVE'
              ? 'REMOVING'
              : type === 'NODE_RUNTIME_VERIFY'
              ? 'VERIFYING'
              : 'INSTALLING',
        },
        { where: { id: runtime.id }, transaction },
      );
    } else if (type.startsWith('NODE_PACKAGE_MANAGER_')) {
      const tool =
        type === 'NODE_PACKAGE_MANAGER_INSTALL'
          ? null
          : await this.toolchain(runtimeId(input.toolchain_id), transaction);
      runtime = await this.runtime(
        tool?.runtime_id ?? runtimeId(input.runtime_id),
        transaction,
      );
      leases.push(await this.paths.lease('runtime', runtime.id, 'shared'));
      if (runtime.state !== 'READY')
        throw new RuntimeError('NODE_RUNTIME_NOT_READY');
      if (tool) {
        leases.push(await this.paths.lease('toolchain', tool.id));
        if (
          type === 'NODE_PACKAGE_MANAGER_REMOVE' &&
          (await this.toolchainReferences(tool.id)).count
        )
          throw new RuntimeError('NODE_TOOLCHAIN_REFERENCED');
        metadata.toolchain_id = tool.id;
      } else {
        const manager = input.manager_type;
        if (!['PNPM', 'NPM'].includes(manager!))
          throw new RuntimeError('NODE_TOOLCHAIN_INVALID', 400);
        const version =
          manager === 'NPM'
            ? String(runtime.metadata.npm_version)
            : exactNodeVersion(input.version);
        // This adapter's explicit script policy is defined for pnpm 10 >= 10.9.
        if (
          manager === 'PNPM' &&
          (Number(version.split('.')[0]) !== 10 ||
            Number(version.split('.')[1]) < 9)
        )
          throw new RuntimeError('NODE_PNPM_VERSION_UNSUPPORTED', 400);
        const previous = await Tools.findOne({
          where: { runtime_id: runtime.id, manager_type: manager, version },
          transaction,
        });
        if (previous && previous.get('state') !== 'REMOVED')
          throw new RuntimeError('NODE_TOOLCHAIN_ALREADY_EXISTS');
        const row =
          previous ??
          (await Tools.create(
            {
              runtime_id: runtime.id,
              manager_type: manager,
              version,
              state: 'INSTALLING',
              metadata: {},
            },
            { transaction },
          ));
        leases.push(await this.paths.lease('toolchain', Number(row.get('id'))));
        if (previous)
          await previous.update(
            { state: 'INSTALLING', metadata: {}, last_error: null },
            { transaction },
          );
        metadata.toolchain_id = row.get('id');
      }
    } else {
      const env = await this.environment(
        runtimeId(input.environment_id),
        transaction,
      );
      let revision = await this.revision(env.current_revision_id!, transaction);
      let selected: NodeEnvironmentBuild | undefined;
      if (type === 'NODE_ENV_REBUILD') {
        if (!env.current_build_id)
          throw new RuntimeError('NODE_ENVIRONMENT_NOT_READY');
        selected = await this.build(env.current_build_id, env.id, transaction);
        revision = await this.revision(selected.revision_id, transaction);
        if (selected.state !== 'READY' || !selected.lock_hash)
          throw new RuntimeError('NODE_ENVIRONMENT_NOT_READY');
        metadata.frozen_build_id = selected.id;
      } else if (
        [
          'NODE_ENV_VERIFY',
          'NODE_ENV_PROMOTE',
          'NODE_ENV_DELETE_BUILD',
        ].includes(type)
      ) {
        selected = await this.build(
          runtimeId(input.build_id),
          env.id,
          transaction,
        );
        revision = await this.revision(selected.revision_id, transaction);
        metadata.build_id = selected.id;
      }
      runtime = await this.runtime(revision.runtime_id, transaction);
      leases.push(await this.paths.lease('runtime', runtime.id, 'shared'));
      leases.push(
        await this.paths.lease('toolchain', revision.toolchain_id, 'shared'),
      );
      leases.push(await this.paths.lease('environment', env.id));
      this.assertVersion(
        await this.environment(env.id, transaction),
        input.expected_version,
      );
      metadata.environment_id = env.id;
      metadata.revision_id = revision.id;
      metadata.toolchain_id = revision.toolchain_id;
      if (newBuildTypes.includes(type)) {
        if (
          runtime.state !== 'READY' ||
          (await this.toolchain(revision.toolchain_id, transaction)).state !==
            'READY'
        )
          throw new RuntimeError('NODE_ENVIRONMENT_NOT_READY');
        leases.push(await this.paths.buildSlot());
        if (selected)
          leases.push(await this.paths.lease('build', selected.id, 'shared'));
        const row = await Builds.create(
          {
            environment_id: env.id,
            revision_id: revision.id,
            runtime_id: revision.runtime_id,
            toolchain_id: revision.toolchain_id,
            state: 'QUEUED',
            health: 'UNVERIFIED',
          },
          { transaction },
        );
        metadata.build_id = row.get('id');
        leases.push(await this.paths.lease('build', Number(row.get('id'))));
        await Envs.update(
          { state: 'BUILDING', last_error: null },
          { where: { id: env.id }, transaction },
        );
      } else if (type === 'NODE_ENV_DELETE') {
        for (const b of await Builds.findAll({
          where: { environment_id: env.id },
          order: [['id', 'ASC']],
          transaction,
        }))
          leases.push(await this.paths.lease('build', Number(b.get('id'))));
        await Envs.update(
          { state: 'DELETING' },
          { where: { id: env.id }, transaction },
        );
      } else if (selected) {
        if (type === 'NODE_ENV_DELETE_BUILD') {
          if (selected.id === env.current_build_id)
            throw new RuntimeError('NODE_BUILD_REFERENCED');
          leases.push(await this.paths.lease('build', selected.id));
          await Builds.update(
            { state: 'DELETING' },
            { where: { id: selected.id }, transaction },
          );
        } else {
          if (selected.state !== 'READY')
            throw new RuntimeError('NODE_ENVIRONMENT_NOT_READY');
          leases.push(await this.paths.lease('build', selected.id, 'shared'));
        }
      }
    }
    return { provider, runtime_id: runtime?.id ?? null, metadata };
  }
  async execute(
    ctx: ProviderContext,
    operation: RuntimeOperation,
    references: RuntimeReferenceService,
  ): Promise<(transaction: Transaction) => Promise<void>> {
    const type = operation.operation_type as NodeOperationType,
      m = operation.metadata;
    if (type === 'NODE_CATALOG_REFRESH') {
      const catalog = await this.distribution.catalog(ctx);
      return async (transaction) => {
        await RuntimeProviderModel.update(
          {
            catalog: catalog as any,
            last_refresh_at: new Date(),
            last_error: null,
          },
          { where: { id: operation.provider_id }, transaction },
        );
      };
    }
    const runtime = await this.runtime(operation.runtime_id!);
    if (type.startsWith('NODE_RUNTIME_')) {
      let metadata: Record<string, unknown> | undefined;
      if (type === 'NODE_RUNTIME_REMOVE') {
        await references.requireUnused(runtime.id);
        await ctx.stage('REMOVING_RUNTIME');
        await this.paths.remove('runtime', runtime.id);
      } else
        metadata =
          type === 'NODE_RUNTIME_VERIFY'
            ? await this.distribution.verify(ctx, runtime)
            : await this.distribution.install(
                ctx,
                runtime,
                type === 'NODE_RUNTIME_REPAIR',
              );
      return async (transaction) => {
        await RuntimeInstallationModel.update(
          type === 'NODE_RUNTIME_REMOVE'
            ? { state: 'REMOVED', last_error: null }
            : {
                state: 'READY',
                metadata: { ...runtime.metadata, ...metadata },
                installed_at: runtime.installed_at ?? new Date(),
                verified_at: new Date(),
                last_error: null,
              },
          { where: { id: runtime.id }, transaction },
        );
      };
    }
    const tool = await this.toolchain(Number(m.toolchain_id));
    if (type.startsWith('NODE_PACKAGE_MANAGER_')) {
      if (type === 'NODE_PACKAGE_MANAGER_REMOVE') {
        if ((await this.toolchainReferences(tool.id)).count)
          throw new RuntimeError('NODE_TOOLCHAIN_REFERENCED');
        if (tool.manager_type === 'PNPM')
          await this.paths.remove('toolchain', tool.id);
        return async (transaction) => {
          await Tools.update(
            { state: 'REMOVED' },
            { where: { id: tool.id }, transaction },
          );
        };
      }
      const metadata =
        type === 'NODE_PACKAGE_MANAGER_INSTALL'
          ? await this.packages.install(ctx, runtime, tool)
          : await this.packages.verify(ctx, runtime, tool);
      return async (transaction) => {
        await Tools.update(
          {
            state: 'READY',
            metadata,
            verified_at: new Date(),
            last_error: null,
          },
          { where: { id: tool.id }, transaction },
        );
      };
    }
    const env = await this.environment(Number(m.environment_id));
    if (type === 'NODE_ENV_DELETE') {
      await ctx.stage('DELETING_ENVIRONMENT');
      for (const b of await this.builds(env.id))
        await this.paths.remove('build', b.id, env.id);
      await this.paths.remove('environment', env.id);
      return async (transaction) => {
        await Envs.update(
          { current_revision_id: null, current_build_id: null },
          { where: { id: env.id }, transaction },
        );
        await Builds.destroy({
          where: { environment_id: env.id },
          transaction,
        });
        await Revisions.destroy({
          where: { environment_id: env.id },
          transaction,
        });
        await Envs.destroy({ where: { id: env.id }, transaction });
      };
    }
    const build = await this.build(Number(m.build_id), env.id),
      revision = await this.revision(build.revision_id);
    if (type === 'NODE_ENV_DELETE_BUILD') {
      await this.paths.remove('build', build.id, env.id);
      return async (transaction) => {
        await Builds.destroy({ where: { id: build.id }, transaction });
      };
    }
    let snapshot:
      | Awaited<ReturnType<NodePackageManager['installBuild']>>
      | undefined;
    if (newBuildTypes.includes(type)) {
      const stat = await (fs as any).statfs(await this.paths.root());
      if (stat.bavail * stat.bsize < 128 * 1024 * 1024)
        throw new RuntimeError('NODE_DISK_SPACE_LOW');
      await Builds.update({ state: 'INSTALLING' }, { where: { id: build.id } });
      snapshot = await this.packages.installBuild(
        ctx,
        runtime,
        tool,
        revision,
        build,
        m.frozen_build_id
          ? await this.build(Number(m.frozen_build_id), env.id)
          : undefined,
      );
    } else await this.packages.verifyBuild(ctx, runtime, tool, revision, build);
    return async (transaction) => {
      await Builds.update(
        {
          ...snapshot,
          state: 'READY',
          health: 'HEALTHY',
          last_error: null,
          verified_at: new Date(),
        },
        { where: { id: build.id }, transaction },
      );
      if (type !== 'NODE_ENV_VERIFY')
        await Envs.update(
          {
            current_build_id: build.id,
            current_revision_id: revision.id,
            runtime_id: revision.runtime_id,
            toolchain_id: revision.toolchain_id,
            production_only: revision.production_only,
            install_scripts_policy: revision.install_scripts_policy,
            state: 'READY',
            last_error: null,
            version: env.version + 1,
          },
          { where: { id: env.id }, transaction },
        );
      else if (env.current_build_id === build.id)
        await Envs.update(
          { state: 'READY', last_error: null },
          { where: { id: env.id }, transaction },
        );
    };
  }
  async failed(
    operation: RuntimeOperation,
    code: string,
    transaction: Transaction,
    interrupted = false,
  ) {
    const type = operation.operation_type,
      m = operation.metadata;
    if (type.startsWith('NODE_ENV_')) {
      if (m.build_id) {
        if (newBuildTypes.includes(type))
          await Builds.update(
            {
              state: interrupted
                ? 'INTERRUPTED'
                : code === 'RUNTIME_CANCELLED'
                ? 'CANCELLED'
                : 'FAILED',
              last_error: code,
            },
            { where: { id: Number(m.build_id) }, transaction },
          );
        else if (type === 'NODE_ENV_VERIFY' || type === 'NODE_ENV_PROMOTE')
          await Builds.update(
            {
              health: code === 'RUNTIME_MISSING' ? 'MISSING' : 'INVALID',
              last_error: code,
            },
            { where: { id: Number(m.build_id) }, transaction },
          );
      }
      const env = await this.environment(Number(m.environment_id), transaction);
      const current = env.current_build_id
        ? await this.build(env.current_build_id, env.id, transaction)
        : null;
      await Envs.update(
        {
          state:
            type !== 'NODE_ENV_DELETE' &&
            current?.state === 'READY' &&
            current.health === 'HEALTHY'
              ? 'READY'
              : 'ERROR',
          last_error: code,
        },
        { where: { id: env.id }, transaction },
      );
    } else if (type.startsWith('NODE_PACKAGE_MANAGER_'))
      await Tools.update(
        { state: 'ERROR', last_error: code },
        { where: { id: Number(m.toolchain_id) }, transaction },
      );
    else if (operation.runtime_id)
      await RuntimeInstallationModel.update(
        { state: 'ERROR', last_error: code },
        { where: { id: operation.runtime_id }, transaction },
      );
    else
      await RuntimeProviderModel.update(
        { last_error: code },
        { where: { id: operation.provider_id }, transaction },
      );
  }
  async cleanupCancelled(operation: RuntimeOperation) {
    if (
      newBuildTypes.includes(operation.operation_type) &&
      operation.metadata.build_id
    )
      await this.paths.remove(
        'build',
        Number(operation.metadata.build_id),
        Number(operation.metadata.environment_id),
      );
    else if (operation.operation_type === 'NODE_PACKAGE_MANAGER_INSTALL') {
      const tool = await this.toolchain(
        Number(operation.metadata.toolchain_id),
      );
      if (tool.manager_type === 'PNPM')
        await this.paths.remove('toolchain', tool.id);
    }
  }
  async diff(id: number, from: number, to: number) {
    const a = await this.build(from, id),
      b = await this.build(to, id);
    const groups = (rows: typeof a.resolved) => {
      const m = new Map<string, string[]>();
      for (const r of rows)
        m.set(r.name, [...(m.get(r.name) ?? []), r.version].sort());
      return m;
    };
    const aa = groups(a.resolved),
      bb = groups(b.resolved);
    return [...new Set([...aa.keys(), ...bb.keys()])].sort().flatMap((name) => {
      const before = aa.get(name) ?? [],
        after = bb.get(name) ?? [];
      return JSON.stringify(before) === JSON.stringify(after)
        ? []
        : [
            {
              name,
              before,
              after,
              change: !before.length
                ? 'ADDED'
                : !after.length
                ? 'REMOVED'
                : 'CHANGED',
            },
          ];
    });
  }
  async diagnostics() {
    const scan = async (relative: string, known: Set<string>) => {
      try {
        const root = await this.paths.directory(relative),
          out: Array<{ entry: string; state: string }> = [];
        const dir = await fs.opendir(root);
        let count = 0;
        for await (const item of dir) {
          if (++count > 10000) {
            out.push({ entry: 'SCAN_LIMIT', state: 'PARTIAL' });
            break;
          }
          if (!known.has(item.name))
            out.push({ entry: item.name, state: 'ORPHAN' });
        }
        return out;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw e;
      }
    };
    const runtimes = await RuntimeInstallationModel.findAll({
        where: { language: 'NODE', state: { [Op.ne]: 'REMOVED' } },
      }),
      envs = await Envs.findAll(),
      builds = await Builds.findAll();
    const runtime_orphans = await scan(
      'runtime/node/versions',
      new Set(runtimes.map((x) => 'runtime-' + x.get('id'))),
    );
    const environment_orphans = await scan(
      'runtime/node/environments',
      new Set(envs.map((x) => 'env-' + x.get('id'))),
    );
    const build_orphans: Array<{
      environment_id: number;
      entry: string;
      state: string;
    }> = [];
    for (const env of envs.slice(0, 1000)) {
      const id = Number(env.get('id'));
      for (const item of await scan(
        'runtime/node/environments/env-' + id + '/builds',
        new Set(
          builds
            .filter((x) => x.get('environment_id') === id)
            .map((x) => 'build-' + x.get('id')),
        ),
      ))
        build_orphans.push({ environment_id: id, ...item });
    }
    return {
      runtime_orphans,
      environment_orphans,
      build_orphans,
      partial: envs.length > 1000,
      build_concurrency: 2,
      registry: this.packages.registry,
    };
  }
}

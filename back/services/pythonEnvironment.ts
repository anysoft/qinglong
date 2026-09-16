import { PlatformMutation } from './backup/platform';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID, createHash } from 'crypto';
import { sequelize } from '../data';
import {
  PythonEnvironmentModel as Environments,
  PythonEnvironmentRevisionModel as Revisions,
  PythonEnvironmentBuildModel as Builds,
} from '../data/pythonEnvironment';
import { RuntimeInstallationModel } from '../data/runtime';
import { RuntimeError, runtimeId, RUNTIME_TOOL_PATH } from '../shared/runtime';
import RuntimeOperationService from './runtimeOperations';
import { RuntimeLease, RuntimeCommand } from './runtimeProcess';
import PythonDependencyService from './pythonDependency';
import { ProviderContext } from './pyenvProvider';

export default class PythonEnvironmentService {
  readonly dependencies = new PythonDependencyService();
  constructor(readonly operations: RuntimeOperationService) {}
  async environment(id: number) {
    const row = await Environments.findByPk(runtimeId(id));
    if (!row) throw new RuntimeError('PYTHON_ENV_NOT_FOUND', 404);
    return row.get({ plain: true });
  }
  async build(environment: number, id: number) {
    const row = await Builds.findByPk(runtimeId(id));
    if (
      !row ||
      row.get({ plain: true }).environment_id !== runtimeId(environment)
    )
      throw new RuntimeError('PYTHON_ENV_BUILD_NOT_FOUND', 404);
    return row.get({ plain: true });
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
  async list() {
    const rows = await Environments.findAll({ order: [['id', 'DESC']] });
    return Promise.all(
      rows.map(async (row) => {
        const environment = row.get({ plain: true }),
          revision = environment.current_revision_id
            ? await Revisions.findByPk(environment.current_revision_id)
            : null;
        const build = environment.current_build_id
          ? await Builds.findByPk(environment.current_build_id)
          : null;
        let health = build?.get({ plain: true }).health ?? 'UNVERIFIED';
        if (build)
          try {
            const runtime = await RuntimeInstallationModel.findByPk(
              build.get({ plain: true }).runtime_id,
            );
            if (!runtime || runtime.get({ plain: true }).state !== 'READY')
              throw new RuntimeError('PYTHON_ENV_RUNTIME_INVALID');
            await this.operations.environments.paths.executable(
              build.get({ plain: true }),
              runtime.get({ plain: true }),
            );
          } catch (error) {
            health =
              (error as NodeJS.ErrnoException).code === 'ENOENT'
                ? 'MISSING'
                : 'INVALID';
          }
        const runtime = await RuntimeInstallationModel.findByPk(
          environment.runtime_id,
        );
        return {
          ...environment,
          state:
            environment.state === 'READY' && health !== 'HEALTHY'
              ? 'ERROR'
              : environment.state,
          health,
          runtime_version: runtime?.get({ plain: true }).version,
          direct_packages:
            revision?.get({ plain: true }).dependencies.length ?? 0,
          resolved_packages: build?.get({ plain: true }).resolved.length ?? 0,
          current_build: build?.get({ plain: true }) ?? null,
        };
      }),
    );
  }
  @PlatformMutation()
  async withMutation<T>(
    id: number | null,
    action: (ctx: ProviderContext) => Promise<T>,
  ) {
    await this.operations.recover();
    const provider = await this.operations.getProvider(),
      lease = await RuntimeLease.acquire(this.operations.paths, provider.id);
    let environmentLease: RuntimeLease | undefined,
      directory: string | undefined;
    try {
      if (id)
        environmentLease = await this.operations.environments.paths.lock(
          id,
          'environment',
        );
      const relative = 'tmp/runtime/python/definition-' + randomUUID();
      directory = await this.operations.paths.directory(relative, true);
      const home = await this.operations.paths.directory(
        relative + '/home',
        true,
      );
      const ctx: ProviderContext = {
        id: 0,
        providerId: provider.id,
        directory,
        environment: {
          PATH: RUNTIME_TOOL_PATH,
          HOME: home,
          TMPDIR: directory,
          LANG: 'C.UTF-8',
          LC_ALL: 'C.UTF-8',
          PYTHONNOUSERSITE: '1',
          PYTHONDONTWRITEBYTECODE: '1',
        },
        command: new RuntimeCommand(lease, 30, async () => {}),
        stage: async () => {},
      };
      return await action(ctx);
    } finally {
      if (directory)
        await fs
          .rm(directory, { recursive: true, force: true })
          .catch(() => {});
      await environmentLease?.release();
      await lease.release();
    }
  }
  async healthyRuntime(id: number) {
    const row = await RuntimeInstallationModel.findByPk(runtimeId(id));
    if (
      !row ||
      row.get({ plain: true }).language !== 'PYTHON' ||
      row.get({ plain: true }).implementation !== 'CPYTHON' ||
      row.get({ plain: true }).state !== 'READY'
    )
      throw new RuntimeError('PYTHON_ENV_RUNTIME_INVALID');
    const runtime = row.get({ plain: true }),
      location = await this.operations.paths.executable(
        runtime.version,
        runtime.id,
        runtime.provider_id,
      );
    if (
      createHash('sha256')
        .update(await fs.readFile(location.executable))
        .digest('hex') !== runtime.metadata.executable_sha256
    )
      throw new RuntimeError('PYTHON_ENV_RUNTIME_INVALID');
    return { ...runtime, ...location };
  }
  async create(input: {
    name: string;
    description?: string;
    runtime_id: number;
    requirements: string[];
  }) {
    this.dependencies.validateInput(input.requirements);
    return this.withMutation(null, async (ctx) => {
      const runtime = await this.healthyRuntime(input.runtime_id);
      const dependencies = await this.dependencies.parse(
        ctx,
        runtime.executable,
        input.requirements,
      );
      if (await Environments.findOne({ where: { name: input.name } }))
        throw new RuntimeError('PYTHON_ENV_NAME_EXISTS');
      return sequelize.transaction(async (transaction) => {
        const environment = await Environments.create(
          {
            name: input.name,
            description: input.description ?? '',
            runtime_id: runtime.id,
            state: 'EMPTY',
            version: 1,
          },
          { transaction },
        );
        const revision = await Revisions.create(
          {
            environment_id: environment.get({ plain: true }).id,
            runtime_id: runtime.id,
            dependencies,
            spec_hash: this.dependencies.hash(
              runtime.id,
              dependencies,
              this.operations.environments.pip.index,
            ),
          },
          { transaction },
        );
        await environment.update(
          { current_revision_id: revision.get({ plain: true }).id },
          { transaction },
        );
        return environment.get({ plain: true });
      });
    });
  }
  async revise(
    id: number,
    input: {
      expected_version: number;
      runtime_id: number;
      requirements: string[];
    },
  ) {
    this.dependencies.validateInput(input.requirements);
    return this.withMutation(id, async (ctx) => {
      const environment = await this.environment(id);
      if (environment.version !== input.expected_version)
        throw new RuntimeError('PYTHON_ENV_VERSION_CONFLICT');
      if (environment.state === 'DELETING')
        throw new RuntimeError('PYTHON_ENV_BUSY');
      const runtime = await this.healthyRuntime(input.runtime_id),
        dependencies = await this.dependencies.parse(
          ctx,
          runtime.executable,
          input.requirements,
        );
      return sequelize.transaction(async (transaction) => {
        const revision = await Revisions.create(
          {
            environment_id: id,
            runtime_id: runtime.id,
            dependencies,
            spec_hash: this.dependencies.hash(
              runtime.id,
              dependencies,
              this.operations.environments.pip.index,
            ),
          },
          { transaction },
        );
        await Environments.update(
          {
            runtime_id: runtime.id,
            current_revision_id: revision.get({ plain: true }).id,
            version: environment.version + 1,
          },
          { where: { id }, transaction },
        );
        return revision.get({ plain: true });
      });
    });
  }
  async metadata(
    id: number,
    input: { expected_version: number; name: string; description: string },
  ) {
    return this.withMutation(id, async () => {
      const environment = await this.environment(id);
      if (environment.version !== input.expected_version)
        throw new RuntimeError('PYTHON_ENV_VERSION_CONFLICT');
      if (environment.state === 'DELETING')
        throw new RuntimeError('PYTHON_ENV_BUSY');
      const duplicate = await Environments.findOne({
        where: { name: input.name },
      });
      if (duplicate && duplicate.get({ plain: true }).id !== id)
        throw new RuntimeError('PYTHON_ENV_NAME_EXISTS');
      await Environments.update(
        {
          name: input.name,
          description: input.description,
          version: environment.version + 1,
        },
        { where: { id } },
      );
      return this.environment(id);
    });
  }
  async clone(id: number, name: string) {
    const environment = await this.environment(id),
      revision = (await Revisions.findByPk(environment.current_revision_id!))!;
    return this.create({
      name,
      description: environment.description,
      runtime_id: revision.get({ plain: true }).runtime_id,
      requirements: revision
        .get({ plain: true })
        .dependencies.map((x) => x.requirement),
    });
  }
  async diff(id: number, from: number, to: number) {
    const a = await this.build(id, from),
      b = await this.build(id, to);
    const before = new Map(a.resolved.map((x) => [x.name, x.version])),
      after = new Map(b.resolved.map((x) => [x.name, x.version]));
    return {
      from: a.id,
      to: b.id,
      added: b.resolved.filter((x) => !before.has(x.name)),
      removed: a.resolved.filter((x) => !after.has(x.name)),
      changed: b.resolved
        .filter((x) => before.has(x.name) && before.get(x.name) !== x.version)
        .map((x) => ({
          name: x.name,
          from: before.get(x.name),
          to: x.version,
        })),
    };
  }
  async diagnostics() {
    const parent = await this.operations.paths.directory(
        'runtime/python/environments',
        true,
      ),
      orphans = [];
    for (const entry of await fs.readdir(parent)) {
      const match = /^env-([1-9][0-9]*)$/.exec(entry);
      if (match) {
        const id = Number(match[1]);
        if (!(await Environments.findByPk(id)))
          orphans.push({ type: 'environment', id });
        else {
          try {
            await this.operations.environments.paths.environment(id);
            const builds = await fs.readdir(path.join(parent, entry, 'builds'));
            for (const name of builds) {
              const m = /^build-([1-9][0-9]*)$/.exec(name);
              if (
                !m ||
                !(await Builds.findOne({
                  where: { id: Number(m[1]), environment_id: id },
                }))
              )
                orphans.push({
                  type: 'build',
                  environment_id: id,
                  id: m ? Number(m[1]) : null,
                });
            }
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
              orphans.push({ type: 'invalid_environment', id });
          }
        }
      } else if (!/^env-[1-9][0-9]*\.json$/.test(entry))
        orphans.push({ type: 'unknown_entry' });
    }
    return {
      orphans,
      cache: 'shared pip download cache',
      shared_package_layer: 'DEFERRED',
      package_index: this.operations.environments.pip.index,
      authenticated_registry: 'NOT_SUPPORTED',
    };
  }
}

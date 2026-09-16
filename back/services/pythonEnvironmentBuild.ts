import { Transaction } from 'sequelize';
import TaskReferenceService from './taskReferences';
import {
  PythonEnvironmentModel as Environments,
  PythonEnvironmentRevisionModel as Revisions,
  PythonEnvironmentBuildModel as Builds,
  PythonEnvironmentBuild,
} from '../data/pythonEnvironment';
import { RuntimeInstallationModel, RuntimeOperation } from '../data/runtime';
import { RuntimeError, runtimeId } from '../shared/runtime';
import {
  PythonEnvironmentOperationType,
  PythonEnvironmentOperationInput,
} from '../shared/pythonEnvironment';
import RuntimePathResolver from './runtimePaths';
import PythonEnvironmentPathResolver from './pythonEnvironmentPaths';
import PythonVenvManager from './pythonVenv';
import PipPackageManager from './pipPackageManager';
import PythonEnvironmentReferenceService from './pythonEnvironmentReferences';
import { ProviderContext } from './pyenvProvider';
import { RuntimeLease } from './runtimeProcess';

/** Resource-specific steps plugged into RuntimeOperation's single executor/recovery loop. */
export default class PythonEnvironmentBuildService {
  readonly paths: PythonEnvironmentPathResolver;
  readonly venv: PythonVenvManager;
  readonly pip: PipPackageManager;
  constructor(paths: RuntimePathResolver, index?: string) {
    this.paths = new PythonEnvironmentPathResolver(paths);
    this.venv = new PythonVenvManager(this.paths);
    this.pip = new PipPackageManager(this.paths, index);
  }
  async prepare(
    type: PythonEnvironmentOperationType,
    input: PythonEnvironmentOperationInput,
    transaction: Transaction,
    leases: RuntimeLease[],
  ) {
    const row = await Environments.findByPk(runtimeId(input.environment_id), {
      transaction,
    });
    if (!row) throw new RuntimeError('PYTHON_ENV_NOT_FOUND', 404);
    const environment = row.get({ plain: true });
    if (environment.version !== input.expected_version)
      throw new RuntimeError('PYTHON_ENV_VERSION_CONFLICT');
    leases.push(await this.paths.lock(environment.id, 'environment'));
    let build: PythonEnvironmentBuild | undefined;
    if (type === 'PYTHON_ENV_BUILD' || type === 'PYTHON_ENV_REBUILD') {
      if (environment.state === 'DELETING')
        throw new RuntimeError('PYTHON_ENV_BUSY');
      const revision = await Revisions.findByPk(
        environment.current_revision_id!,
        { transaction },
      );
      if (
        !revision ||
        revision.get({ plain: true }).environment_id !== environment.id
      )
        throw new RuntimeError('PYTHON_ENV_REVISION_INVALID');
      const runtime = await RuntimeInstallationModel.findByPk(
        revision.get({ plain: true }).runtime_id,
        { transaction },
      );
      if (!runtime || runtime.get({ plain: true }).state !== 'READY')
        throw new RuntimeError('PYTHON_ENV_RUNTIME_INVALID');
      await this.paths.runtime.executable(
        runtime.get({ plain: true }).version,
        runtime.get({ plain: true }).id,
        runtime.get({ plain: true }).provider_id,
      );
      build = (
        await Builds.create(
          {
            environment_id: environment.id,
            revision_id: revision.get({ plain: true }).id,
            runtime_id: revision.get({ plain: true }).runtime_id,
            state: 'QUEUED',
            health: 'UNVERIFIED',
          },
          { transaction },
        )
      ).get({ plain: true });
      await row.update(
        { state: 'BUILDING', last_error: null },
        { transaction },
      );
    } else if (type === 'PYTHON_ENV_DELETE') {
      await new TaskReferenceService().requireUnusedEnvironment('PYTHON', environment.id, transaction);
      const builds = await Builds.findAll({
        where: { environment_id: environment.id },
        transaction,
        order: [['id', 'ASC']],
      });
      // Acquire all before deleting anything. A pinned old generation blocks whole-environment deletion.
      for (const item of builds)
        leases.push(
          await this.paths.lock(item.get({ plain: true }).id, 'build'),
        );
      await row.update({ state: 'DELETING' }, { transaction });
    } else {
      const item = await Builds.findByPk(runtimeId(input.build_id), {
        transaction,
      });
      if (!item || item.get({ plain: true }).environment_id !== environment.id)
        throw new RuntimeError('PYTHON_ENV_BUILD_NOT_FOUND', 404);
      build = item.get({ plain: true });
      leases.push(
        await this.paths.lock(
          build.id,
          'build',
          type === 'PYTHON_ENV_DELETE_BUILD' ? 'exclusive' : 'shared',
        ),
      );
      if (type === 'PYTHON_ENV_DELETE_BUILD') {
        if (environment.current_build_id === build.id)
          throw new RuntimeError('PYTHON_ENV_BUILD_REFERENCED');
        await item.update({ state: 'DELETING' }, { transaction });
      } else if (build.state !== 'READY')
        throw new RuntimeError('PYTHON_ENV_BUILD_NOT_READY');
    }
    return {
      runtime_id: build?.runtime_id ?? environment.runtime_id,
      metadata: {
        environment_id: environment.id,
        build_id: build?.id ?? null,
        expected_version: environment.version,
      },
    };
  }
  async execute(
    ctx: ProviderContext,
    operation: RuntimeOperation,
  ): Promise<(transaction: Transaction) => Promise<void>> {
    ctx = {
      ...ctx,
      environment: { ...ctx.environment, PYTHONDONTWRITEBYTECODE: '1' },
    };
    const id = runtimeId(operation.metadata.environment_id),
      buildId = operation.metadata.build_id;
    if (operation.operation_type === 'PYTHON_ENV_DELETE') {
      await ctx.stage('DELETING_ENVIRONMENT');
      const builds = await Builds.findAll({
        where: { environment_id: id },
        order: [['id', 'ASC']],
      });
      for (const row of builds)
        await this.paths.removeBuild(row.get({ plain: true }));
      await this.paths.removeEnvironment(id);
      return async (transaction) => {
        await Environments.update(
          { current_build_id: null, current_revision_id: null },
          { where: { id }, transaction },
        );
        await Builds.destroy({ where: { environment_id: id }, transaction });
        await Revisions.destroy({ where: { environment_id: id }, transaction });
        await Environments.destroy({ where: { id }, transaction });
      };
    }
    const row = await Builds.findByPk(runtimeId(buildId));
    if (!row || row.get({ plain: true }).environment_id !== id)
      throw new RuntimeError('PYTHON_ENV_BUILD_NOT_FOUND', 404);
    let build = row.get({ plain: true });
    if (operation.operation_type === 'PYTHON_ENV_DELETE_BUILD') {
      await new PythonEnvironmentReferenceService().requireUnusedBuild(
        build.id,
      );
      await ctx.stage('DELETING_BUILD');
      await this.paths.removeBuild(build);
      return async (transaction) => {
        await Builds.destroy({ where: { id: build.id }, transaction });
      };
    }
    const runtime = (
      await RuntimeInstallationModel.findByPk(build.runtime_id)
    )?.get({ plain: true });
    if (!runtime || runtime.state !== 'READY')
      throw new RuntimeError('PYTHON_ENV_RUNTIME_INVALID');
    const revision = (await Revisions.findByPk(build.revision_id))!.get({
      plain: true,
    });
    const creating = ['PYTHON_ENV_BUILD', 'PYTHON_ENV_REBUILD'].includes(
      operation.operation_type,
    );
    if (creating) {
      const disk = await (this.paths.runtime as RuntimePathResolver).root();
      const fs = await import('fs/promises');
      const space = await (
        fs as unknown as {
          statfs(path: string): Promise<{ bavail: number; bsize: number }>;
        }
      ).statfs(disk);
      if (space.bavail * space.bsize < 128 * 1024 * 1024)
        throw new RuntimeError('PYTHON_ENV_DISK_SPACE_LOW');
      await ctx.stage('CREATING_VENV');
      await row.update({ state: 'CREATING' });
      const location = await this.venv.create(ctx, build, runtime);
      await this.venv.verify(ctx, build, runtime);
      await ctx.stage('INSTALLING_DEPENDENCIES');
      await row.update({ state: 'INSTALLING' });
      await this.pip.install(ctx, location.executable, revision.dependencies);
      await row.update({ state: 'VERIFYING' });
    }
    await ctx.stage('VERIFYING_ENVIRONMENT');
    const metadata = await this.venv.verify(ctx, build, runtime);
    const location = await this.paths.executable(build, runtime);
    const snapshot = await this.pip.snapshot(
      ctx,
      location.executable,
      revision.dependencies,
    );
    if (!creating && snapshot.resolved_hash !== build.resolved_hash)
      throw new RuntimeError('PYTHON_ENV_PACKAGES_CHANGED');
    return async (transaction) => {
      if (creating)
        await row.update(
          {
            state: 'READY',
            health: 'HEALTHY',
            ...snapshot,
            metadata: {
              ...metadata,
              spec_hash: revision.spec_hash,
              source_index: this.pip.index,
              build_timestamp: new Date().toISOString(),
            },
            verified_at: new Date(),
            last_error: null,
          },
          { transaction },
        );
      else
        await row.update(
          { health: 'HEALTHY', verified_at: new Date(), last_error: null },
          { transaction },
        );
      if (creating || operation.operation_type === 'PYTHON_ENV_PROMOTE') {
        await Environments.update(
          {
            state: 'READY',
            current_build_id: build.id,
            current_revision_id: build.revision_id,
            runtime_id: build.runtime_id,
            version: Number(operation.metadata.expected_version) + 1,
            last_error: null,
          },
          { where: { id }, transaction },
        );
      } else {
        await Environments.update(
          { state: 'READY', last_error: null },
          { where: { id, current_build_id: build.id }, transaction },
        );
      }
    };
  }
  async cleanupCancelled(operation: RuntimeOperation) {
    if (
      !['PYTHON_ENV_BUILD', 'PYTHON_ENV_REBUILD'].includes(
        operation.operation_type,
      )
    )
      return;
    const row = await Builds.findByPk(Number(operation.metadata.build_id));
    if (row && row.get({ plain: true }).state !== 'READY')
      await this.paths.removeBuild(row.get({ plain: true }));
  }
  async failed(
    operation: RuntimeOperation,
    code: string,
    transaction: Transaction,
    interrupted = false,
  ) {
    const id = Number(operation.metadata.environment_id),
      buildId = Number(operation.metadata.build_id);
    const creating = ['PYTHON_ENV_BUILD', 'PYTHON_ENV_REBUILD'].includes(
      operation.operation_type,
    );
    if (buildId) {
      await Builds.update(
        creating
          ? {
              state: interrupted
                ? 'INTERRUPTED'
                : code === 'RUNTIME_CANCELLED'
                ? 'CANCELLED'
                : 'FAILED',
              health: 'INVALID',
              last_error: code,
            }
          : { health: 'INVALID', last_error: code },
        { where: { id: buildId }, transaction },
      );
    }
    const environment = await Environments.findByPk(id, { transaction });
    if (environment) {
      const current = environment.get({ plain: true }).current_build_id;
      const stillHealthy =
        current &&
        (await Builds.findByPk(current, { transaction }))?.get({ plain: true })
          .health === 'HEALTHY';
      await environment.update(
        {
          state:
            stillHealthy && operation.operation_type !== 'PYTHON_ENV_DELETE'
              ? 'READY'
              : 'ERROR',
          last_error: code,
        },
        { transaction },
      );
    }
  }
}

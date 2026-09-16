import fs from 'fs/promises';
import { createHash } from 'crypto';
import {
  PythonEnvironmentModel,
  PythonEnvironmentBuildModel,
} from '../data/pythonEnvironment';
import { RuntimeInstallationModel } from '../data/runtime';
import { RuntimeError, runtimeId } from '../shared/runtime';
import { RuntimeLease } from './runtimeProcess';
import RuntimeOperationService from './runtimeOperations';
/** Returns an immutable snapshot plus a live shared build FD lease. Caller must release it. No Task consumer in Phase 7. */
export default class PythonEnvironmentResolver {
  constructor(readonly operations: RuntimeOperationService) {}
  async resolve(environmentId: number) {
    const provider = await this.operations.getProvider(),
      providerLease = await RuntimeLease.acquire(
        this.operations.paths,
        provider.id,
      );
    let environmentLease: RuntimeLease | undefined,
      buildLease: RuntimeLease | undefined;
    try {
      environmentLease = await this.operations.environments.paths.lock(
        runtimeId(environmentId),
        'environment',
        'shared',
      );
      const environment = await PythonEnvironmentModel.findByPk(environmentId);
      if (
        !environment ||
        !environment.get({ plain: true }).current_build_id ||
        environment.get({ plain: true }).state === 'DELETING'
      )
        throw new RuntimeError('PYTHON_ENV_NOT_READY');
      const build = await PythonEnvironmentBuildModel.findByPk(
        environment.get({ plain: true }).current_build_id!,
      );
      if (
        !build ||
        build.get({ plain: true }).environment_id !== environmentId ||
        build.get({ plain: true }).state !== 'READY' ||
        build.get({ plain: true }).health !== 'HEALTHY'
      )
        throw new RuntimeError('PYTHON_ENV_NOT_READY');
      buildLease = await this.operations.environments.paths.lock(
        build.get({ plain: true }).id,
        'build',
        'shared',
      );
      const runtime = await RuntimeInstallationModel.findByPk(
        build.get({ plain: true }).runtime_id,
      );
      if (!runtime || runtime.get({ plain: true }).state !== 'READY')
        throw new RuntimeError('PYTHON_ENV_RUNTIME_INVALID');
      const location = await this.operations.environments.paths.executable(
        build.get({ plain: true }),
        runtime.get({ plain: true }),
      );
      if (
        createHash('sha256')
          .update(await fs.readFile(location.base.executable))
          .digest('hex') !==
        runtime.get({ plain: true }).metadata.executable_sha256
      )
        throw new RuntimeError('PYTHON_ENV_RUNTIME_INVALID');
      return {
        snapshot: Object.freeze({
          environment_id: environmentId,
          revision_id: build.get({ plain: true }).revision_id,
          build_id: build.get({ plain: true }).id,
          runtime_id: runtime.get({ plain: true }).id,
          runtime_version: runtime.get({ plain: true }).version,
          python_executable: location.executable,
          venv_root: location.venv,
          resolved_dependency_hash: build.get({ plain: true }).resolved_hash,
        }),
        lease: buildLease,
      };
    } catch (error) {
      await buildLease?.release();
      throw error;
    } finally {
      await environmentLease?.release();
      await providerLease.release();
    }
  }
}

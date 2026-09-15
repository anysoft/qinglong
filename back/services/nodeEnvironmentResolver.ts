import path from 'path';
import NodeEnvironmentService from './nodeEnvironment';
import { RuntimeLease } from './runtimeProcess';
import { RuntimeError, runtimeId } from '../shared/runtime';
import { nodeFileHash, nodeHash } from './nodePaths';
/** Future execution binding only. The caller owns and must release the Build pin. */
export default class NodeEnvironmentResolver {
  constructor(readonly service: NodeEnvironmentService) {}
  async resolve(id: number) {
    const paths = this.service.paths,
      leases: RuntimeLease[] = [];
    let pin: RuntimeLease | undefined;
    try {
      const initial = await this.service.environment(runtimeId(id));
      if (!initial.current_build_id)
        throw new RuntimeError('NODE_ENVIRONMENT_NOT_READY');
      const selected = await this.service.build(initial.current_build_id, id);
      leases.push(await paths.lease('runtime', selected.runtime_id, 'shared'));
      leases.push(
        await paths.lease('toolchain', selected.toolchain_id, 'shared'),
      );
      leases.push(await paths.lease('environment', id, 'shared'));
      const env = await this.service.environment(id);
      if (env.current_build_id !== selected.id)
        throw new RuntimeError('NODE_ENVIRONMENT_CHANGED');
      const build = await this.service.build(selected.id, id);
      if (build.state !== 'READY' || build.health !== 'HEALTHY')
        throw new RuntimeError('NODE_ENVIRONMENT_NOT_READY');
      pin = await paths.lease('build', build.id, 'shared');
      const runtime = await this.service.runtime(build.runtime_id),
        tool = await this.service.toolchain(build.toolchain_id);
      if (
        runtime.state !== 'READY' ||
        tool.state !== 'READY' ||
        tool.runtime_id !== runtime.id
      )
        throw new RuntimeError('NODE_ENVIRONMENT_NOT_READY');
      const runtimeRoot = await paths.assertOwned('runtime', runtime.id),
        executable = await paths.file(runtimeRoot, 'bin/node');
      if (
        (await nodeFileHash(executable)) !== runtime.metadata.executable_sha256
      )
        throw new RuntimeError('NODE_RUNTIME_CHECKSUM_MISMATCH');
      const root = await paths.assertOwned('build', build.id, id);
      await paths.directory(
        paths.relative('build', build.id, id) + '/node_modules',
      );
      if (
        nodeHash(
          await paths.text(root, this.service.packages.lockName(tool)),
        ) !== build.lock_hash ||
        (await paths.text(root, 'package.json')) !== build.package_json ||
        nodeHash(await paths.text(root, '.npmrc')) !==
          build.metadata.config_hash ||
        (tool.manager_type === 'PNPM' &&
          nodeHash(await paths.text(root, 'pnpm-workspace.yaml')) !==
            build.metadata.workspace_hash)
      )
        throw new RuntimeError('NODE_BUILD_INVALID');
      const toolRoot =
          tool.manager_type === 'NPM'
            ? runtimeRoot
            : await paths.assertOwned('toolchain', tool.id),
        cli = await paths.file(
          toolRoot,
          tool.manager_type === 'NPM'
            ? 'lib/node_modules/npm/bin/npm-cli.js'
            : 'node_modules/pnpm/bin/pnpm.cjs',
        );
      if ((await nodeFileHash(cli)) !== tool.metadata.cli_sha256)
        throw new RuntimeError('NODE_TOOLCHAIN_INVALID');
      return {
        snapshot: Object.freeze({
          environment_id: id,
          revision_id: build.revision_id,
          build_id: build.id,
          runtime_id: runtime.id,
          node_version: runtime.version,
          node_executable: executable,
          package_manager: tool.manager_type,
          package_manager_version: tool.version,
          toolchain_id: tool.id,
          build_root: root,
          node_modules_root: path.join(root, 'node_modules'),
          lockfile_identity: build.lock_hash,
        }),
        lease: pin,
      };
    } catch (e) {
      await pin?.release();
      throw e;
    } finally {
      for (const l of leases.reverse()) await l.release();
    }
  }
}

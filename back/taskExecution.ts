import 'reflect-metadata';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import config from './config';
import { sequelize } from './data';
import TaskExecutionPreparationService, {
  TaskExecutionPreparation,
} from './services/taskExecutionPreparation';
import TaskHookLifecycle from './services/taskHookLifecycle';
import ConfigMaterializationService, {
  MaterializationLease,
} from './services/configMaterialization';
import { ScopedEnvironmentError } from './shared/scopedEnv';
import { ConfigAssetError, privateDirectory } from './shared/configAssets';
import { observeChildProcess } from './shared/childProcess';

const output = (text: string) =>
  new Promise<void>((resolve, reject) =>
    process.stdout.write(text, (error) => (error ? reject(error) : resolve())),
  );
async function consumePrepared(file: string) {
  const base = path.join(config.rootPath, '.tmp/task-env');
  if (
    path.dirname(path.dirname(file)) !== base ||
    path.basename(file) !== 'preparation.json' ||
    !/^run-[A-Za-z0-9]+$/.test(path.basename(path.dirname(file)))
  )
    throw new ConfigAssetError('EXECUTION_PREPARATION_INVALID');
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024)
    throw new ConfigAssetError('EXECUTION_PREPARATION_INVALID');
  const plan: TaskExecutionPreparation = JSON.parse(
    await fs.readFile(file, 'utf8'),
  );
  if (plan.version !== 1 || plan.directory !== path.dirname(file))
    throw new ConfigAssetError('EXECUTION_PREPARATION_INVALID');
  const fds = (process.env.PLATFORM_LEASE_FDS ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  const lease: MaterializationLease = {
    resourceKey: plan.workspace.resourceKey,
    exclusive: process.env.PLATFORM_CONFIG_EXCLUSIVE === '1',
    async assertHeld() {
      if (
        !fds.length ||
        fds.some(
          (fd) =>
            !Number.isSafeInteger(fd) ||
            fd < 3 ||
            !fsSync.fstatSync(fd).isFile(),
        )
      )
        throw new ConfigAssetError('CONFIG_LEASE_LOST');
    },
  };
  await lease.assertHeld();
  const materializer = new ConfigMaterializationService();
  if (
    !lease.exclusive &&
    (await fs.readdir(await materializer.journalRoot(plan.workspace))).length
  ) {
    process.exitCode = 76;
    return;
  }
  let materialized: { cleanup: () => Promise<void> } | undefined;
  const lifecycle = new TaskHookLifecycle();
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    lifecycle.cancel();
  };
  process.on('SIGTERM', cancel);
  process.on('SIGINT', cancel);
  try {
    if (lease.exclusive) await materializer.recover(plan.workspace, lease);
    if (plan.configs.length)
      materialized = await materializer.prepare(
        plan.workspace,
        plan.configs,
        lease,
      );
    if (cancelled)
      throw new ConfigAssetError('EXECUTION_CANCELLED_DURING_PREPARE');
    await output(
      `[PREPARE] Materialized ${plan.configs.length} config assets\n`,
    );
    const result = await lifecycle.run(plan, output);
    await output(`[RESULT] ${result.primary ?? 'SUCCESS'}\n`);
    for (const failure of result.failures)
      await output(`[HOOK_RESULT] ${failure.phase} ${failure.reason}\n`);
    process.exitCode = result.code;
  } finally {
    try {
      if (materialized) await materialized.cleanup();
      await output('[CLEANUP] Completed\n');
    } catch {
      process.exitCode = 1;
      await output('CONFIG_RECOVERY_REQUIRED\n');
    }
    process.removeListener('SIGTERM', cancel);
    process.removeListener('SIGINT', cancel);
  }
}
async function startExecution() {
  if (process.argv[2] === '--prepared') return consumePrepared(process.argv[3]);
  const taskId = Number(process.argv[2]),
    timeoutText = process.argv[3] ?? '0';
  const match = /^(\d+)([smh]?)$/.exec(timeoutText);
  if (!Number.isSafeInteger(taskId) || taskId < 0 || !match)
    throw new ConfigAssetError('EXECUTION_ARGUMENT_INVALID');
  const timeout = Number(match[1]) * ({ s: 1, m: 60, h: 3600 }[match[2]] ?? 1);
  const prepared = await new TaskExecutionPreparationService().prepare(
    taskId || null,
    process.argv.slice(4),
    process.env,
    timeout,
  );
  const materializer = new ConfigMaterializationService(),
    journalRoot = await materializer.journalRoot(prepared.plan.workspace);
  let exclusive =
    prepared.plan.configs.length > 0 ||
    (await fs.readdir(journalRoot)).length > 0;
  const lockRoot = path.join(config.dataPath, '.locks');
  await privateDirectory(lockRoot);
  const resources = () => [
    ...(prepared.plan.workspace.publicationId
      ? [
          {
            path: path.join(
              lockRoot,
              `publication-${prepared.plan.workspace.publicationId}.lock`,
            ),
            exclusive: false,
          },
        ]
      : []),
    ...(exclusive
      ? [{ path: path.join(lockRoot, 'config-access.lock'), exclusive: false }]
      : []),
    {
      path: path.join(
        lockRoot,
        `config-${prepared.plan.workspace.resourceKey}.lock`,
      ),
      exclusive,
    },
  ];
  let child: ChildProcessWithoutNullStreams | undefined;
  const cancel = () => child?.kill('SIGTERM');
  process.on('SIGTERM', cancel);
  process.on('SIGINT', cancel);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      child = spawn(
        'python3',
        [
          '-I',
          '-S',
          path.join(config.rootPath, 'shell/execution_lease.py'),
          JSON.stringify(resources()),
          process.execPath,
          __filename,
          '--prepared',
          path.join(prepared.plan.directory, 'preparation.json'),
        ],
        {
          env: {
            ...process.env,
            PLATFORM_CONFIG_EXCLUSIVE: exclusive ? '1' : '0',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      const result = await observeChildProcess(child, {
        onStdout: output,
        onStderr: output,
      }).completed;
      if (result.code === 76 && attempt === 0) {
        exclusive = true;
        continue;
      }
      process.exitCode = result.error ? 1 : result.code ?? 1;
      break;
    }
  } finally {
    process.removeListener('SIGTERM', cancel);
    process.removeListener('SIGINT', cancel);
    await prepared.cleanup();
  }
}
startExecution()
  .catch(async (error) => {
    process.exitCode = 1;
    await output(
      (error instanceof ConfigAssetError ||
      error instanceof ScopedEnvironmentError
        ? error.code
        : 'EXECUTION_PREPARATION_FAILED') + '\n',
    );
  })
  .finally(() => sequelize.close());

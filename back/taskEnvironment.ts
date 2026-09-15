import 'reflect-metadata';
import { sequelize } from './data';
import TaskEnvironmentResolver from './services/taskEnvironmentResolver';
import RepositoryEnvProfileService from './services/repositoryEnvProfile';
import ExecutionEnvironmentTransport from './services/executionEnvironmentTransport';
import { ScopedEnvironmentError } from './shared/scopedEnv';

// Internal shell bridge: stdout is only an opaque per-run directory, never variable values.
async function prepareTaskEnvironment() {
  const id = Number(process.argv[2]);
  const pid = Number(process.argv[3]);
  if (!Number.isSafeInteger(id) || id < 0 || !Number.isSafeInteger(pid) || pid < 0) throw new ScopedEnvironmentError('ENV_TASK_NOT_FOUND');
  const resolved = await new TaskEnvironmentResolver(new RepositoryEnvProfileService()).resolve(id === 0 ? null : id, process.env);
  const snapshot = await new ExecutionEnvironmentTransport().prepare(resolved, pid);
  if (snapshot) process.stdout.write(snapshot.directory);
}
prepareTaskEnvironment().catch(error => {
  process.stderr.write((error instanceof ScopedEnvironmentError ? error.code : 'ENV_SNAPSHOT_FAILED') + '\n');
  process.exitCode = 1;
}).finally(() => sequelize.close());

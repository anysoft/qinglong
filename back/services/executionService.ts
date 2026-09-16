import { runEvent } from './runObservability';
import RunLogService from './runLog';
import { TriggerEventModel, TaskTriggerModel } from '../data/taskTrigger';
import TaskResourceResolver from './taskResourceResolver';
import { randomUUID } from 'crypto';
import { Op, Transaction } from 'sequelize';
import { Container } from 'typedi';
import { sequelize } from '../data';
import { TaskModel, TaskExecutionSettingsModel } from '../data/task';
import {
  TaskRunModel,
  TaskRunAttemptModel,
  TaskRunTrigger,
} from '../data/taskRun';
import { WorktreeModel } from '../data/worktree';
import {
  ExecutionError,
  ExecutionResult,
  executionMetadata,
  safeExecutionError,
  terminalExecutionResult,
} from '../shared/execution';
import { RepositoryPathResolver } from '../shared/workspacePaths';
import ExecutionPaths from './executionPaths';
import ExecutionResolver from './executionResolver';
import ExecutionAttemptCoordinator from './executionAttemptCoordinator';
import ExecutionRedactor from './executionRedactor';
import ExecutionLog from './executionLog';
import ConfigMaterializationService from './configMaterialization';
import ExecutionNodeBinding from './executionNodeBinding';
import { RuntimeLease } from './runtimeProcess';

const activeStates = ['RESOLVING', 'RUNNING', 'RECOVERY_REQUIRED'];
const pendingStates = ['QUEUED', ...activeStates];
export default class ExecutionService {
  private active = new Map<
    number,
    { coordinator: ExecutionAttemptCoordinator; done?: Promise<void> }
  >();
  private timer?: NodeJS.Timeout;
  private ticking = false;
  private closed = false;
  constructor(
    readonly paths = new ExecutionPaths(),
    readonly resolver = new ExecutionResolver(undefined, paths),
  ) {}
  async submit(
    taskId: number,
    trigger: TaskRunTrigger = 'MANUAL',
    eventId?: number,
  ) {
    if (
      !Number.isSafeInteger(taskId) ||
      taskId < 1 ||
      ![
        'MANUAL',
        'SCHEDULE',
        'API',
        'INTERNAL',
        'CRON',
        'WEBHOOK',
        'GIT_UPDATE',
      ].includes(trigger) ||
      ['CRON', 'WEBHOOK', 'GIT_UPDATE'].includes(trigger) !==
        (eventId !== undefined)
    )
      throw new ExecutionError('EXECUTION_SUBMISSION_INVALID', 400);
    const run = await sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        const event =
          eventId === undefined
            ? null
            : await TriggerEventModel.findByPk(eventId, { transaction });
        const submissionKey = event ? `event:${event.id}` : null;
        if (
          eventId !== undefined &&
          (!event || event.task_id !== taskId || event.trigger_type !== trigger)
        )
          throw new ExecutionError('TRIGGER_EVENT_INVALID', 400);
        if (submissionKey) {
          const previous = await TaskRunModel.findOne({
            where: { submission_key: submissionKey },
            transaction,
          });
          if (previous) {
            await event!.update(
              {
                task_run_id: previous.id,
                status: previous.status === 'SKIPPED' ? 'SKIPPED' : 'SUBMITTED',
              },
              { transaction },
            );
            return previous;
          }
        }
        const definition = event?.trigger_id
          ? await TaskTriggerModel.findByPk(event.trigger_id, { transaction })
          : null;
        const task = await TaskModel.findByPk(taskId, { transaction });
        const settings = await TaskExecutionSettingsModel.findByPk(taskId, {
          transaction,
        });
        if (!task || !settings) throw new ExecutionError('TASK_NOT_FOUND', 404);
        const existing = await TaskRunModel.count({
          where: { task_id: taskId, status: pendingStates },
          transaction,
        });
        let skipCode: string | null = null;
        if ((event || trigger === 'SCHEDULE') && !task.enabled)
          skipCode = 'TASK_DISABLED';
        else if (event && (!definition || !definition.enabled))
          skipCode = 'TRIGGER_DISABLED';
        else if (event && !['RECEIVED', 'PROCESSING'].includes(event.status))
          skipCode = 'TRIGGER_EVENT_TERMINAL';
        else if (event) {
          const [resources] = await new TaskResourceResolver().resolve(
            [taskId],
            transaction,
            true,
          );
          if (resources?.readiness.status !== 'READY')
            skipCode = 'TASK_NOT_READY';
          else if (
            event.trigger_type === 'GIT_UPDATE' &&
            (event.metadata.worktree_id !== resources.source?.worktree_id ||
              event.metadata.repository_id !== resources.source?.repository_id)
          )
            skipCode = 'GIT_SOURCE_BINDING_CHANGED';
        }
        if (!skipCode && settings.concurrency === 'FORBID' && existing > 0)
          skipCode = 'TASK_CONCURRENCY_FORBID';
        const skipped = !!skipCode;
        const row = await TaskRunModel.create(
          {
            task_id: taskId,
            trigger_type: trigger,
            trigger_id: event?.trigger_id ?? null,
            event_id: event?.id ?? null,
            submission_key: submissionKey,
            submitted_at: new Date(),
            status: skipped ? 'SKIPPED' : 'QUEUED',
            finished_at: skipped ? new Date() : null,
            result_code: skipped ? 'SKIPPED' : null,
            error_code: skipCode,
            concurrency_policy: settings.concurrency,
            log_identity: randomUUID(),
          },
          { transaction },
        );
        if (skipped)
          await row.update(
            {
              result: terminalExecutionResult(
                row.id,
                'SKIPPED',
                row.error_code!,
                'SUBMIT',
              ) as unknown as Record<string, unknown>,
            },
            { transaction },
          );
        if (event)
          await event.update(
            {
              task_run_id: row.id,
              status: skipped ? 'SKIPPED' : 'SUBMITTED',
              error_code: skipCode,
            },
            { transaction },
          );
        return row;
      },
    );
    return this.dto(run);
  }
  dto(row: InstanceType<typeof TaskRunModel>) {
    const { owner_token, ...publicRow } = row.get({ plain: true });
    return publicRow;
  }
  async get(id: number) {
    const row = await TaskRunModel.findByPk(id);
    if (!row) throw new ExecutionError('TASK_RUN_NOT_FOUND', 404);
    return this.dto(row);
  }
  async list(taskId: number) {
    return (
      await TaskRunModel.findAll({
        where: { task_id: taskId },
        order: [['id', 'DESC']],
        limit: 100,
      })
    ).map((row) => this.dto(row));
  }
  async cancel(id: number) {
    await sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        const run = await TaskRunModel.findByPk(id, { transaction });
        if (!run) throw new ExecutionError('TASK_RUN_NOT_FOUND', 404);
        if (!pendingStates.includes(run.status)) return;
        if (run.status === 'RECOVERY_REQUIRED')
          throw new ExecutionError('EXECUTION_RECOVERY_REQUIRED');
        await run.update(
          {
            cancel_requested: true,
            ...(run.status === 'QUEUED'
              ? {
                  status: 'CANCELLED' as const,
                  finished_at: new Date(),
                  result_code: 'CANCELLED',
                  result: terminalExecutionResult(
                    id,
                    'CANCELLED',
                    'CANCELLED',
                    'QUEUE',
                  ) as unknown as Record<string, unknown>,
                }
              : {}),
          },
          { transaction },
        );
      },
    );
    this.active.get(id)?.coordinator.cancel();
    return this.get(id);
  }
  async cancelTask(taskId: number) {
    const rows = await TaskRunModel.findAll({
      where: { task_id: taskId, status: ['QUEUED', 'RESOLVING', 'RUNNING'] },
    });
    for (const row of rows) await this.cancel(row.id);
  }
  async log(id: number) {
    await this.get(id);
    return ExecutionLog.read(this.paths, id);
  }
  start() {
    if (this.timer) return;
    this.closed = false;
    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        console.error(safeExecutionError(error, 'EXECUTION_DISPATCH_FAILED'));
      });
    }, 250);
    this.timer.unref();
    void this.tick().catch((error) => {
      console.error(safeExecutionError(error, 'EXECUTION_DISPATCH_FAILED'));
    });
  }
  async stop() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    // A claim already awaiting SQLite may add an owner after stop begins.
    while (this.ticking)
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    for (const value of this.active.values()) value.coordinator.cancel();
    await Promise.all([...this.active.values()].map((value) => value.done));
  }
  async tick() {
    if (this.ticking || this.closed) return;
    this.ticking = true;
    try {
      for (const [id, value] of this.active) {
        if ((await TaskRunModel.findByPk(id))?.cancel_requested)
          value.coordinator.cancel();
      }
      await this.recover();
      if (this.active.size >= 8) return;
      const queued = await TaskRunModel.findAll({
        where: { status: 'QUEUED' },
        order: [['id', 'ASC']],
        limit: 100,
      });
      for (const row of queued) {
        if (this.closed || this.active.size >= 8) break;
        let owner: RuntimeLease;
        try {
          owner = await this.paths.owner(row.id);
        } catch (error) {
          if (safeExecutionError(error) === 'RUNTIME_BUSY') continue;
          throw error;
        }
        const token = randomUUID();
        let claimed = false;
        try {
          claimed = await sequelize.transaction(
            { type: Transaction.TYPES.IMMEDIATE },
            async (transaction) => {
              const run = await TaskRunModel.findByPk(row.id, { transaction });
              if (!run || run.status !== 'QUEUED' || run.cancel_requested)
                return false;
              const running = await TaskRunModel.findAll({
                where: { task_id: run.task_id, status: activeStates },
                transaction,
              });
              if (
                running.some(
                  (other) =>
                    other.status === 'RECOVERY_REQUIRED' ||
                    other.concurrency_policy !== 'ALLOW',
                ) ||
                (running.length && run.concurrency_policy !== 'ALLOW')
              )
                return false;
              if (
                run.concurrency_policy !== 'ALLOW' &&
                (await TaskRunModel.count({
                  where: {
                    task_id: run.task_id,
                    status: 'QUEUED',
                    id: { [Op.lt]: run.id },
                  },
                  transaction,
                }))
              )
                return false;
              await run.update(
                {
                  status: 'RESOLVING',
                  owner_token: token,
                  started_at: new Date(),
                },
                { transaction },
              );
              return true;
            },
          );
          if (claimed) {
            const value: {
              coordinator: ExecutionAttemptCoordinator;
              done?: Promise<void>;
            } = { coordinator: new ExecutionAttemptCoordinator(this.paths) };
            this.active.set(row.id, value);
            value.done = this.execute(
              row.id,
              row.task_id!,
              token,
              owner,
              value.coordinator,
            ).finally(() => this.active.delete(row.id));
            // The durable outcome is written by execute; never let an unhandled rejection crash another run.
            void value.done.catch(() => {});
          }
        } finally {
          if (!claimed) await owner.release();
        }
      }
    } finally {
      this.ticking = false;
    }
  }
  private async execute(
    id: number,
    taskId: number,
    token: string,
    owner: RuntimeLease,
    coordinator: ExecutionAttemptCoordinator,
  ) {
    let resolved: Awaited<ReturnType<ExecutionResolver['resolve']>> | undefined,
      log: ExecutionLog | undefined;
    let final: ExecutionResult | undefined;
    try {
      resolved = await this.resolver.resolve(taskId, id);
      const context = resolved.context;
      resolved.materializationLease.processLeaseFds = [
        owner,
        ...resolved.leases,
      ].map((lease) => lease.handle.fd);
      await TaskRunModel.update(
        {
          task_definition_version: context.identity.taskDefinitionVersion,
          snapshot_metadata: executionMetadata(context),
          worktree_id: context.source.worktreeId,
        },
        { where: { id, owner_token: token } },
      );
      log = await ExecutionLog.open(this.paths, id);
      const redactor = new ExecutionRedactor([], (text) => log!.write(text));
      redactor.add([...context.secretValues]);
      for (
        let attempt = 1;
        attempt <= context.settings.max_attempts;
        attempt++
      ) {
        if ((await TaskRunModel.findByPk(id))?.cancel_requested)
          coordinator.cancel();
        await sequelize.transaction(
          { type: Transaction.TYPES.IMMEDIATE },
          async (transaction) => {
            await TaskRunModel.update(
              { status: 'RUNNING', attempt_count: attempt },
              { where: { id, owner_token: token }, transaction },
            );
            await TaskRunAttemptModel.create(
              {
                task_run_id: id,
                attempt_number: attempt,
                status: 'RUNNING',
                started_at: new Date(),
              },
              { transaction },
            );
          },
        );
        final = await coordinator.run(
          context,
          attempt,
          [owner, ...resolved.leases],
          resolved.materializationLease,
          redactor,
        );
        await TaskRunAttemptModel.update(
          {
            status: final.status,
            finished_at: new Date(final.finishedAt),
            exit_code: final.exitCode,
            signal: final.signal,
            error_code: final.primaryError?.code ?? null,
            error_summary: final.primaryError?.code ?? null,
            duration_ms: final.duration,
          },
          { where: { task_run_id: id, attempt_number: attempt } },
        );
        const retry = coordinator.retry(final, context);
        await sequelize.query('UPDATE TaskRunAttempts SET result=:result,retry_decision=:retry WHERE task_run_id=:id AND attempt_number=:attempt', { replacements: { id, attempt, result: JSON.stringify(final), retry } });
        if (!retry) break;
        const delay = Math.min(
          3600,
          context.settings.initial_delay_seconds *
            (context.settings.backoff === 'EXPONENTIAL'
              ? 2 ** (attempt - 1)
              : 1),
        );
        await runEvent(id, 'RETRY_SCHEDULED', {attempt, retry_delay: delay});
        await sequelize.query('UPDATE TaskRunAttempts SET retry_delay=:delay WHERE task_run_id=:id AND attempt_number=:attempt', {replacements:{id,attempt,delay}});
        await redactor.write(`[RETRY ${attempt + 1} IN ${delay}s]\n`);
        await redactor.flush();
        await coordinator.backoff(delay);
        if (coordinator.isCancelled) {
          final.status = 'CANCELLED';
          final.cancelled = true;
          final.primaryError = { phase: 'BACKOFF', code: 'CANCELLED' };
          break;
        }
      }
      await redactor.flush();
      await log.close();
      log = undefined;
      await new RunLogService(this.paths).metadata(id);
      if (!final) throw new ExecutionError('EXECUTION_RESULT_MISSING');
      await TaskRunModel.update(
        {
          status: final.status,
          finished_at: new Date(),
          result_code: final.status,
          exit_code: final.exitCode,
          signal: final.signal,
          error_code: final.primaryError?.code ?? null,
          error_summary: final.primaryError?.code ?? null,
          result: final as unknown as Record<string, unknown>,
          owner_token: null,
          worktree_id:
            final.status === 'RECOVERY_REQUIRED'
              ? context.source.worktreeId
              : null,
        },
        { where: { id, owner_token: token } },
      );

    } catch (error) {
      const code = safeExecutionError(error);
      const busy =
        [
          'RUNTIME_BUSY',
          'PYTHON_ENV_BUSY',
          'NODE_ENVIRONMENT_CHANGED',
          'EXECUTION_SNAPSHOT_CHANGED',
        ].includes(code) && !resolved;
      const cancelled = coordinator.isCancelled;
      if (busy && !cancelled) {
        await TaskRunModel.update(
          { status: 'QUEUED', owner_token: null, started_at: null },
          { where: { id, owner_token: token } },
        );
      } else {
        const row = await TaskRunModel.findByPk(id);
        const status =
          resolved || code.includes('RECOVERY_REQUIRED')
            ? 'RECOVERY_REQUIRED'
            : cancelled
            ? 'CANCELLED'
            : 'FAILED';
        const outcome = terminalExecutionResult(
          id,
          status,
          code,
          'RESOLVE',
          row?.started_at,
          row?.attempt_count,
        );
        await TaskRunModel.update(
          {
            status,
            owner_token: null,
            finished_at: new Date(),
            error_code: code,
            error_summary: code,
            result_code: status,
            result: outcome as unknown as Record<string, unknown>,
            ...(status === 'RECOVERY_REQUIRED' ? {} : { worktree_id: null }),
          },
          { where: { id, owner_token: token } },
        );
      }
    } finally {
      try {
        await log?.close();
      } finally {
        try {
          await resolved?.release();
        } finally {
          await owner.release();
        }
      }
    }
  }
  async recover() {
    const rows = await TaskRunModel.findAll({
      where: { status: activeStates },
      order: [['id', 'ASC']],
    });
    for (const row of rows) {
      if (this.active.has(row.id)) continue;
      let owner: RuntimeLease;
      try {
        owner = await this.paths.owner(row.id);
      } catch (error) {
        if (safeExecutionError(error) === 'RUNTIME_BUSY') continue;
        throw error;
      }
      let workspaceLease: RuntimeLease | undefined;
      try {
        const current = await TaskRunModel.findByPk(row.id);
        if (
          !current ||
          !activeStates.includes(current.status) ||
          current.owner_token !== row.owner_token
        )
          continue;
        await runEvent(row.id, 'RECOVERY_STARTED');
        if (current.worktree_id) {
          workspaceLease = await this.paths.worktree(current.worktree_id);
          const worktree = await WorktreeModel.findByPk(current.worktree_id);
          if (!worktree)
            throw new ExecutionError('EXECUTION_RECOVERY_REQUIRED');
          const root = await new RepositoryPathResolver(
            this.paths.dataRoot,
          ).worktree(worktree.repository_id, current.worktree_id);
          if (worktree.local_path !== root)
            throw new ExecutionError('EXECUTION_RECOVERY_REQUIRED');
          const lease = this.paths.materializationLease(
            current.worktree_id,
            workspaceLease,
          );
          await new ConfigMaterializationService().recover(
            {
              workspaceRoot: root,
              taskDir: root,
              cwd: root,
              resourceKey: lease.resourceKey,
            },
            lease,
          );
          await new ExecutionNodeBinding(this.paths).recover(
            current.worktree_id,
            root,
            lease,
          );
        }
        await this.paths.cleanupRunDirectory(row.id);
        await runEvent(row.id, 'RECOVERY_FINISHED');
        await sequelize.transaction(
          { type: Transaction.TYPES.IMMEDIATE },
          async (transaction) => {
            await TaskRunAttemptModel.update(
              {
                status: 'INTERRUPTED',
                finished_at: new Date(),
                error_code: 'EXECUTION_INTERRUPTED',
              },
              {
                where: { task_run_id: row.id, status: 'RUNNING' },
                transaction,
              },
            );
            await TaskRunModel.update(
              {
                status: 'INTERRUPTED',
                finished_at: new Date(),
                owner_token: null,
                worktree_id: null,
                result_code: 'INTERRUPTED',
                error_code: 'EXECUTION_INTERRUPTED',
                result: terminalExecutionResult(
                  row.id,
                  'INTERRUPTED',
                  'EXECUTION_INTERRUPTED',
                  'RECOVERY',
                  current.started_at,
                  current.attempt_count,
                ) as unknown as Record<string, unknown>,
              },
              {
                where: {
                  id: row.id,
                  status: activeStates,
                  owner_token: row.owner_token,
                },
                transaction,
              },
            );
          },
        );
      } catch (error) {
        if (safeExecutionError(error) !== 'RUNTIME_BUSY')
          await TaskRunModel.update(
            {
              status: 'RECOVERY_REQUIRED',
              result_code: 'RECOVERY_REQUIRED',
              error_code: 'EXECUTION_RECOVERY_REQUIRED',
              result: terminalExecutionResult(
                row.id,
                'RECOVERY_REQUIRED',
                'EXECUTION_RECOVERY_REQUIRED',
                'RECOVERY',
                row.started_at,
                row.attempt_count,
              ) as unknown as Record<string, unknown>,
            },
            {
              where: {
                id: row.id,
                status: activeStates,
                owner_token: row.owner_token,
              },
            },
          );
      } finally {
        await workspaceLease?.release();
        await owner.release();
      }
    }
  }
}
export const executionService = new ExecutionService();

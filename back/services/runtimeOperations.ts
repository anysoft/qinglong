import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import { sequelize } from '../data';
import {
  RuntimeProviderModel,
  RuntimeInstallationModel,
  RuntimeOperationModel,
  RuntimeProvider,
  RuntimeInstallation,
  RuntimeOperation,
  OperationType,
} from '../data/runtime';
import {
  RuntimeError,
  runtimeId,
  exactPythonVersion,
  RUNTIME_TIMEOUT_SECONDS,
} from '../shared/runtime';
import PyenvProvider, { ProviderContext } from './pyenvProvider';
import RuntimePathResolver from './runtimePaths';
import { RuntimeLease, RuntimeCommand } from './runtimeProcess';
import RuntimeOperationLog from './runtimeLog';
import runtimeBuildEnvironment from './runtimeBuildEnvironment';
import RuntimeReferenceService from './runtimeReferences';
import RuntimeDiagnosticsService from './runtimeDiagnostics';

const activeStates = ['QUEUED', 'RUNNING'];
const kinds: OperationType[] = [
  'PROVIDER_INSTALL',
  'PROVIDER_UPDATE',
  'PROVIDER_VERIFY',
  'PROVIDER_REPAIR',
  'CATALOG_REFRESH',
  'RUNTIME_INSTALL',
  'RUNTIME_VERIFY',
  'RUNTIME_REMOVE',
  'RUNTIME_REPAIR',
];
type Active = {
  lease: RuntimeLease;
  command?: RuntimeCommand;
  done?: Promise<void>;
};
/** Database-tracked resource operations; leases and inherited FDs prove ownership. */
export default class RuntimeOperationService {
  readonly paths: RuntimePathResolver;
  readonly diagnostics: RuntimeDiagnosticsService;
  private active = new Map<number, Active>();
  private recoveryTimer?: NodeJS.Timeout;
  private recovering = false;
  constructor(
    readonly provider = new PyenvProvider(),
    readonly references = new RuntimeReferenceService(),
  ) {
    this.paths = provider.paths;
    this.diagnostics = new RuntimeDiagnosticsService(this.paths);
  }
  async getProvider() {
    const [model] = await RuntimeProviderModel.findOrCreate({
      where: { language: 'PYTHON', provider_type: 'PYENV' },
      defaults: {
        language: 'PYTHON',
        provider_type: 'PYENV',
        state: 'UNINITIALIZED',
        install_root: 'runtime/python/pyenv',
        catalog: [],
        version: 1,
      },
    });
    return model.get({ plain: true });
  }
  async operation(id: number) {
    const row = await RuntimeOperationModel.findByPk(runtimeId(id));
    if (!row) throw new RuntimeError('RUNTIME_OPERATION_NOT_FOUND', 404);
    return row.get({ plain: true });
  }
  async filesystemDiagnostics() {
    const provider = await this.getProvider();
    let entries: string[] = [];
    try {
      entries = await fs.readdir(
        await this.paths.directory('runtime/python/pyenv/versions'),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        return { state: 'INVALID', orphans: [] };
    }
    const rows = await RuntimeInstallationModel.findAll({
      where: { provider_id: provider.id, state: { [Op.ne]: 'REMOVED' } },
    });
    const known = new Set(rows.map((x) => x.get('version')));
    return {
      state: 'CHECKED',
      orphans: entries
        .filter((name) => !known.has(name))
        .map((name) => {
          try {
            return { version: exactPythonVersion(name), state: 'ORPHAN' };
          } catch {
            return { version: null, state: 'UNKNOWN_ENTRY' };
          }
        }),
    };
  }
  async providerHealth() {
    const provider = await this.getProvider();
    let health = provider.state === 'UNINITIALIZED' ? 'MISSING' : 'INVALID';
    if (['INSTALLING', 'UPDATING'].includes(provider.state)) health = 'BUSY';
    else if (provider.provider_revision)
      try {
        await this.paths.provider(false, provider.id);
        await this.paths.directory(
          'runtime/python/pyenv/providers/' +
            provider.provider_revision +
            '/.git',
        );
        health = provider.state === 'READY' ? 'HEALTHY' : 'INVALID';
      } catch (error) {
        health =
          (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'MISSING'
            : 'INVALID';
      }
    return { ...provider, health };
  }
  async operations() {
    return (
      await RuntimeOperationModel.findAll({
        order: [['id', 'DESC']],
        limit: 100,
      })
    ).map((x) => x.get({ plain: true }));
  }
  async runtime(id: number) {
    const row = await RuntimeInstallationModel.findByPk(runtimeId(id));
    if (!row || row.get('state') === 'REMOVED')
      throw new RuntimeError('RUNTIME_NOT_FOUND', 404);
    return row.get({ plain: true });
  }
  async runtimes() {
    const rows = await RuntimeInstallationModel.findAll({
      where: { state: { [Op.ne]: 'REMOVED' } },
      order: [['id', 'DESC']],
    });
    return Promise.all(
      rows.map(async (row) => {
        const runtime = row.get({ plain: true });
        let health = 'INVALID';
        if (['INSTALLING', 'VERIFYING', 'REMOVING'].includes(runtime.state))
          health = 'BUSY';
        else
          try {
            await this.paths.executable(
              runtime.version,
              runtime.id,
              runtime.provider_id,
            );
            health = runtime.state === 'READY' ? 'HEALTHY' : 'INVALID';
          } catch (error) {
            health =
              (error as NodeJS.ErrnoException).code === 'ENOENT'
                ? 'MISSING'
                : 'INVALID';
          }
        return { ...runtime, health };
      }),
    );
  }
  async request(
    type: OperationType,
    input: {
      runtime_id?: number;
      version?: string;
      jobs?: number;
      timeout_seconds?: number;
    } = {},
  ) {
    if (!kinds.includes(type))
      throw new RuntimeError('RUNTIME_REQUEST_INVALID', 400);
    const jobs = input.jobs ?? 4,
      timeout = input.timeout_seconds ?? RUNTIME_TIMEOUT_SECONDS;
    if (
      !Number.isSafeInteger(jobs) ||
      jobs < 1 ||
      jobs > 16 ||
      !Number.isSafeInteger(timeout) ||
      timeout < 1 ||
      timeout > 7200
    )
      throw new RuntimeError('RUNTIME_REQUEST_INVALID', 400);
    const initial = await this.getProvider(),
      lease = await RuntimeLease.acquire(this.paths, initial.id);
    try {
      await this.recoverLocked(initial.id);
      const provider = (await RuntimeProviderModel.findByPk(initial.id))!.get({
        plain: true,
      });
      let runtime: RuntimeInstallation | null = null;
      if (type === 'RUNTIME_INSTALL') {
        exactPythonVersion(input.version);
        if (provider.state !== 'READY' || !provider.provider_revision)
          throw new RuntimeError('RUNTIME_PROVIDER_NOT_READY');
        if (!provider.catalog.includes(input.version!))
          throw new RuntimeError('RUNTIME_VERSION_UNAVAILABLE', 400);
        const existing = await RuntimeInstallationModel.findOne({
          where: {
            provider_id: provider.id,
            implementation: 'CPYTHON',
            version: input.version,
          },
        });
        if (existing && existing.get('state') !== 'REMOVED')
          throw new RuntimeError('RUNTIME_ALREADY_INSTALLED');
        runtime = existing?.get({ plain: true }) ?? null;
      } else if (type.startsWith('RUNTIME_')) {
        runtime = await this.runtime(runtimeId(input.runtime_id));
        if (runtime.provider_id !== provider.id)
          throw new RuntimeError('RUNTIME_NOT_FOUND', 404);
        if (['INSTALLING', 'VERIFYING', 'REMOVING'].includes(runtime.state))
          throw new RuntimeError('RUNTIME_BUSY');
        if (type === 'RUNTIME_REMOVE' || type === 'RUNTIME_REPAIR')
          await this.references.requireUnused(runtime.id);
        if (
          type === 'RUNTIME_REPAIR' &&
          (provider.state !== 'READY' ||
            !provider.provider_revision ||
            !provider.catalog.includes(runtime.version))
        )
          throw new RuntimeError('RUNTIME_PROVIDER_NOT_READY');
      } else {
        if (type === 'PROVIDER_INSTALL' && provider.state === 'READY')
          throw new RuntimeError('RUNTIME_PROVIDER_ALREADY_READY');
        if (
          ['PROVIDER_UPDATE', 'PROVIDER_VERIFY', 'CATALOG_REFRESH'].includes(
            type,
          ) &&
          !provider.provider_revision
        )
          throw new RuntimeError('RUNTIME_PROVIDER_NOT_READY');
      }
      const operation = await sequelize.transaction(async (transaction) => {
        if (type === 'RUNTIME_INSTALL') {
          if (runtime)
            await RuntimeInstallationModel.update(
              { state: 'INSTALLING', last_error: null },
              { where: { id: runtime.id }, transaction },
            );
          else
            runtime = (
              await RuntimeInstallationModel.create(
                {
                  provider_id: provider.id,
                  language: 'PYTHON',
                  implementation: 'CPYTHON',
                  version: input.version!,
                  state: 'INSTALLING',
                  executable_relative_path: 'bin/python',
                  metadata: {},
                },
                { transaction },
              )
            ).get({ plain: true });
        } else if (runtime) {
          await RuntimeInstallationModel.update(
            {
              state:
                type === 'RUNTIME_REMOVE'
                  ? 'REMOVING'
                  : type === 'RUNTIME_VERIFY'
                  ? 'VERIFYING'
                  : 'INSTALLING',
            },
            { where: { id: runtime.id }, transaction },
          );
        }
        if (
          ['PROVIDER_INSTALL', 'PROVIDER_UPDATE', 'PROVIDER_REPAIR'].includes(
            type,
          )
        )
          await RuntimeProviderModel.update(
            { state: type === 'PROVIDER_INSTALL' ? 'INSTALLING' : 'UPDATING' },
            { where: { id: provider.id }, transaction },
          );
        const token = randomUUID();
        const row = await RuntimeOperationModel.create(
          {
            provider_id: provider.id,
            runtime_id: runtime?.id ?? null,
            operation_type: type,
            status: 'QUEUED',
            stage: 'QUEUED',
            owner_token: token,
            owner_pid: process.pid,
            cancel_requested: false,
            log_identity: 'pending-' + token,
            metadata: {
              jobs,
              timeout_seconds: timeout,
              requested_version: runtime?.version ?? input.version ?? null,
              target_revision: this.provider.revision,
            },
          },
          { transaction },
        );
        await row.update(
          { log_identity: 'runtime-operation-' + row.get('id') },
          { transaction },
        );
        return row.get({ plain: true });
      });
      const active: Active = { lease };
      this.active.set(operation.id, active);
      active.done = new Promise<void>((resolve) =>
        setImmediate(() => {
          this.execute(operation, provider, runtime, active).then(
            resolve,
            resolve,
          );
        }),
      );
      return operation;
    } catch (error) {
      await lease.release();
      throw error;
    }
  }
  async cancel(id: number) {
    const operation = await this.operation(id);
    if (!activeStates.includes(operation.status))
      throw new RuntimeError('RUNTIME_OPERATION_FINISHED');
    await RuntimeOperationModel.update(
      { cancel_requested: true },
      { where: { id: operation.id, status: { [Op.in]: activeStates } } },
    );
    this.active.get(operation.id)?.command?.cancel();
    return this.operation(id);
  }
  async wait(id: number) {
    await this.active.get(id)?.done;
    return this.operation(id);
  }
  private async execute(
    operation: RuntimeOperation,
    provider: RuntimeProvider,
    runtime: RuntimeInstallation | null,
    active: Active,
  ) {
    let log: RuntimeOperationLog | undefined,
      timer: NodeJS.Timeout | undefined,
      directory: string | undefined;
    try {
      await RuntimeOperationModel.update(
        { status: 'RUNNING', started_at: new Date(), stage: 'PREPARING' },
        { where: { id: operation.id } },
      );
      directory = await this.paths.operation(operation.id);
      const home = await this.paths.directory(
        `tmp/runtime/python/operation-${operation.id}/home`,
        true,
      );
      log = await RuntimeOperationLog.open(this.paths, operation.id, home);
      await this.paths.provider(
        ['PROVIDER_INSTALL', 'PROVIDER_REPAIR'].includes(
          operation.operation_type,
        ),
        provider.id,
      );
      const build = await runtimeBuildEnvironment(
        this.paths,
        operation.id,
        Number(operation.metadata.jobs),
        provider.id,
      );
      active.command = new RuntimeCommand(
        active.lease,
        Number(operation.metadata.timeout_seconds),
        (text) => log!.write(text),
      );
      const checkCancel = async () => {
        if ((await this.operation(operation.id)).cancel_requested) {
          active.command!.cancel();
          throw new RuntimeError('RUNTIME_CANCELLED');
        }
      };
      timer = setInterval(() => {
        checkCancel().catch(() => active.command?.cancel());
      }, 250);
      timer.unref();
      const ctx: ProviderContext = {
        id: operation.id,
        providerId: provider.id,
        ...build,
        command: active.command,
        stage: async (stage) => {
          await checkCancel();
          await RuntimeOperationModel.update(
            { stage },
            { where: { id: operation.id } },
          );
          await log!.write(`[${stage}]\n`);
        },
      };
      await ctx.stage('PREPARING');
      let metadata: Record<string, unknown> | undefined,
        providerUpdate: Partial<RuntimeProvider> | undefined;
      const revision = provider.provider_revision!;
      switch (operation.operation_type) {
        case 'PROVIDER_INSTALL':
        case 'PROVIDER_UPDATE':
        case 'PROVIDER_REPAIR': {
          const result = await this.provider.setup(
            ctx,
            operation.operation_type === 'PROVIDER_REPAIR',
          );
          await ctx.stage('REFRESHING_CATALOG');
          providerUpdate = {
            state: 'READY',
            provider_revision: result.revision,
            provider_version: result.release,
            catalog: await this.provider.catalog(ctx, result.revision),
            last_refresh_at: new Date(),
            last_verified_at: new Date(),
            last_error: null,
          };
          break;
        }
        case 'PROVIDER_VERIFY':
          await ctx.stage('VERIFYING');
          await this.provider.verifyProvider(ctx, revision);
          providerUpdate = {
            state: 'READY',
            last_verified_at: new Date(),
            last_error: null,
          };
          break;
        case 'CATALOG_REFRESH':
          await ctx.stage('REFRESHING_CATALOG');
          await this.provider.verifyProvider(ctx, revision);
          providerUpdate = {
            catalog: await this.provider.catalog(ctx, revision),
            last_refresh_at: new Date(),
            last_error: null,
          };
          break;
        case 'RUNTIME_INSTALL':
          await this.diagnostics.beforeInstall();
          await this.provider.verifyProvider(ctx, revision);
          metadata = await this.provider.install(ctx, runtime!, revision);
          break;
        case 'RUNTIME_VERIFY':
          await ctx.stage('VERIFYING');
          metadata = await this.provider.verify(ctx, runtime!);
          break;
        case 'RUNTIME_REMOVE':
          await ctx.stage('REMOVING');
          await this.references.requireUnused(runtime!.id);
          await this.provider.uninstall(ctx, runtime!);
          break;
        case 'RUNTIME_REPAIR':
          await this.diagnostics.beforeInstall();
          await this.references.requireUnused(runtime!.id);
          await this.provider.verifyProvider(ctx, revision);
          await ctx.stage('REPAIRING');
          metadata = await this.provider.repair(ctx, runtime!, revision);
          break;
      }
      await checkCancel();
      await log.close();
      log = undefined;
      await sequelize.transaction(async (transaction) => {
        if (providerUpdate)
          await RuntimeProviderModel.update(
            { ...providerUpdate, version: provider.version + 1 },
            { where: { id: provider.id }, transaction },
          );
        if (runtime)
          await RuntimeInstallationModel.update(
            operation.operation_type === 'RUNTIME_REMOVE'
              ? { state: 'REMOVED', last_error: null }
              : {
                  state: 'READY',
                  verified_at: new Date(),
                  installed_at: runtime.installed_at ?? new Date(),
                  metadata: {
                    ...runtime.metadata,
                    ...metadata,
                    ...(operation.operation_type === 'RUNTIME_VERIFY'
                      ? {}
                      : {
                          provider_revision: revision,
                          build_timestamp: new Date().toISOString(),
                        }),
                  },
                  last_error: null,
                },
            { where: { id: runtime.id }, transaction },
          );
        await RuntimeOperationModel.update(
          {
            status: 'SUCCESS',
            stage: 'COMPLETE',
            finished_at: new Date(),
            exit_code: 0,
          },
          { where: { id: operation.id }, transaction },
        );
      });
    } catch (error) {
      const code =
        error instanceof RuntimeError
          ? error.error_code
          : (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'RUNTIME_MISSING'
          : 'RUNTIME_OPERATION_FAILED';
      await log?.write(`[${code}]\n`).catch(() => {});
      await sequelize
        .transaction(async (transaction) => {
          await RuntimeOperationModel.update(
            {
              status: code === 'RUNTIME_CANCELLED' ? 'CANCELLED' : 'FAILED',
              stage: 'COMPLETE',
              finished_at: new Date(),
              exit_code:
                code === 'RUNTIME_TIMEOUT'
                  ? 124
                  : code === 'RUNTIME_CANCELLED'
                  ? 143
                  : error instanceof RuntimeError
                  ? error.exit_code ?? 1
                  : 1,
              error_code: code,
              error_summary: code,
            },
            { where: { id: operation.id }, transaction },
          );
          if (runtime)
            await RuntimeInstallationModel.update(
              {
                state: code === 'RUNTIME_MISSING' ? 'MISSING' : 'ERROR',
                last_error: code,
              },
              { where: { id: runtime.id }, transaction },
            );
          else
            await RuntimeProviderModel.update(
              {
                state:
                  operation.operation_type === 'CATALOG_REFRESH'
                    ? provider.state
                    : 'ERROR',
                last_error: code,
              },
              { where: { id: provider.id }, transaction },
            );
        })
        .catch(() => {
          /* A retained RUNNING row is reconciled under the lease after DB recovery. */
        });
    } finally {
      if (timer) clearInterval(timer);
      await log?.close().catch(() => {});
      if (directory)
        try {
          await this.paths.directory(
            `tmp/runtime/python/operation-${operation.id}`,
          );
          await fs.rm(directory, { recursive: true, force: true });
        } catch {
          await RuntimeOperationModel.update(
            {
              error_code: 'RUNTIME_CLEANUP_FAILED',
              error_summary: 'RUNTIME_CLEANUP_FAILED',
              stage: 'CLEANUP_REQUIRED',
            },
            { where: { id: operation.id } },
          ).catch(() => {});
        }
      await active.lease.release();
      this.active.delete(operation.id);
    }
  }
  private async recoverLocked(provider: number) {
    const rows = await RuntimeOperationModel.findAll({
      where: { provider_id: provider, status: { [Op.in]: activeStates } },
    });
    if (!rows.length) return;
    await sequelize.transaction(async (transaction) => {
      for (const row of rows) {
        const operation = row.get({ plain: true });
        await row.update(
          {
            status: 'INTERRUPTED',
            stage: 'RECOVERY_REQUIRED',
            finished_at: new Date(),
            error_code: 'RUNTIME_INTERRUPTED',
            error_summary: 'RUNTIME_INTERRUPTED',
          },
          { transaction },
        );
        if (operation.runtime_id)
          await RuntimeInstallationModel.update(
            { state: 'ERROR', last_error: 'RUNTIME_INTERRUPTED' },
            { where: { id: operation.runtime_id }, transaction },
          );
        else
          await RuntimeProviderModel.update(
            { state: 'ERROR', last_error: 'RUNTIME_INTERRUPTED' },
            { where: { id: provider }, transaction },
          );
      }
    });
  }
  async recover() {
    if (this.recovering) return;
    this.recovering = true;
    try {
      const pending = await RuntimeOperationModel.findAll({
        where: { status: { [Op.in]: activeStates } },
        attributes: ['provider_id'],
      });
      const ids: number[] = [
        ...new Set<number>(pending.map((x) => Number(x.get('provider_id')))),
      ];
      const providers = await RuntimeProviderModel.findAll({
        where: { id: { [Op.in]: ids } },
      });
      for (const provider of providers) {
        let lease: RuntimeLease | undefined;
        try {
          lease = await RuntimeLease.acquire(
            this.paths,
            Number(provider.get('id')),
          );
          await this.recoverLocked(Number(provider.get('id')));
        } catch (error) {
          if (
            !(error instanceof RuntimeError) ||
            error.error_code !== 'RUNTIME_BUSY'
          )
            throw error;
        } finally {
          await lease?.release();
        }
      }
    } finally {
      this.recovering = false;
    }
  }
  startRecovery() {
    if (!this.recoveryTimer) {
      void this.recover().catch(() => {});
      this.recoveryTimer = setInterval(() => {
        void this.recover().catch(() => {});
      }, 1000);
      this.recoveryTimer.unref();
    }
  }
  async close() {
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    for (const item of this.active.values()) item.command?.cancel();
    await Promise.all([...this.active.values()].map((x) => x.done));
  }
}

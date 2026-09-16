import discoveryRoutes from './discovery';
import taskTriggerRoutes from './taskTriggers';
import { triggerScheduler } from '../services/triggerScheduler';
import { executionService } from '../services/executionService';
import { Router, Request, Response } from 'express';
import { Container } from 'typedi';
import fs from 'fs/promises';
import path from 'path';
import TaskService from '../services/task';
import { sequelize } from '../data';
import { Transaction } from 'sequelize';
import TaskExecutionBridge from '../services/taskExecutionBridge';
import WorktreeService from '../services/worktree';
import TaskReferenceService from '../services/taskReferences';
import TaskResourceValidator from '../services/taskResourceValidator';
import {
  RuntimeDefaultModel,
  TaskModel,
  TaskRuntimeBindingModel,
  TaskSourceModel,
} from '../data/task';
import { TaskDefinitionError } from '../shared/taskDefinition';

function identifier(value: unknown) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)))
    throw new TaskDefinitionError('TASK_ID_INVALID');
  return Number(value);
}
function endpoint(action: (request: Request) => Promise<unknown>) {
  return async (request: Request, response: Response) => {
    try {
      if (/^\/open\//i.test(request.originalUrl))
        throw new TaskDefinitionError('PANEL_SESSION_REQUIRED', 403);
      response.send({ code: 200, data: await action(request) });
    } catch (error: any) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      response.status(status).send({
        code: status,
        error_code: error.error_code ?? 'TASK_OPERATION_FAILED',
        message: error.error_code ?? 'Task operation failed; refresh and retry',
      });
    }
  };
}
export default function taskRoutes(app: Router) {
  executionService.start();
  taskTriggerRoutes(app);
  discoveryRoutes(app);
  triggerScheduler.start();
  app.get(
    '/tasks/:id/runs',
    endpoint((req) => executionService.list(identifier(req.params.id))),
  );
  app.get(
    '/task-runs/:id',
    endpoint((req) => executionService.get(identifier(req.params.id))),
  );
  app.get(
    '/task-runs/:id/log',
    endpoint(async (req) => ({
      content: await executionService.log(identifier(req.params.id)),
    })),
  );
  app.post(
    '/task-runs/:id/cancel',
    endpoint((req) => executionService.cancel(identifier(req.params.id))),
  );
  const tasks = () => Container.get(TaskService);
  app.get(
    '/tasks',
    endpoint(async (req) => {
      const result = await tasks().list(
        Number(req.query.page ?? 1),
        Number(req.query.size ?? 100),
      );
      const statuses = await new TaskExecutionBridge().statuses(
        result.data.map((task) => task.id),
      );
      return {
        ...result,
        data: result.data.map((task) => ({
          ...task,
          last_run: statuses.get(task.id) ?? null,
        })),
      };
    }),
  );
  app.post(
    '/tasks',
    endpoint((req) =>
      sequelize.transaction(
        { type: Transaction.TYPES.IMMEDIATE },
        (transaction) => tasks().save(req.body, undefined, transaction),
      ),
    ),
  );
  app.get(
    '/tasks/:id',
    endpoint((req) => tasks().detail(identifier(req.params.id))),
  );
  app.put(
    '/tasks/:id',
    endpoint((req) =>
      sequelize.transaction(
        { type: Transaction.TYPES.IMMEDIATE },
        (transaction) =>
          tasks().save(req.body, identifier(req.params.id), transaction),
      ),
    ),
  );
  app.delete(
    '/tasks/:id',
    endpoint((req) =>
      sequelize.transaction(
        { type: Transaction.TYPES.IMMEDIATE },
        async (transaction) => {
          await tasks().remove(
            identifier(req.params.id),
            req.body.expected_version,
            transaction,
          );
          return null;
        },
      ),
    ),
  );
  app.post(
    '/tasks/:id/clone',
    endpoint((req) =>
      sequelize.transaction(
        { type: Transaction.TYPES.IMMEDIATE },
        (transaction) =>
          tasks().clone(identifier(req.params.id), req.body.name, transaction),
      ),
    ),
  );
  app.put(
    '/tasks/:id/enabled',
    endpoint((req) =>
      sequelize.transaction(
        { type: Transaction.TYPES.IMMEDIATE },
        (transaction) =>
          tasks().setEnabled(
            identifier(req.params.id),
            req.body.enabled,
            req.body.expected_version,
            transaction,
          ),
      ),
    ),
  );
  app.get(
    '/tasks/:id/resources',
    endpoint((req) => tasks().resources.detail(identifier(req.params.id))),
  );
  app.post(
    '/tasks/:id/validate',
    endpoint((req) =>
      new TaskResourceValidator().validate(identifier(req.params.id)),
    ),
  );
  for (const operation of ['run', 'stop'] as const)
    app.post(
      `/tasks/:id/${operation}`,
      endpoint(async (req) => {
        if (operation === 'run') {
          if (
            Object.keys(req.body ?? {}).some((key) => key !== 'source') ||
            (req.body?.source !== undefined && req.body.source !== 'MANUAL')
          )
            throw new TaskDefinitionError('TASK_RUN_SOURCE_INVALID');
          return executionService.submit(
            identifier(req.params.id),
            req.body?.source === 'MANUAL' ? 'MANUAL' : 'API',
          );
        }
        return new TaskExecutionBridge().stop(identifier(req.params.id));
      }),
    );
  for (const operation of ['log', 'logs'] as const)
    app.get(
      `/tasks/:id/${operation}`,
      endpoint((req) =>
        new TaskExecutionBridge()[operation](identifier(req.params.id)),
      ),
    );
  app.get(
    '/task-sources/:id/entries',
    endpoint(async (req) => {
      const service = Container.get(WorktreeService);
      return service.locked(
        identifier(req.params.id),
        'TASK_SOURCE_BROWSE',
        async (_guard, _repository, worktree) => {
          const root = await service.path(worktree),
            entries: string[] = [];
          const walk = async (relative: string) => {
            for (const entry of await fs.readdir(path.join(root, relative), {
              withFileTypes: true,
            })) {
              if (entry.name === '.git' || entry.isSymbolicLink()) continue;
              const name = relative ? relative + '/' + entry.name : entry.name;
              if (entries.length >= 10000)
                throw new TaskDefinitionError('TASK_SOURCE_LIST_LIMIT');
              if (entry.isDirectory()) await walk(name);
              else if (entry.isFile() && /\.(py|js|mjs|cjs|ts|sh)$/.test(name))
                entries.push(name);
            }
          };
          await walk('');
          return entries.sort();
        },
      );
    }),
  );
  for (const scope of ['repository', 'subscription'] as const) {
    app.get(
      `/${
        scope === 'repository' ? 'repositories' : 'subscriptions'
      }/:id/runtime-defaults`,
      endpoint((req) =>
        RuntimeDefaultModel.findAll({
          where: {
            [scope === 'repository' ? 'repository_id' : 'subscription_id']:
              identifier(req.params.id),
          },
        }),
      ),
    );
    app.put(
      `/${
        scope === 'repository' ? 'repositories' : 'subscriptions'
      }/:id/runtime-defaults`,
      endpoint((req) =>
        tasks().saveRuntimeDefault(
          scope,
          identifier(req.params.id),
          req.body.kind,
          req.body.environment_id,
          req.body.expected_version,
        ),
      ),
    );
  }
  app.get(
    '/task-resources/:kind/:id/references',
    endpoint(async (req) => {
      const id = identifier(req.params.id),
        kind = req.params.kind;
      const references = new TaskReferenceService();
      if (kind === 'worktree') return references.worktree(id);
      if (kind === 'repository') return references.repository(id);
      if (kind === 'python' || kind === 'node')
        return references.environment(
          kind === 'python' ? 'PYTHON' : 'NODE',
          id,
        );
      throw new TaskDefinitionError('TASK_RESOURCE_KIND_INVALID');
    }),
  );
}

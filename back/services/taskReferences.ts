import { Transaction } from 'sequelize';
import {
  TaskModel,
  TaskSourceModel,
  TaskRuntimeBindingModel,
  RuntimeDefaultModel,
} from '../data/task';
import { WorktreeModel } from '../data/worktree';
import { RuntimeError } from '../shared/runtime';
import TaskResourceResolver from './taskResourceResolver';
export default class TaskReferenceService {
  async environment(
    kind: 'PYTHON' | 'NODE',
    id: number,
    transaction?: Transaction,
  ) {
    const key =
      kind === 'PYTHON' ? 'python_environment_id' : 'node_environment_id';
    const [bindings, defaults, definitions] = await Promise.all([
      TaskRuntimeBindingModel.findAll({ where: { [key]: id }, transaction }),
      RuntimeDefaultModel.findAll({ where: { [key]: id }, transaction }),
      TaskModel.findAll({ attributes: ['id', 'name'], transaction }),
    ]);
    const ids = new Set(bindings.map((row) => row.task_id));
    if (defaults.length)
      for (const resource of await new TaskResourceResolver().resolve(
        definitions.map((row) => row.id),
        transaction,
      ))
        if (
          resource.runtime.kind === kind &&
          resource.runtime.environment_id === id
        )
          ids.add(resource.task.id);
    const tasks = definitions
      .filter((row) => ids.has(row.id))
      .map((row) => ({ id: row.id, name: row.name }));
    return {
      tasks,
      tasks_count: tasks.length,
      defaults: defaults.map((row) => row.get({ plain: true })),
      defaults_count: defaults.length,
    };
  }
  async worktree(id: number) {
    const sources = await TaskSourceModel.findAll({
      where: { worktree_id: id },
    });
    const tasks = (
      await TaskModel.findAll({
        where: { id: sources.map((row) => row.task_id) },
        attributes: ['id', 'name'],
      })
    ).map((row) => ({ id: row.id, name: row.name }));
    return {
      tasks,
      tasks_count: tasks.length,
      defaults: [],
      defaults_count: 0,
    };
  }
  async repository(id: number) {
    const worktrees = await WorktreeModel.findAll({
      where: { repository_id: id },
      attributes: ['id'],
    });
    const sources = await TaskSourceModel.findAll({
      where: { worktree_id: worktrees.map((row) => row.id!) },
    });
    const tasks = (
      await TaskModel.findAll({
        where: { id: sources.map((row) => row.task_id) },
        attributes: ['id', 'name'],
      })
    ).map((row) => ({ id: row.id, name: row.name }));
    return {
      tasks,
      tasks_count: tasks.length,
      defaults: [],
      defaults_count: 0,
    };
  }
  async requireUnusedEnvironment(
    kind: 'PYTHON' | 'NODE',
    id: number,
    transaction?: Transaction,
  ) {
    const key =
      kind === 'PYTHON' ? 'python_environment_id' : 'node_environment_id';
    const [tasks, defaults] = await Promise.all([
      TaskRuntimeBindingModel.count({ where: { [key]: id }, transaction }),
      RuntimeDefaultModel.count({ where: { [key]: id }, transaction }),
    ]);
    if (tasks || defaults)
      throw new RuntimeError(kind + '_ENV_TASK_REFERENCED', 409);
  }
}

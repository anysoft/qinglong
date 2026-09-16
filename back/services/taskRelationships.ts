import { Transaction } from 'sequelize';
import { TaskModel, TaskSourceModel } from '../data/task';
import { WorktreeModel } from '../data/worktree';
import { TaskDefinitionError } from '../shared/taskDefinition';
export async function taskRepository(id: number, transaction?: Transaction) {
  const task = await TaskModel.findByPk(id, { transaction });
  if (!task) throw new TaskDefinitionError('TASK_NOT_FOUND', 404);
  const source = await TaskSourceModel.findByPk(id, { transaction });
  const worktree = source
    ? await WorktreeModel.findByPk(source.worktree_id, { transaction })
    : null;
  return { task, source, repository_id: worktree?.repository_id ?? null };
}

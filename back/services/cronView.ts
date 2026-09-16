import { Service, Inject } from 'typedi';
import winston from 'winston';
import { TaskView, TaskViewModel } from '../data/cronView';
import {
  initPosition,
  maxPosition,
  minPosition,
  stepPosition,
} from '../data/env';
import { FindOptions } from 'sequelize';

@Service()
export default class TaskViewService {
  constructor(@Inject('logger') private logger: winston.Logger) {}

  public async create(payload: TaskView): Promise<TaskView> {
    let position = initPosition;
    const views = await this.list();
    if (views && views.length > 0 && views[views.length - 1].position) {
      position = views[views.length - 1].position as number;
    }
    position = position / 2;
    const tab = new TaskView({ ...payload, position });
    const doc = await this.insert(tab);

    await this.checkPosition(tab.position!);
    return doc;
  }

  public async insert(payload: TaskView): Promise<TaskView> {
    return await TaskViewModel.create(payload, { returning: true });
  }

  public async update(payload: TaskView): Promise<TaskView> {
    const doc = await this.getDb({ id: payload.id });
    const tab = new TaskView({ ...doc, ...payload });
    const newDoc = await this.updateDb(tab);
    return newDoc;
  }

  public async updateDb(payload: TaskView): Promise<TaskView> {
    await TaskViewModel.update(payload, { where: { id: payload.id } });
    return await this.getDb({ id: payload.id });
  }

  public async remove(ids: number[]) {
    await TaskViewModel.destroy({ where: { id: ids } });
  }

  public async list(): Promise<TaskView[]> {
    try {
      const result = await TaskViewModel.findAll({
        where: {},
        order: [['position', 'DESC']],
      });
      return result;
    } catch (error) {
      throw error;
    }
  }

  public async getDb(
    query: FindOptions<TaskView>['where'],
  ): Promise<TaskView> {
    const doc: any = await TaskViewModel.findOne({ where: { ...query } });
    if (!doc) {
      throw new Error(`CronView ${JSON.stringify(query)} not found`);
    }
    return doc.get({ plain: true });
  }

  public async disabled(ids: number[]) {
    await TaskViewModel.update({ isDisabled: 1 }, { where: { id: ids } });
  }

  public async enabled(ids: number[]) {
    await TaskViewModel.update({ isDisabled: 0 }, { where: { id: ids } });
  }

  private async checkPosition(position: number) {
    const precisionPosition = parseFloat(position.toPrecision(16));
    if (precisionPosition < minPosition || precisionPosition > maxPosition) {
      const envs = await this.list();
      let position = initPosition;
      for (const env of envs) {
        position = position - stepPosition;
        await this.updateDb({ id: env.id, position });
      }
    }
  }

  private getPrecisionPosition(position: number): number {
    return parseFloat(position.toPrecision(16));
  }

  public async move({
    id,
    fromIndex,
    toIndex,
  }: {
    fromIndex: number;
    toIndex: number;
    id: number;
  }): Promise<TaskView> {
    let targetPosition: number;
    const isUpward = fromIndex > toIndex;
    const views = await this.list();
    if (toIndex === 0 || toIndex === views.length - 1) {
      targetPosition = isUpward
        ? views[0].position! * 2
        : views[toIndex].position! / 2;
    } else {
      targetPosition = isUpward
        ? (views[toIndex].position! + views[toIndex - 1].position!) / 2
        : (views[toIndex].position! + views[toIndex + 1].position!) / 2;
    }
    const newDoc = await this.update({
      id,
      position: this.getPrecisionPosition(targetPosition),
    });

    await this.checkPosition(targetPosition);
    return newDoc;
  }
}

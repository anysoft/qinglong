import { ModelStatic, Model } from 'sequelize';
import {
  PythonEnvironmentModel,
  PythonEnvironmentRevisionModel,
  PythonEnvironmentBuildModel,
} from '../data/pythonEnvironment';
import { RuntimeError, runtimeId } from '../shared/runtime';
import type {
  RuntimeReferenceSource,
  RuntimeReference,
} from './runtimeReferences';
/** Every retained definition/generation protects its exact interpreter, including failed builds. */
export class PythonRuntimeReferenceSource implements RuntimeReferenceSource {
  async inspect(id: number): Promise<RuntimeReference[]> {
    const references: RuntimeReference[] = [];
    for (const [type, model] of [
      ['PythonEnvironment', PythonEnvironmentModel],
      ['PythonEnvironmentRevision', PythonEnvironmentRevisionModel],
      ['PythonEnvironmentBuild', PythonEnvironmentBuildModel],
    ] as const) {
      const rows = await (model as ModelStatic<Model>).findAll({
        where: { runtime_id: runtimeId(id) },
        attributes: ['id'],
      });
      for (const row of rows)
        references.push({
          type,
          id: Number(row.get({ plain: true }).id),
          name: `${type} ${row.get({ plain: true }).id}`,
        });
    }
    return references;
  }
}
export default class PythonEnvironmentReferenceService {
  async build(id: number) {
    const rows = await PythonEnvironmentModel.findAll({
      where: { current_build_id: runtimeId(id) },
    });
    return {
      count: rows.length,
      references: rows.map((x) => ({
        type: 'current_build',
        id: x.get({ plain: true }).id,
        name: x.get({ plain: true }).name,
      })),
    };
  }
  async requireUnusedBuild(id: number) {
    if ((await this.build(id)).count)
      throw new RuntimeError('PYTHON_ENV_BUILD_REFERENCED');
  }
}

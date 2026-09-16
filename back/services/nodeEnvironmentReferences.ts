import {
  NodeEnvironmentModel,
  NodeEnvironmentRevisionModel,
  NodeEnvironmentBuildModel,
  NodePackageManagerToolchainModel,
} from '../data/nodeEnvironment';
import type {
  RuntimeReference,
  RuntimeReferenceSource,
} from './runtimeReferences';
import { Op } from 'sequelize';
export class NodeRuntimeReferenceSource implements RuntimeReferenceSource {
  async inspect(id: number): Promise<RuntimeReference[]> {
    const result: RuntimeReference[] = [];
    for (const [type, model] of [
      ['NodeEnvironment', NodeEnvironmentModel],
      ['NodeEnvironmentRevision', NodeEnvironmentRevisionModel],
      ['NodeEnvironmentBuild', NodeEnvironmentBuildModel],
      ['NodePackageManagerToolchain', NodePackageManagerToolchainModel],
    ] as const) {
      const rows = await (model as any).findAll({
        where: {
          runtime_id: id,
          ...(type === 'NodePackageManagerToolchain'
            ? { state: { [Op.ne]: 'REMOVED' } }
            : {}),
        },
        attributes: ['id'],
      });
      for (const row of rows)
        result.push({
          type,
          id: Number(row.get('id')),
          name: type + ' ' + row.get('id'),
        });
    }
    return result;
  }
}

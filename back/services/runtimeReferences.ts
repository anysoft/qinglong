import { NodeRuntimeReferenceSource } from './nodeEnvironmentReferences';
import { PythonRuntimeReferenceSource } from './pythonEnvironmentReferences';
import { RuntimeError, runtimeId } from '../shared/runtime';
export interface RuntimeReference {
  type: string;
  id: number;
  name: string;
}
export interface RuntimeReferenceSource {
  inspect(id: number): Promise<RuntimeReference[]>;
}
/** Future Environment/Task domains register reference sources here, not table probes. */
export default class RuntimeReferenceService {
  constructor(private sources: RuntimeReferenceSource[] = []) {}
  async inspect(id: number) {
    const references = (
      await Promise.all(
        [new PythonRuntimeReferenceSource(), new NodeRuntimeReferenceSource(), ...this.sources].map((source) =>
          source.inspect(runtimeId(id)),
        ),
      )
    ).flat();
    return { count: references.length, references };
  }
  async requireUnused(id: number) {
    const report = await this.inspect(id);
    if (report.count)
      throw Object.assign(new RuntimeError('RUNTIME_REFERENCED'), {
        references: report,
      });
  }
}

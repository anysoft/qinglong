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
        this.sources.map((source) => source.inspect(runtimeId(id))),
      )
    ).flat();
    return { count: references.length, references };
  }
  async requireUnused(id: number) {
    if ((await this.inspect(id)).count)
      throw new RuntimeError('RUNTIME_REFERENCED');
  }
}

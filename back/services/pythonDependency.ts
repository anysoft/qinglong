import { createHash } from 'crypto';
import { DesiredPackage } from '../data/pythonEnvironment';
import { RuntimeError } from '../shared/runtime';
import { ProviderContext } from './pyenvProvider';
/** Use the managed interpreter's bundled pip packaging parser, never a home-grown PEP grammar. */
const parseScript = `import json,sys
from pip._vendor.packaging.requirements import Requirement
from pip._vendor.packaging.utils import canonicalize_name
try:
 result=[]; seen=set()
 for text in json.loads(sys.argv[1]):
  item=Requirement(text)
  name=canonicalize_name(item.name)
  if item.url is not None or name in seen: raise ValueError()
  seen.add(name); result.append(dict(normalized_name=name,requirement=text))
 print(json.dumps(result))
except Exception:
 print('PYTHON_REQUIREMENT_INVALID',file=sys.stderr); sys.exit(2)
`;
export default class PythonDependencyService {
  validateInput(requirements: unknown): string[] {
    if (!Array.isArray(requirements) || requirements.length > 100)
      throw new RuntimeError('PYTHON_REQUIREMENT_INVALID', 400);
    return requirements.map((value) => {
      if (
        typeof value !== 'string' ||
        !value.trim() ||
        value.length > 1000 ||
        /[\r\n\0\x01-\x1f\x7f@`$\\]/.test(value) ||
        !/^\s*[a-zA-Z0-9]/.test(value) ||
        value.includes('://')
      )
        throw new RuntimeError('PYTHON_REQUIREMENT_INVALID', 400);
      return value.trim();
    });
  }
  async parse(
    ctx: ProviderContext,
    executable: string,
    requirements: unknown,
  ): Promise<DesiredPackage[]> {
    const input = this.validateInput(requirements);
    if (!input.length) return [];
    try {
      return JSON.parse(
        await ctx.command.run(
          executable,
          ['-I', '-B', '-c', parseScript, JSON.stringify(input)],
          ctx.directory,
          ctx.environment,
          true,
        ),
      );
    } catch (error) {
      if (
        error instanceof RuntimeError &&
        error.error_code === 'RUNTIME_COMMAND_FAILED'
      )
        throw new RuntimeError('PYTHON_REQUIREMENT_INVALID', 400);
      throw error;
    }
  }
  hash(runtimeId: number, dependencies: DesiredPackage[], index: string) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          runtime_id: runtimeId,
          dependencies,
          index,
          policy: 'isolated-venv-bundled-pip-v1',
        }),
      )
      .digest('hex');
  }
}

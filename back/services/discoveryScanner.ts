import { relativeTaskPath } from '../shared/taskDefinition';
import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { DiscoveryPolicy } from '../data/discoveryPolicy';
import {
  cronNext,
  matchesGlob,
  TriggerError,
} from '../shared/triggerDefinition';
import { TaskLanguage } from '../data/task';
export interface DiscoveredFile {
  key: string;
  relative_path: string;
  language: TaskLanguage;
  name: string;
  schedule: string | null;
}
const languages: Record<string, TaskLanguage> = {
  '.py': 'PYTHON',
  '.js': 'JAVASCRIPT',
  '.mjs': 'JAVASCRIPT',
  '.cjs': 'JAVASCRIPT',
  '.ts': 'TYPESCRIPT',
  '.sh': 'SHELL',
};
const ignored = new Set([
  '.git',
  'node_modules',
  '.platform',
  '.venv',
  'venv',
  '__pycache__',
  '.runtime',
  '.runtimes',
]);
export default class DiscoveryScanner {
  async scan(
    root: string,
    policy: Pick<
      DiscoveryPolicy,
      'enabled' | 'includes' | 'excludes' | 'languages'
    >,
  ) {
    const files: DiscoveredFile[] = [],
      diagnostics: Array<{ code: string; relative_path: string }> = [];
    if (!policy.enabled) return { files, diagnostics };
    const canonical = await fs.realpath(root);
    const walk = async (relative: string) => {
      const directory = path.join(canonical, relative);
      const actual = await fs.realpath(directory);
      if (
        actual !== directory ||
        (actual !== canonical && !actual.startsWith(canonical + path.sep))
      )
        throw new TriggerError('UNSAFE_DISCOVERY_PATH');
      for (const entry of await fs.readdir(directory, {
        withFileTypes: true,
      })) {
        if (ignored.has(entry.name)) continue;
        const name = relative ? relative + '/' + entry.name : entry.name;
        if (entry.isSymbolicLink()) {
          diagnostics.push({ code: 'SYMLINK_IGNORED', relative_path: name });
          continue;
        }
        if (entry.isDirectory()) {
          await walk(name);
          continue;
        }
        const language = languages[path.extname(name).toLowerCase()];
        if (
          !entry.isFile() ||
          !language ||
          !policy.languages.includes(language) ||
          !policy.includes.some((p) => matchesGlob(p, name)) ||
          policy.excludes.some((p) => matchesGlob(p, name))
        )
          continue;
        relativeTaskPath(name);
        const absolute = path.join(canonical, name);
        if ((await fs.realpath(absolute)) !== absolute)
          throw new TriggerError('UNSAFE_DISCOVERY_PATH');
        const handle = await fs.open(
          absolute,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        let text: string;
        try {
          if (!(await handle.stat()).isFile())
            throw new TriggerError('UNSAFE_DISCOVERY_PATH');
          const buffer = Buffer.alloc(65536),
            result = await handle.read(buffer, 0, buffer.length, 0);
          text = buffer.subarray(0, result.bytesRead).toString('utf8');
        } finally {
          await handle.close();
        }
        let schedule =
          text
            .match(/^\s*(?:\/\/|#|\*)\s*cron\s*:\s*([^\r\n]+)/im)?.[1]
            .trim() ?? null;
        if (schedule)
          try {
            cronNext(schedule, 'UTC', new Date());
          } catch {
            diagnostics.push({
              code: 'INVALID_CRON_METADATA',
              relative_path: name,
            });
            schedule = null;
          }
        const title =
          text
            .match(/^\s*(?:\/\/|#|\*)\s*name\s*:\s*([^\r\n]+)/im)?.[1]
            .trim() || name;
        files.push({
          key: createHash('sha256').update(name).digest('hex'),
          relative_path: name,
          language,
          name: title.slice(0, 255),
          schedule,
        });
      }
    };
    await walk('');
    return {
      files: files.sort((a, b) =>
        a.relative_path.localeCompare(b.relative_path),
      ),
      diagnostics,
    };
  }
}

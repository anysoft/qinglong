import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { CronExpressionParser } from 'cron-parser';
import { Crontab } from '../data/cron';
import { Subscription } from '../data/subscription';
import { WorkspaceError } from '../shared/workspaceError';

export type DiscoveryUpdate = Partial<Pick<Crontab, 'id' | 'name' | 'command' | 'schedule' | 'discovery_definition'>>;

// Discovery owns only a private stage and a typed plan. The caller owns Git,
// database access, publication, scheduler installation and compensation.
export default class SubscriptionDiscoveryAdapter {
  async discover(source: string, staged: string, sub: Subscription, current: Crontab[]) {
    const regex = (value?: string) => {
      try { return value ? new RegExp(value) : undefined; }
      catch { throw new WorkspaceError('INVALID_DISCOVERY_FILTER'); }
    };
    const include = regex(sub.whitelist), exclude = regex(sub.blacklist), support = regex(sub.dependences);
    const extensions = new Set((sub.extensions || 'js mjs py sh ts').split(/[|\s]+/).filter(Boolean));
    const files: string[] = [];
    const walk = async (relative: string) => {
      for (const entry of await fs.readdir(path.join(source, relative), { withFileTypes: true })) {
        if (entry.name === '.git') continue;
        if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) throw new WorkspaceError('UNSAFE_DISCOVERY_PATH');
        const name = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await walk(name); else files.push(name);
      }
    };
    await walk('');
    const adds: Crontab[] = [], updates: DiscoveryUpdate[] = [], drops: number[] = [];
    const diagnostics: Array<{ code: string; relative_path: string }> = [];
    const selected = new Set<string>();
    const owned = new Map(current.filter(x => x.sub_id === sub.id && x.discovery_key).map(x => [x.discovery_key!, x]));
    for (const relative of files.sort()) {
      const accepted = extensions.has(path.extname(relative).slice(1)) && (!include || include.test(relative)) && !exclude?.test(relative);
      if (!accepted && !support?.test(relative)) continue;
      const target = path.join(staged, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.cp(path.join(source, relative), target, { dereference: false });
      if (!accepted) continue;
      selected.add(relative);
      const handle = await fs.open(path.join(source, relative), 'r');
      let text: string;
      try { const buffer = Buffer.alloc(65536); const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0); text = buffer.subarray(0, bytesRead).toString('utf8'); }
      finally { await handle.close(); }
      const schedule = text.match(/^\s*(?:\/\/|#|\*)\s*cron\s*:\s*([^\r\n]+)/im)?.[1].trim();
      if (!schedule) { diagnostics.push({ code: 'NO_CRON_METADATA', relative_path: relative }); continue; }
      try { CronExpressionParser.parse(schedule); }
      catch { diagnostics.push({ code: 'INVALID_CRON_METADATA', relative_path: relative }); continue; }
      const name = text.match(/^\s*(?:\/\/|#|\*)\s*name\s*:\s*([^\r\n]+)/im)?.[1].trim() || relative;
      const definition = { name, schedule, command: `task subscription-${sub.id}/${relative}` };
      const key = createHash('sha256').update(relative).digest('hex');
      const old = owned.get(key);
      if (old) {
        const update: DiscoveryUpdate = { id: old.id, discovery_definition: definition };
        for (const field of ['name', 'schedule', 'command'] as const)
          if (!old.discovery_definition || old[field] === old.discovery_definition[field]) update[field] = definition[field];
        if (JSON.stringify(old.discovery_definition) !== JSON.stringify(definition)) updates.push(update);
      } else if ((sub.autoAddCron == null || Boolean(sub.autoAddCron))) adds.push({ ...definition, sub_id: sub.id, discovery_key: key, source_relative_path: relative, discovery_definition: definition });
    }
    if ((sub.autoDelCron == null || Boolean(sub.autoDelCron))) for (const old of owned.values()) {
      if (old.source_relative_path && !selected.has(old.source_relative_path)) {
        const relative = old.source_relative_path;
        if (path.isAbsolute(relative) || relative.split('/').some(x => x === '..' || !x)) throw new WorkspaceError('INVALID_DISCOVERY_PLAN');
        drops.push(old.id!);
        await fs.rm(path.join(staged, relative), { force: true });
      }
    }
    return { subscriptionId: sub.id!, adds, updates, drops, diagnostics };
  }
}

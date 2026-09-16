import fs from 'fs/promises';
import path from 'path';
import { Service } from 'typedi';
import config from '../config';
import { SubscriptionModel, SubscriptionStatus } from '../data/subscription';
import { normalizeRetentionPolicy, RetentionPolicy } from '../shared/retention';
import { platformBarrier } from './backup/platform';

export interface StorageCleanupRequest extends RetentionPolicy {}

/** Owns subscription log retention only. System logs rotate through Winston;
 * TaskRun logs, historical data, package stores and user files are never candidates. */
@Service()
export default class RetentionService {
  private timer?: NodeJS.Timeout;
  private cleaning = false;

  public configure(days: number, logger: { warn(message: string): unknown }) {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const policy = normalizeRetentionPolicy({ logRetentionDays: days });
    if (!policy.logRetentionDays) return;
    const tick = () => this.cleanup(policy).catch(() => logger.warn('[retention] subscription cleanup deferred'));
    this.timer = setInterval(tick, 3600_000);
    this.timer.unref();
    void tick();
  }

  public async preview(request: StorageCleanupRequest) {
    const policy = normalizeRetentionPolicy(request);
    const files: { path: string; bytes: number; mtimeMs: number; ino: number; dev: number }[] = [];
    if (!policy.logRetentionDays) return { policy, files, bytes: 0 };
    const root = config.logPath;
    const rootStat = await fs.lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('LOG_ROOT_INVALID');
    const active = await SubscriptionModel.findAll({
      attributes: ['id'], where: { status: [SubscriptionStatus.running, SubscriptionStatus.queued] }, raw: true,
    });
    const protectedIds = new Set(active.map((row) => row.id));
    const cutoff = Date.now() - policy.logRetentionDays * 86400_000;
    for (const directory of await fs.readdir(root, { withFileTypes: true })) {
      const match = /^subscription-(\d+)$/.exec(directory.name);
      if (!match || !directory.isDirectory() || protectedIds.has(Number(match[1]))) continue;
      const directoryPath = path.join(root, directory.name);
      const current = await fs.lstat(directoryPath);
      if (!current.isDirectory() || current.isSymbolicLink()) continue;
      for (const entry of await fs.readdir(directoryPath, { withFileTypes: true })) {
        if (!entry.isFile() || !/^\d{4}-\d{2}-\d{2}-[\d-]+\.log$/.test(entry.name)) continue;
        const relative = path.join(directory.name, entry.name);
        const stat = await fs.lstat(path.join(root, relative));
        if (stat.isFile() && !stat.isSymbolicLink() && stat.mtimeMs < cutoff) {
          files.push({ path: relative, bytes: stat.size, mtimeMs: stat.mtimeMs, ino: stat.ino, dev: stat.dev });
        }
      }
    }
    return { policy, files, bytes: files.reduce((sum, file) => sum + file.bytes, 0) };
  }

  public async cleanup(request: StorageCleanupRequest) {
    if (this.cleaning) return { deleted: 0, bytes: 0 };
    this.cleaning = true;
    try {
      return await (await platformBarrier()).mutation(async () => {
        const preview = await this.preview(request);
        let deleted = 0, bytes = 0;
        for (const file of preview.files) {
          const target = path.join(config.logPath, file.path);
          const parent = await fs.lstat(path.dirname(target));
          if (!parent.isDirectory() || parent.isSymbolicLink()) continue;
          const stat = await fs.lstat(target).catch(() => undefined);
          if (!stat?.isFile() || stat.isSymbolicLink() || stat.ino !== file.ino ||
            stat.dev !== file.dev || stat.mtimeMs !== file.mtimeMs || stat.size !== file.bytes) continue;
          await fs.unlink(target);
          deleted++; bytes += file.bytes;
        }
        return { deleted, bytes };
      });
    } finally { this.cleaning = false; }
  }
}

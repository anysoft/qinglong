/** Retention is limited to platform-owned sync logs. TaskRun logs have a separate policy. */
export const MAX_RETENTION_DAYS = 3650;
export interface RetentionPolicy { logRetentionDays: number; }
export function normalizeRetentionDays(value: unknown) {
  const days = Number(value);
  if (!Number.isFinite(days)) return 0;
  return Math.min(Math.max(Math.trunc(days), 0), MAX_RETENTION_DAYS);
}
export function normalizeRetentionPolicy(policy: Partial<RetentionPolicy>): RetentionPolicy {
  return { logRetentionDays: normalizeRetentionDays(policy.logRetentionDays) };
}

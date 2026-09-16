import { CronExpressionParser } from 'cron-parser';
import { createHash, randomBytes } from 'crypto';

export class TriggerError extends Error {
  constructor(readonly error_code: string, readonly status = 400) {
    super(error_code);
  }
}
export function exactKeys(
  value: unknown,
  allowed: string[],
): asserts value is Record<string, any> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new TriggerError('TRIGGER_FIELDS_INVALID');
}
export function positiveTriggerId(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new TriggerError('TRIGGER_ID_INVALID');
  return Number(value);
}
export function cronNext(
  expression: string,
  timezone: string,
  now: Date,
): Date {
  try {
    if (
      typeof expression !== 'string' ||
      expression.length > 255 ||
      typeof timezone !== 'string' ||
      timezone.length > 100
    )
      throw new Error();
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(now);
    return CronExpressionParser.parse(expression, {
      tz: timezone,
      currentDate: now,
    })
      .next()
      .toDate();
  } catch {
    throw new TriggerError('CRON_DEFINITION_INVALID');
  }
}
export const secretDigest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const newWebhookSecret = () => randomBytes(32).toString('base64url');
/** Relative glob grammar: *, ** and ?. No regex, escaping, or filesystem roots. */
export function relativeGlob(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 512 ||
    value.startsWith('/') ||
    /[\\\x00-\x1f:]/.test(value) ||
    value.split('/').some((x) => !x || x === '..' || x === '.')
  )
    throw new TriggerError('RELATIVE_GLOB_INVALID');
  return value;
}
export function matchesGlob(pattern: string, relative: string): boolean {
  relativeGlob(pattern);
  // A bounded dynamic program avoids regex backtracking for user-supplied globs.
  let positions = new Uint8Array(relative.length + 1);
  positions[0] = 1;
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i],
      next = new Uint8Array(relative.length + 1);
    if (char === '*' && pattern[i + 1] === '*') {
      i++;
      const slash = pattern[i + 1] === '/';
      if (slash) i++;
      let reachable = false;
      for (let j = 0; j <= relative.length; j++) {
        if (positions[j]) reachable = true;
        next[j] = Number(
          !!positions[j] ||
            (reachable && (!slash || (j > 0 && relative[j - 1] === '/'))),
        );
      }
    } else if (char === '*') {
      next[0] = positions[0];
      for (let j = 1; j <= relative.length; j++)
        next[j] = Number(
          !!positions[j] || (!!next[j - 1] && relative[j - 1] !== '/'),
        );
    } else {
      for (let j = 0; j < relative.length; j++)
        if (
          positions[j] &&
          (char === '?' ? relative[j] !== '/' : relative[j] === char)
        )
          next[j + 1] = 1;
    }
    positions = next;
  }
  return !!positions[relative.length];
}

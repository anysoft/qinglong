export class GitResourceError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'GitResourceError';
  }
}
export function redactGitCredential(
  value: unknown,
  secrets: string[] = [],
): string {
  let text = String(value ?? '');
  for (const secret of secrets
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)) {
    for (const variant of [
      secret,
      encodeURIComponent(secret),
      Buffer.from(secret).toString('base64'),
    ]) {
      text = text.split(variant).join('***');
    }
  }
  return text
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,
      '[REDACTED PRIVATE KEY]',
    )
    .replace(/(https?:\/\/)[^\s/]*@/gi, '$1')
    .replace(
      /(Authorization\s*[:=]\s*)(?:Basic|Bearer|token)\s+[^\s]+/gi,
      '$1***',
    );
}
export function quoteGitShell(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

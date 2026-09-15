/** Exact streaming replacement, bounded by the longest configured secret.
 * Phase boundaries flush only after output protocol validation adds generated secrets. */
export default class ExecutionRedactor {
  private pending = '';
  constructor(
    private secrets: string[],
    private sink: (text: string) => Promise<void>,
  ) {}
  add(values: string[]) {
    this.secrets = [
      ...new Set([
        ...this.secrets,
        ...values.filter(Boolean).flatMap((value) =>
          [value, ...value.split('&').filter(Boolean)].flatMap((part) => {
            let encoded = part;
            try {
              encoded = encodeURIComponent(part);
            } catch {}
            return [
              part,
              JSON.stringify(part).slice(1, -1),
              encoded,
              Buffer.from(part).toString('base64'),
            ];
          }),
        ),
      ]),
    ].sort((a, b) => b.length - a.length);
  }
  async write(text: string) {
    this.pending += text;
    await this.flush(false);
  }
  async flush(final = true) {
    if (!this.secrets.length) {
      const text = this.pending;
      this.pending = '';
      if (text) await this.sink(text);
      return;
    }
    const max = Math.max(...this.secrets.map((x) => x.length));
    let end = final
      ? this.pending.length
      : Math.max(0, this.pending.length - max + 1);
    if (
      end &&
      end < this.pending.length &&
      /[\uD800-\uDBFF]/.test(this.pending[end - 1])
    )
      end--;
    let out = '',
      cursor = 0;
    while (cursor < end) {
      const secret = this.secrets.find((value) =>
        this.pending.startsWith(value, cursor),
      );
      if (secret) {
        out += '********';
        cursor += secret.length;
      } else {
        out += this.pending[cursor++];
      }
    }
    this.pending = this.pending.slice(cursor);
    if (out) await this.sink(out);
  }
}

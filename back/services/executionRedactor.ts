/** Exact streaming replacement; retain only a suffix that can complete a secret.
 * Phase boundaries flush only after output protocol validation adds generated secrets. */
export default class ExecutionRedactor {
  private pending = '';
  constructor(
    private secrets: string[],
    private sink: (text: string) => Promise<void>,
  ) {
    this.secrets = [...new Set(secrets.filter(Boolean))].sort(
      (a, b) => b.length - a.length,
    );
  }
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
    let out = '',
      cursor = 0;
    while (cursor < this.pending.length) {
      const secret = this.secrets.find((value) =>
        this.pending.startsWith(value, cursor),
      );
      if (secret) {
        // A longer overlapping secret may complete in the next chunk. Prefer
        // that match before emitting the shorter replacement and its suffix.
        if (
          !final &&
          this.pending.length - cursor < max &&
          this.secrets.some(
            (value) =>
              value.length > this.pending.length - cursor &&
              value.startsWith(this.pending.slice(cursor)),
          )
        )
          break;
        out += '********';
        cursor += secret.length;
      } else {
        if (
          !final &&
          ((this.pending.length - cursor < max &&
            this.secrets.some((value) =>
              value.startsWith(this.pending.slice(cursor)),
            )) ||
            (cursor === this.pending.length - 1 &&
              /[\uD800-\uDBFF]/.test(this.pending[cursor])))
        )
          break;
        out += this.pending[cursor++];
      }
    }
    this.pending = this.pending.slice(cursor);
    if (out) await this.sink(out);
  }
}

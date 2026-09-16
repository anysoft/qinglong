import { request } from 'undici';
import { ExecutionError } from '../shared/execution';

export function notificationUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ExecutionError('CHANNEL_URL_INVALID', 400);
  }
  if (
    value.length > 4096 ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new ExecutionError('CHANNEL_URL_INVALID', 400);
  return url.toString();
}
/** Same adapter response shape; every response is bounded before provider parsing. */
export const notificationTransport = {
  async request(url: string, options: any = {}) {
    const {
      json,
      body,
      form,
      headers = {},
      method = 'POST',
      dispatcher,
    } = options;
    const finalHeaders = {
      ...headers,
      ...(json ? { 'content-type': 'application/json' } : {}),
    };
    if (form)
      for (const key of Object.keys(finalHeaders))
        if (key.toLowerCase() === 'content-type') delete finalHeaders[key];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await request(notificationUrl(url), {
        method,
        dispatcher,
        headers: finalHeaders,
        body: json ? JSON.stringify(json) : body ?? form,
        signal: controller.signal,
        headersTimeout: 10000,
        bodyTimeout: 10000,
        maxRedirections: 0,
      });
      let length = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of res.body) {
        const b = Buffer.from(chunk);
        length += b.length;
        if (length > 65536) {
          res.body.destroy();
          throw new ExecutionError('PROVIDER_RESPONSE_LIMIT');
        }
        chunks.push(b);
      }
      const text = Buffer.concat(chunks).toString('utf8');
      return { statusCode: res.statusCode, body: { text: async () => text } };
    } catch (error) {
      throw new ExecutionError(
        error instanceof ExecutionError
          ? error.code
          : 'PROVIDER_NETWORK_FAILED',
      );
    } finally {
      clearTimeout(timer);
    }
  },
  async post<T = unknown>(url: string, options: any = {}) {
    const res = await notificationTransport.request(url, {
      ...options,
      method: 'POST',
    });
    if (res.statusCode < 200 || res.statusCode >= 300)
      throw new ExecutionError('PROVIDER_HTTP_FAILED');
    const text = await res.body.text();
    if (options.responseType === 'text') return text as any;
    try {
      return JSON.parse(text);
    } catch {
      return text as any;
    }
  },
};

import { Connection } from 'sockjs';
import RunLogService from './runLog';
import { positiveId } from './runObservability';
/** One bounded subscription per authenticated connection; disk cursor is the recovery authority. */
export default class RunLogFollow {
  private timer?: NodeJS.Timeout;
  private subscription?: { id: number; cursor?: string; generation: number };
  private busy = false;
  private generation = 0;
  constructor(
    readonly connection: Connection,
    readonly logs = new RunLogService(),
  ) {}
  handle(message: string) {
    if (message.length > 2048) return;
    let input: any;
    try {
      input = JSON.parse(message);
    } catch {
      return;
    }
    if (
      input.type !== 'RUN_LOG_SUBSCRIBE' &&
      input.type !== 'RUN_LOG_UNSUBSCRIBE'
    )
      return;
    this.close();
    if (input.type === 'RUN_LOG_UNSUBSCRIBE') return;
    try {
      const id = positiveId(input.runId);
      if (
        input.cursor !== undefined &&
        input.cursor !== null &&
        (typeof input.cursor !== 'string' || input.cursor.length > 512)
      )
        return;
      this.subscription = {
        id,
        cursor: input.cursor ?? undefined,
        generation: this.generation,
      };
      this.timer = setInterval(() => void this.tick(), 500);
      this.timer.unref();
      void this.tick();
    } catch {
      this.connection.write(
        JSON.stringify({
          type: 'runLog',
          error_code: 'LOG_SUBSCRIPTION_INVALID',
        }),
      );
    }
  }
  async tick() {
    if (this.busy || !this.subscription) return;
    const subscription = this.subscription;
    this.busy = true;
    try {
      const result = await this.logs.read(subscription.id, {
        cursor: subscription.cursor,
        tail: false,
      });
      if (this.subscription !== subscription) return;
      const previous = subscription.cursor ?? null;
      subscription.cursor = result.cursor ?? undefined;
      this.connection.write(
        JSON.stringify({
          type: 'runLog',
          runId: subscription.id,
          previous_cursor: previous,
          ...result,
        }),
      );
      if (result.terminal) this.close();
    } catch {
      if (this.subscription === subscription) {
        this.connection.write(
          JSON.stringify({
            type: 'runLog',
            runId: subscription.id,
            error_code: 'LOG_FOLLOW_FAILED',
          }),
        );
        this.close();
      }
    } finally {
      this.busy = false;
    }
  }
  close() {
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.subscription = undefined;
  }
}

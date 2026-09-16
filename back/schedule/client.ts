import { credentials, Client as GrpcClient } from '@grpc/grpc-js';

import config from '../config';
import { getGrpcCerts } from '../config/grpcCerts';

import { HealthService } from '../protos/health';
import { SchedulerReadiness } from '../shared/schedulerReadiness';

class Client {
  readonly readiness = new SchedulerReadiness(() => this.probe());

  private async waitForReady(timeoutMs: number) {
    try {
      await new Promise<void>((resolve, reject) => {
        this.client.waitForReady(Date.now() + timeoutMs, (err) =>
          err ? reject(err) : resolve(),
        );
      });
    } catch (error) {
      this.readiness.invalidate();
      throw Object.assign(
        error instanceof Error ? error : new Error(String(error)),
        { status: 503 },
      );
    }
  }

  private async probe(): Promise<void> {
    await this.waitForReady(1000);
    await new Promise<void>((resolve, reject) => {
      this.client.makeUnaryRequest(
        HealthService.check.path,
        HealthService.check.requestSerialize,
        HealthService.check.responseDeserialize,
        { service: 'scheduler' },
        { deadline: Date.now() + 1000 },
        (err, res) =>
          err
            ? reject(err)
            : res?.status === 1
            ? resolve()
            : reject(new Error('Scheduler unavailable')),
      );
    });
  }
  async transportHealthy(): Promise<boolean> {
    try {
      await this.probe();
      return true;
    } catch {
      return false;
    }
  }
  private _client: GrpcClient | null = null;

  private get client(): GrpcClient {
    if (!this._client) {
      const tlsConfig = getGrpcCerts()!;
      this._client = new GrpcClient(
        `localhost:${config.grpcPort}`,
        credentials.createSsl(
          Buffer.from(tlsConfig.caCert),
          Buffer.from(tlsConfig.clientKey),
          Buffer.from(tlsConfig.clientCert),
        ),
        { 'grpc.enable_http_proxy': 0 },
      );
    }
    return this._client;
  }

}

export default new Client();

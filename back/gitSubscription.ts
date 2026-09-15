import 'reflect-metadata';
import { Container } from 'typedi';
import winston from 'winston';
import { sequelize } from './data';
import { SubscriptionModel } from './data/subscription';
import { initGrpcCerts } from './config/grpcCerts';
import config from './config';
import fs from 'fs/promises';
import path from 'path';
export async function runRepositorySubscription(id: number) {
  const sub = await SubscriptionModel.findByPk(id);
  if (!sub) throw new Error('Subscription not found');
  if (!Container.has('logger')) Container.set('logger', winston.createLogger({ transports: [new winston.transports.Console()] }));
  // The standalone publication process must load the existing scheduler mTLS context.
  // Never bootstrap or rotate certificates from a subscription execution.
  await Promise.all(['ca.crt', 'server.crt', 'server.key', 'client.crt', 'client.key'].map(name => fs.access(path.join(config.configPath, 'grpc', name))));
  await initGrpcCerts();
  const { default: ManagedSubscriptionService } = await import('./services/managedSubscription');
  return Container.get(ManagedSubscriptionService).run(id);
}

if (require.main === module) {
  const id = Number(process.argv[2]);
  (Number.isSafeInteger(id) && id > 0
    ? runRepositorySubscription(id)
    : Promise.reject(new Error('Invalid subscription'))
  )
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      process.stderr.write(
        'Repository subscription failed; verify repository and credential configuration\n',
      );
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}

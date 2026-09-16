import { Container, Service } from 'typedi';
import { Transaction } from 'sequelize';
import CurrentTaskBridgeService from './cron';

/** B03/B04: the Task domain's narrow scheduling adapter. The existing transport
 * implementation remains isolated behind this facade until Phase 10/11. */
@Service()
export default class SchedulerBridgeService {
  mutateTaskDefinitions<T extends { id?: number } | null>(
    mutation: (transaction: Transaction) => Promise<T>,
  ) {
    return Container.get(CurrentTaskBridgeService).mutateTaskDefinitions(
      mutation,
    );
  }
  publishSubscription(
    ...args: Parameters<CurrentTaskBridgeService['publishSubscription']>
  ) {
    return Container.get(CurrentTaskBridgeService).publishSubscription(...args);
  }
  rebuild(requireScheduler = false) {
    return Container.get(CurrentTaskBridgeService).autosave_crontab(
      requireScheduler,
    );
  }
}

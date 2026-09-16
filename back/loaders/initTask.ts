import { Container } from 'typedi';
import SystemService from '../services/system';
import SubscriptionService from '../services/subscription';

export default async () => {
  const systemService = Container.get(SystemService);
  const subscriptionService = Container.get(SubscriptionService);

  // 运行删除日志任务
  const data = await systemService.getSystemConfig();
  if (data && data.info) {
    systemService.configureLogRetention(data.info.logRemoveFrequency);

    await systemService.updateTimezone(data.info);
    
  }

  const subs = await subscriptionService.list();
  for (const sub of subs) {
    subscriptionService.handleTask(sub.get({ plain: true }), !sub.is_disabled);
  }
};

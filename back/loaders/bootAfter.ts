import Container from 'typedi';
import CurrentTaskBridgeService from '../services/cron';

export default async () => {
  const cronService = Container.get(CurrentTaskBridgeService);

  await cronService.bootTask();
};

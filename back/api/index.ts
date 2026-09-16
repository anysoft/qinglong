import { protectApiMutations } from '../services/backup/apiLifetime';
import observabilityRoutes from './observability';
import backupRoutes from './backups';
import { Router } from 'express';
import user from './user';
import runtimeRoutes from './runtime';
import taskRoutes from './tasks';
import configAssets from './configAssets';
import log from './log';
import open from './open';
import system from './system';
import subscription from './subscription';
import health from './health';
import clientIp from './clientIp';
import retention from './retention';
import gitResources from './gitResources';
import workspaceRoutes from './workspace';

export default () => {
  const app = Router();
  backupRoutes(app);
  user(app);
  runtimeRoutes(app);
  observabilityRoutes(app);
  taskRoutes(app);
  configAssets(app);
  log(app);
  open(app);
  system(app);
  workspaceRoutes(app);
  gitResources(app);
  subscription(app);
  health(app);
  clientIp(app);
  retention(app);

  return protectApiMutations(app);
};

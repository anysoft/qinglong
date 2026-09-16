import { Container } from 'typedi';
import { SchedulerProjection, SchedulerProjectionModel, CrontabStatus } from '../data/cron';
import { DependenceModel, DependenceStatus } from '../data/dependence';
import config from '../config';
import { TaskViewModel, CronViewType } from '../data/cronView';
import { initPosition } from '../data/env';
import { AuthDataType, SystemModel } from '../data/system';
import UserService from '../services/user';
import { writeFile } from 'fs/promises';
import { createRandomString, fileExist } from '../config/util';
import OpenService from '../services/open';
import { shareStore } from '../shared/store';
import Logger from './logger';
import { AppModel } from '../data/open';
import { InstanceStatus, RunningInstanceModel } from '../data/runningInstance';
import { setLang, systemLang } from '../shared/i18n';

export default async () => {
  const userService = Container.get(UserService);
  const openService = Container.get(OpenService);

  // 初始化增加系统配置
  let systemApp = (
    await AppModel.findOne({
      where: { name: 'system' },
    })
  )?.get({ plain: true });
  if (!systemApp) {
    systemApp = await AppModel.create({
      name: 'system',
      scopes: ['crons', 'system', 'dashboard'],
      client_id: createRandomString(12, 12),
      client_secret: createRandomString(24, 24),
    });
  } else if (!systemApp.scopes.includes('dashboard')) {
    await AppModel.update(
      { scopes: [...systemApp.scopes, 'dashboard'] },
      { where: { name: 'system' } },
    );
  }
  const [systemConfig] = await SystemModel.findOrCreate({
    where: { type: AuthDataType.systemConfig },
  });
  await SystemModel.findOrCreate({
    where: { type: AuthDataType.notification },
  });
  const [authConfig] = await SystemModel.findOrCreate({
    where: { type: AuthDataType.authConfig },
  });
  if (!authConfig.info) {
    await authConfig.update({
      info: { initialized: false, username: '', password: '', token: '', tokens: {} },
    });
  }

  // Runtime dependency installation is an explicit operation, never a database bootstrap side effect.
  await DependenceModel.update(
    { status: DependenceStatus.cancelled },
    { where: { status: [DependenceStatus.installing, DependenceStatus.removing, DependenceStatus.queued] } },
  );

  // 初始化新增默认全部任务视图
  TaskViewModel.findAll({
    where: { type: CronViewType.系统, name: '全部任务' },
    raw: true,
  }).then((docs) => {
    if (docs.length === 0) {
      TaskViewModel.create({
        name: '全部任务',
        type: CronViewType.系统,
        position: initPosition / 2,
      });
    }
  });

  // 初始化更新所有任务状态为空闲
  await SchedulerProjectionModel.update({ status: CrontabStatus.idle }, { where: {} });

  // 清空所有运行中的实例记录（服务重启后进程已不存在）
  await RunningInstanceModel.update(
    { status: InstanceStatus.stopped },
    { where: { status: InstanceStatus.running } },
  );

  // Initialize the platform language independently of Task scheduling.
  const lang = systemConfig.info?.lang || systemLang();
  setLang(lang);

  // 确保 lang_env.sh 存在
  try {
    const langEnvExist = await fileExist(config.langEnvFile);
    if (!langEnvExist) {
      await writeFile(config.langEnvFile, `export QL_LANG='${lang}'\n`);
    }
  } catch { }

  // 初始化保存一次ck和定时任务数据
  // Task triggers recover through the durable trigger scheduler after HTTP startup.


  const authInfo = await userService.getAuthInfo();
  const apps = await openService.findApps();
  await shareStore.updateAuthInfo(authInfo);
  if (apps?.length) {
    await shareStore.updateApps(apps);
  }
};

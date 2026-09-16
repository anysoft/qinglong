import { Container } from 'typedi';
import { AuthDataType, SystemModel } from '../data/system';
import UserService from '../services/user';
import OpenService from '../services/open';
import { shareStore } from '../shared/store';
import { setLang, systemLang } from '../shared/i18n';

export default async () => {
  const userService = Container.get(UserService);
  const openService = Container.get(OpenService);

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

  // Initialize the platform language independently of Task scheduling.
  const lang = systemConfig.info?.lang || systemLang();
  setLang(lang);

  const authInfo = await userService.getAuthInfo();
  const apps = await openService.findApps();
  await shareStore.updateAuthInfo(authInfo);
  if (apps?.length) {
    await shareStore.updateApps(apps);
  }
};

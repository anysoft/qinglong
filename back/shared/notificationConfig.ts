import { ExecutionError } from './execution';
/** Existing provider field contract; every connection field is treated as protected. */
export const notificationRequiredFields: Record<string, string[]> = {
  WEBHOOK: ['url'],
  gotify: ['gotifyUrl', 'gotifyToken'],
  goCqHttpBot: ['goCqHttpBotUrl', 'goCqHttpBotQq'],
  serverChan: ['serverChanKey'],
  pushDeer: ['pushDeerKey'],
  chat: ['synologyChatUrl'],
  bark: ['barkPush'],
  telegramBot: ['telegramBotToken', 'telegramBotUserId'],
  dingtalkBot: ['dingtalkBotToken'],
  weWorkBot: ['weWorkBotKey'],
  weWorkApp: ['weWorkAppKey'],
  aibotk: ['aibotkKey', 'aibotkType', 'aibotkName'],
  iGot: ['iGotPushKey'],
  pushPlus: ['pushPlusToken'],
  wePlusBot: ['wePlusBotToken'],
  email: ['emailUser', 'emailPass'],
  pushMe: ['pushMeKey'],
  webhook: ['webhookUrl', 'webhookMethod', 'webhookContentType'],
  lark: ['larkKey'],
  chronocat: ['chronocatURL', 'chronocatQQ', 'chronocatToken'],
  ntfy: ['ntfyTopic'],
  wxPusherBot: ['wxPusherBotAppToken'],
  wxPusherSpt: ['wxPusherSptList'],
  openiLink: ['openiLinkAppToken'],
  wpush: ['wpushApiKey'],
};
export function validateNotificationConfig(
  type: string,
  config: Record<string, unknown>,
) {
  if (
    Object.keys(config).some((k) =>
      ['type', '__proto__', 'constructor', 'prototype'].includes(k),
    )
  )
    throw new ExecutionError('CHANNEL_CONFIG_INVALID', 400);
  if (
    !notificationRequiredFields[type] ||
    notificationRequiredFields[type].some(
      (k) => typeof config[k] !== 'string' || !(config[k] as string).trim(),
    )
  )
    throw new ExecutionError('CHANNEL_CONFIG_REQUIRED', 400);
  if (type === 'email' && !config.emailHost && !config.emailService)
    throw new ExecutionError('CHANNEL_CONFIG_REQUIRED', 400);
  if (
    type === 'email' &&
    config.emailHost &&
    (typeof config.emailHost !== 'string' ||
      !/^[a-zA-Z0-9.:-]{1,253}$/.test(config.emailHost) ||
      (config.emailPort !== undefined &&
        (!Number.isInteger(config.emailPort) ||
          Number(config.emailPort) < 1 ||
          Number(config.emailPort) > 65535)))
  )
    throw new ExecutionError('CHANNEL_CONFIG_INVALID', 400);
  if (
    type === 'webhook' &&
    (!['GET', 'POST', 'PUT'].includes(String(config.webhookMethod)) ||
      ![
        'application/json',
        'multipart/form-data',
        'application/x-www-form-urlencoded',
        'text/plain',
      ].includes(String(config.webhookContentType)))
  )
    throw new ExecutionError('CHANNEL_CONFIG_INVALID', 400);
  if (
    type === 'wxPusherBot' &&
    !config.wxPusherBotTopicIds &&
    !config.wxPusherBotUids
  )
    throw new ExecutionError('CHANNEL_CONFIG_REQUIRED', 400);
}

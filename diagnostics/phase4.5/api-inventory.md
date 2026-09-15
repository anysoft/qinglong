# API 声明逐项分类

来源：静态读取 back/api 全部 19 个文件及 api/index/express 挂载。当前真实前缀 /api，/open 通过同一 router rewrite；后者还受 App scope/session 校验，不代表每条声明都向普通 App 开放。USE 只记录挂载，不计业务 endpoint；循环已展开。分类是目标，不是当前权限声明。

| Source | Method | /api 下路径 | Classification | Action / gate |
| --- | --- | --- | --- | --- |
| back/api/clientIp.ts:14 | GET | `/system/client-ip/config` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/clientIp.ts:25 | PUT | `/system/client-ip/config` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/clientIp.ts:45 | GET | `/system/client-ip/diagnose` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/config.ts:18 | GET | `/configs/samples` | TEMPORARY BRIDGE | 5 Config Assets；当前不能删 |
| back/api/config.ts:32 | GET | `/configs/files` | TEMPORARY BRIDGE | 5 Config Assets；当前不能删 |
| back/api/config.ts:52 | GET | `/configs/detail` | TEMPORARY BRIDGE | 5 Config Assets；当前不能删 |
| back/api/config.ts:64 | POST | `/configs/save` | TEMPORARY BRIDGE | 5 Config Assets；当前不能删 |
| back/api/config.ts:98 | GET | `/configs/:file` | LEGACY ONLY | REMOVE 410 tombstone；新 detail API 仍保留 |
| back/api/cron.ts:33 | GET | `/crons/views` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:46 | POST | `/crons/views` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:67 | PUT | `/crons/views` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:93 | DELETE | `/crons/views` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:109 | PUT | `/crons/views/move` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:129 | PUT | `/crons/views/disable` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:146 | PUT | `/crons/views/enable` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:163 | GET | `/crons` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:175 | GET | `/crons/detail` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:190 | POST | `/crons` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:207 | PUT | `/crons/run` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:224 | PUT | `/crons/stop` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:241 | DELETE | `/crons/labels` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:264 | POST | `/crons/labels` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:284 | PUT | `/crons/disable` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:301 | PUT | `/crons/enable` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:318 | GET | `/crons/:id/log` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:359 | PUT | `/crons` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:379 | DELETE | `/crons` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:396 | PUT | `/crons/pin` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:413 | PUT | `/crons/unpin` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:430 | GET | `/crons/import` | LEGACY ONLY | REMOVE 4.5B；替换来源/模式契约后 |
| back/api/cron.ts:444 | GET | `/crons/:id` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:463 | PUT | `/crons/status` | INTERNAL-ONLY target | 目前有旧可达面；结果/通知/恢复通道替代后收紧或移除 |
| back/api/cron.ts:491 | GET | `/crons/:id/instances` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:514 | POST | `/crons/:id/instances/:instanceId/stop` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/cron.ts:533 | GET | `/crons/:id/logs` | TEMPORARY BRIDGE | 保留 Task/sync 能力；9–10 分域 |
| back/api/dashboard.ts:20 | POST | `/dashboard/record` | INTERNAL-ONLY target | 目前有旧可达面；结果/通知/恢复通道替代后收紧或移除 |
| back/api/dashboard.ts:63 | GET | `/dashboard/overview` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/dashboard.ts:110 | GET | `/dashboard/failures` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/dashboard.ts:147 | GET | `/dashboard/trend` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/dashboard.ts:193 | GET | `/dashboard/top-time` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/dashboard.ts:235 | GET | `/dashboard/top-count` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/dashboard.ts:281 | GET | `/dashboard/runtime` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/dashboard.ts:358 | GET | `/dashboard/labels` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/dashboard.ts:410 | GET | `/dashboard/system` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/dependence.ts:11 | GET | `/dependencies` | TEMPORARY BRIDGE | 6–8 Runtime；当前不能删 |
| back/api/dependence.ts:34 | POST | `/dependencies` | TEMPORARY BRIDGE | 6–8 Runtime；当前不能删 |
| back/api/dependence.ts:56 | PUT | `/dependencies` | TEMPORARY BRIDGE | 6–8 Runtime；当前不能删 |
| back/api/dependence.ts:77 | DELETE | `/dependencies` | TEMPORARY BRIDGE | 6–8 Runtime；当前不能删 |
| back/api/dependence.ts:93 | DELETE | `/dependencies/force` | TEMPORARY BRIDGE | 6–8 Runtime；当前不能删 |
| back/api/dependence.ts:109 | GET | `/dependencies/:id` | TEMPORARY BRIDGE | 6–8 Runtime；当前不能删 |
| back/api/dependence.ts:127 | PUT | `/dependencies/reinstall` | TEMPORARY BRIDGE | 6–8 Runtime；当前不能删 |
| back/api/dependence.ts:143 | PUT | `/dependencies/cancel` | TEMPORARY BRIDGE | 6–8 Runtime；当前不能删 |
| back/api/env.ts:30 | GET | `/envs` | REMOVE CANDIDATE | 4.5B unique Global API 替换后删除 |
| back/api/env.ts:42 | POST | `/envs` | REMOVE CANDIDATE | 4.5B unique Global API 替换后删除 |
| back/api/env.ts:71 | PUT | `/envs` | REMOVE CANDIDATE | 4.5B unique Global API 替换后删除 |
| back/api/env.ts:94 | DELETE | `/envs` | REMOVE CANDIDATE | 4.5B unique Global API 替换后删除 |
| back/api/env.ts:111 | PUT | `/envs/:id/move` | REMOVE CANDIDATE | 4.5B unique Global API 替换后删除 |
| back/api/env.ts:133 | PUT | `/envs/disable` | REMOVE CANDIDATE | 4.5B unique Global API 替换后删除 |
| back/api/env.ts:150 | PUT | `/envs/enable` | REMOVE CANDIDATE | 4.5B unique Global API 替换后删除 |
| back/api/env.ts:167 | PUT | `/envs/name` | REMOVE CANDIDATE | 4.5B unique Global API 替换后删除 |
| back/api/env.ts:187 | GET | `/envs/:id` | REMOVE CANDIDATE | 4.5B unique Global API 替换后删除 |
| back/api/env.ts:206 | PUT | `/envs/pin` | REMOVE CANDIDATE | 4.5B unique Global API 替换后删除 |
| back/api/env.ts:223 | PUT | `/envs/unpin` | REMOVE CANDIDATE | 4.5B unique Global API 替换后删除 |
| back/api/env.ts:240 | POST | `/envs/labels` | REMOVE CANDIDATE | 4.5B unique Global API 替换后删除 |
| back/api/env.ts:259 | DELETE | `/envs/labels` | REMOVE CANDIDATE | 4.5B unique Global API 替换后删除 |
| back/api/env.ts:278 | POST | `/envs/upload` | REMOVE CANDIDATE | 4.5B unique Global API 替换后删除 |
| back/api/gitResources.ts:73 | GET | `/git-credentials` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/gitResources.ts:77 | GET | `/git-credentials/:id` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/gitResources.ts:85 | POST | `/git-credentials` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/gitResources.ts:93 | PUT | `/git-credentials` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/gitResources.ts:101 | DELETE | `/git-credentials/:id` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/gitResources.ts:110 | POST | `/git-credentials/:id/test` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/gitResources.ts:122 | POST | `/repositories/normalize` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/gitResources.ts:133 | GET | `/repositories` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/gitResources.ts:137 | GET | `/repositories/:id` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/gitResources.ts:145 | POST | `/repositories` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/gitResources.ts:153 | PUT | `/repositories` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/gitResources.ts:161 | DELETE | `/repositories/:id` | DUPLICATE | 被先注册 workspace handler 遮蔽；删该 route，保留安全 storage delete |
| back/api/gitResources.ts:170 | POST | `/repositories/:id/test` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/gitResources.ts:178 | POST | `/subscriptions/:id/convert` | LEGACY ONLY | REMOVE 4.5B；替换来源/模式契约后 |
| back/api/health.ts:10 | GET | `/health` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/log.ts:21 | GET | `/logs` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/log.ts:35 | GET | `/logs/detail` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/log.ts:89 | GET | `/logs/:file` | LEGACY ONLY | REMOVE 410 tombstone；新 detail API 仍保留 |
| back/api/log.ts:99 | DELETE | `/logs` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/log.ts:130 | POST | `/logs/download` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/open.ts:10 | GET | `/apps` | REMOVE CANDIDATE | 新 API clients/scopes 替换；system token 暂留 |
| back/api/open.ts:24 | POST | `/apps` | REMOVE CANDIDATE | 新 API clients/scopes 替换；system token 暂留 |
| back/api/open.ts:44 | PUT | `/apps` | REMOVE CANDIDATE | 新 API clients/scopes 替换；system token 暂留 |
| back/api/open.ts:65 | DELETE | `/apps` | REMOVE CANDIDATE | 新 API clients/scopes 替换；system token 暂留 |
| back/api/open.ts:82 | PUT | `/apps/:id/reset-secret` | REMOVE CANDIDATE | 新 API clients/scopes 替换；system token 暂留 |
| back/api/open.ts:101 | GET | `/auth/token` | REMOVE CANDIDATE | 新 API clients/scopes 替换；system token 暂留 |
| back/api/retention.ts:32 | PUT | `/system/storage-retention/config` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/retention.ts:46 | POST | `/system/storage-retention/preview` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/retention.ts:60 | POST | `/system/storage-retention/cleanup` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:36 | GET | `/scoped-env/repositories` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:37 | GET | `/scoped-env/tasks` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:38 | GET | `/scoped-env/repositories/:id/profiles` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:39 | GET | `/scoped-env/profiles/:id` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:40 | POST | `/scoped-env/profiles` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:41 | PUT | `/scoped-env/profiles` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:42 | DELETE | `/scoped-env/profiles/:id` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:43 | POST | `/scoped-env/profiles/:id/clone` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:45 | GET | `/scoped-env/profiles/:id/variables` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:45 | GET | `/scoped-env/tasks/:id/variables` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:46 | PUT | `/scoped-env/profiles/:id/variables` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:46 | PUT | `/scoped-env/tasks/:id/variables` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:49 | PUT | `/scoped-env/tasks/:id/profile` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:49 | PUT | `/scoped-env/subscriptions/:id/profile` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:50 | GET | `/scoped-env/tasks/:id/context` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:50 | GET | `/scoped-env/subscriptions/:id/context` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/scopedEnvironment.ts:58 | GET | `/scoped-env/tasks/:id/preview` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/script.ts:37 | GET | `/scripts` | TEMPORARY BRIDGE | 12 Workspace editor；当前不能删 |
| back/api/script.ts:96 | GET | `/scripts/detail` | TEMPORARY BRIDGE | 12 Workspace editor；当前不能删 |
| back/api/script.ts:118 | GET | `/scripts/:file` | LEGACY ONLY | REMOVE 410 tombstone；新 detail API 仍保留 |
| back/api/script.ts:125 | POST | `/scripts` | TEMPORARY BRIDGE | 12 Workspace editor；当前不能删 |
| back/api/script.ts:217 | PUT | `/scripts` | TEMPORARY BRIDGE | 12 Workspace editor；当前不能删 |
| back/api/script.ts:249 | DELETE | `/scripts` | TEMPORARY BRIDGE | 12 Workspace editor；当前不能删 |
| back/api/script.ts:283 | POST | `/scripts/download` | TEMPORARY BRIDGE | 12 Workspace editor；当前不能删 |
| back/api/script.ts:319 | PUT | `/scripts/run` | TEMPORARY BRIDGE | 12 Workspace editor；当前不能删 |
| back/api/script.ts:351 | PUT | `/scripts/stop` | TEMPORARY BRIDGE | 12 Workspace editor；当前不能删 |
| back/api/script.ts:385 | PUT | `/scripts/rename` | TEMPORARY BRIDGE | 12 Workspace editor；当前不能删 |
| back/api/subscription.ts:14 | POST | `/subscriptions/:id/managed/preflight` | NEW PLATFORM CORE | KEEP prepare 校验能力，去 managed 命名 |
| back/api/subscription.ts:33 | PUT | `/subscriptions/:id/git-mode` | LEGACY ONLY | REMOVE 4.5B；替换来源/模式契约后 |
| back/api/subscription.ts:56 | GET | `/subscriptions` | TEMPORARY BRIDGE | 4.5B Repository-only contract |
| back/api/subscription.ts:71 | POST | `/subscriptions` | TEMPORARY BRIDGE | 4.5B Repository-only contract |
| back/api/subscription.ts:131 | PUT | `/subscriptions/run` | TEMPORARY BRIDGE | 4.5B Repository-only contract |
| back/api/subscription.ts:148 | PUT | `/subscriptions/stop` | TEMPORARY BRIDGE | 4.5B Repository-only contract |
| back/api/subscription.ts:165 | PUT | `/subscriptions/disable` | TEMPORARY BRIDGE | 4.5B Repository-only contract |
| back/api/subscription.ts:182 | PUT | `/subscriptions/enable` | TEMPORARY BRIDGE | 4.5B Repository-only contract |
| back/api/subscription.ts:199 | GET | `/subscriptions/:id/log` | TEMPORARY BRIDGE | 4.5B Repository-only contract |
| back/api/subscription.ts:232 | PUT | `/subscriptions` | TEMPORARY BRIDGE | 4.5B Repository-only contract |
| back/api/subscription.ts:288 | DELETE | `/subscriptions` | TEMPORARY BRIDGE | 4.5B Repository-only contract |
| back/api/subscription.ts:309 | GET | `/subscriptions/:id` | TEMPORARY BRIDGE | 4.5B Repository-only contract |
| back/api/subscription.ts:328 | PUT | `/subscriptions/status` | INTERNAL-ONLY target | 目前有旧可达面；结果/通知/恢复通道替代后收紧或移除 |
| back/api/subscription.ts:354 | GET | `/subscriptions/:id/logs` | TEMPORARY BRIDGE | 4.5B Repository-only contract |
| back/api/system.ts:35 | GET | `/system` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/system.ts:61 | GET | `/system/config` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/system.ts:75 | PUT | `/system/config/log-remove-frequency` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/system.ts:93 | PUT | `/system/config/cron-concurrency` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/system.ts:111 | PUT | `/system/config/dependence-proxy` | TEMPORARY BRIDGE | Runtime前保留；不扩展全局依赖 |
| back/api/system.ts:129 | PUT | `/system/config/node-mirror` | TEMPORARY BRIDGE | Runtime前保留；不扩展全局依赖 |
| back/api/system.ts:147 | PUT | `/system/config/python-mirror` | TEMPORARY BRIDGE | Runtime前保留；不扩展全局依赖 |
| back/api/system.ts:165 | PUT | `/system/config/linux-mirror` | TEMPORARY BRIDGE | Runtime前保留；不扩展全局依赖 |
| back/api/system.ts:183 | PUT | `/system/update-check` | REMOVE CANDIDATE / BRIDGE | 保留运维/备份职责至对应 replacement；非全无调用 |
| back/api/system.ts:197 | PUT | `/system/update` | REMOVE CANDIDATE / BRIDGE | 保留运维/备份职责至对应 replacement；非全无调用 |
| back/api/system.ts:211 | PUT | `/system/reload` | REMOVE CANDIDATE / BRIDGE | 保留运维/备份职责至对应 replacement；非全无调用 |
| back/api/system.ts:230 | PUT | `/system/notify` | INTERNAL-ONLY target | 目前有旧可达面；结果/通知/恢复通道替代后收紧或移除 |
| back/api/system.ts:250 | PUT | `/system/command-run` | REMOVE CANDIDATE / BRIDGE | 保留运维/备份职责至对应 replacement；非全无调用 |
| back/api/system.ts:300 | PUT | `/system/command-stop` | REMOVE CANDIDATE / BRIDGE | 保留运维/备份职责至对应 replacement；非全无调用 |
| back/api/system.ts:319 | PUT | `/system/data/export` | REMOVE CANDIDATE / BRIDGE | 保留运维/备份职责至对应 replacement；非全无调用 |
| back/api/system.ts:336 | PUT | `/system/data/import` | REMOVE CANDIDATE / BRIDGE | 保留运维/备份职责至对应 replacement；非全无调用 |
| back/api/system.ts:350 | GET | `/system/log` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/system.ts:381 | DELETE | `/system/log` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/system.ts:394 | PUT | `/system/auth/reset` | INTERNAL-ONLY target | 目前有旧可达面；结果/通知/恢复通道替代后收紧或移除 |
| back/api/system.ts:418 | PUT | `/system/config/timezone` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/system.ts:436 | PUT | `/system/config/lang` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/system.ts:454 | PUT | `/system/config/panel-title` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/system.ts:472 | PUT | `/system/config/global-ssh-key` | LEGACY ONLY | Repository credential 与 bot/旧Git退场后 REMOVE |
| back/api/system.ts:490 | PUT | `/system/config/dependence-clean` | TEMPORARY BRIDGE | Runtime前保留；不扩展全局依赖 |
| back/api/update.ts:10 | PUT | `/update/reload` | DUPLICATE / TEMPORARY BRIDGE | 与 system 运维契约整合；update/data 有活跃 restore UI |
| back/api/update.ts:24 | PUT | `/update/system` | DUPLICATE / TEMPORARY BRIDGE | 与 system 运维契约整合；update/data 有活跃 restore UI |
| back/api/update.ts:38 | PUT | `/update/data` | DUPLICATE / TEMPORARY BRIDGE | 与 system 运维契约整合；update/data 有活跃 restore UI |
| back/api/user.ts:48 | POST | `/user/login` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/user.ts:72 | POST | `/user/logout` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/user.ts:87 | PUT | `/user` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/user.ts:109 | GET | `/user` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/user.ts:128 | GET | `/user/two-factor/init` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/user.ts:142 | PUT | `/user/two-factor/active` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/user.ts:161 | PUT | `/user/two-factor/deactivate` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/user.ts:175 | PUT | `/user/two-factor/login` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/user.ts:197 | GET | `/user/login-log` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/user.ts:211 | GET | `/user/ip-blacklist` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/user.ts:224 | PUT | `/user/ip-blacklist` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/user.ts:244 | DELETE | `/user/ip-blacklist` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/user.ts:264 | GET | `/user/notification` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/user.ts:278 | PUT | `/user/notification` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/user.ts:292 | PUT | `/user/init` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/user.ts:313 | PUT | `/user/notification/init` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/user.ts:327 | PUT | `/user/avatar` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:45 | POST | `/repositories/:id/initialize` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:45 | POST | `/repositories/:id/fetch` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:45 | POST | `/repositories/:id/prune` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:45 | POST | `/repositories/:id/repair` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:52 | GET | `/repositories/:id/refs` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:58 | GET | `/repositories/:id/status` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:64 | GET | `/repositories/:id/worktrees` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:70 | POST | `/repositories/:id/remote` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:83 | DELETE | `/repositories/:id` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:89 | GET | `/worktrees` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:99 | GET | `/worktrees/:id` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:105 | POST | `/worktrees` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:121 | PUT | `/worktrees/:id` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:131 | DELETE | `/worktrees/:id` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:144 | POST | `/worktrees/:id/update` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:144 | POST | `/worktrees/:id/refresh` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:144 | POST | `/worktrees/:id/repair` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |
| back/api/workspace.ts:144 | POST | `/worktrees/:id/remove-record` | NEW PLATFORM CORE | KEEP capability / 新平台命名 |

补充：loaders/express.ts 还提供 /api/env.js（前端公共启动配置）、/api/static（upload 静态文件）、前端静态/SPA fallback；认证 white list/body limit/session/路径大小写检查必须保留，不属于 Global env.js 删除目标。动态 route 名称已按源码循环枚举；未启动 HTTP server，此清单不是可达性渗透测试。

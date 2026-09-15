> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](../architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# Phase 0 源码证据清单

> Phase 0 历史快照：本文记录重构前基线。当前代码已新增 GitCredential / Repository、可空订阅引用及兼容适配器；现状增量、测试和限制见 [Phase 1 报告](../../PHASE1_REPORT.md)。旧执行管线保持基线行为。

由 `python3 diagnostics/phase0/inventory.py` 生成。仅扫描 Git 跟踪的源码；行级候选含注释、声明和构建配置，不能将每条命中视为运行时调用。具体语义见 03/04/05/06 文档。

## Runtime Command Inventory

| File:line | Enclosing symbol / scope | Evidence |
|---|---|---|
| `.umirc.ts:43` | module / top-level (nearest textual declaration) | npmClient: 'pnpm', |
| `back/api/retention.ts:23` | module / top-level (nearest textual declaration) | .items(Joi.string().valid('node', 'python3')) |
| `back/api/script.ts:51` | function (nearest textual declaration) | '.pnpm', |
| `back/api/script.ts:52` | function (nearest textual declaration) | 'pnpm-lock.yaml', |
| `back/api/script.ts:53` | function (nearest textual declaration) | 'yarn.lock', |
| `back/api/system.ts:130` | catch (nearest textual declaration) | '/config/node-mirror', |
| `back/api/system.ts:148` | catch (nearest textual declaration) | '/config/python-mirror', |
| `back/config/util.ts:690` | getGetCommand (nearest textual declaration) | [DependenceTypes.nodejs]: \`pnpm ls -g  \| grep "${name}" \| head -1\`, |
| `back/config/util.ts:691` | getGetCommand (nearest textual declaration) | [DependenceTypes.python3]: \` |
| `back/config/util.ts:692` | getGetCommand (nearest textual declaration) | python3 -c "exec(''' |
| `back/config/util.ts:713` | getInstallCommand (nearest textual declaration) | [DependenceTypes.nodejs]: 'pnpm add -g', |
| `back/config/util.ts:714` | getInstallCommand (nearest textual declaration) | [DependenceTypes.python3]: |
| `back/config/util.ts:715` | getInstallCommand (nearest textual declaration) | 'pip3 install --disable-pip-version-check --root-user-action=ignore', |
| `back/config/util.ts:723` | if (nearest textual declaration) | if (type === DependenceTypes.python3 && PYTHON_INSTALL_DIR) { |
| `back/config/util.ts:735` | if (nearest textual declaration) | [DependenceTypes.nodejs]: 'pnpm remove -g', |
| `back/config/util.ts:736` | if (nearest textual declaration) | [DependenceTypes.python3]: |
| `back/config/util.ts:737` | if (nearest textual declaration) | 'pip3 uninstall --disable-pip-version-check --root-user-action=ignore -y', |
| `back/data/dependence.ts:40` | constructor (nearest textual declaration) | 'python3', |
| `back/loaders/initData.ts:105` | catch (nearest textual declaration) | // 初始化更新 linux/python/nodejs 镜像源配置 |
| `back/loaders/initTask.ts:18` | module / top-level (nearest textual declaration) | let tokenCommand = \`ts-node-transpile-only ${join( |
| `back/loaders/initTask.ts:25` | if (nearest textual declaration) | tokenCommand = \`node ${tokenFile}\`; |
| `back/loaders/logger.ts:53` | module / top-level (nearest textual declaration) | levels: winston.config.npm.levels, |
| `back/schedule/addCron.ts:3` | module / top-level (nearest textual declaration) | import nodeSchedule from 'node-schedule'; |
| `back/schedule/addCron.ts:10` | module / top-level (nearest textual declaration) | * 预校验 cron 表达式，检测 node-schedule 会拒绝但 cron-parser 会接受的 pattern。 |
| `back/schedule/addCron.ts:11` | module / top-level (nearest textual declaration) | * node-schedule 对 bare /N（字段以 / 开头，如前无星号/数字前缀的 /6）返回 null， |
| `back/schedule/addCron.ts:16` | module / top-level (nearest textual declaration) | // node-schedule 会对这种字段返回 null |
| `back/schedule/addCron.ts:20` | if (nearest textual declaration) | // 检测 ? 字符：Quartz cron 语法，node-schedule 在大多数位置返回 null |
| `back/schedule/addCron.ts:21` | if (nearest textual declaration) | // cron-parser 接受但 node-schedule 拒绝，提前拦截 |
| `back/schedule/data.ts:1` | module / top-level (nearest textual declaration) | import nodeSchedule from 'node-schedule'; |
| `back/services/cron.ts:55` | schedulerMode (nearest textual declaration) | private get schedulerMode(): 'system' \| 'node' { |
| `back/services/cron.ts:58` | schedulerMode (nearest textual declaration) | if (env === 'node') return 'node'; |
| `back/services/cron.ts:63` | schedulerMode (nearest textual declaration) | return 'node'; |
| `back/services/cron.ts:68` | if (nearest textual declaration) | if (this.schedulerMode === 'node') { |
| `back/services/dependence.ts:144` | refreshInstalledStatuses (nearest textual declaration) | DependenceTypes.python3, |
| `back/services/dependence.ts:197` | if (nearest textual declaration) | dependency.type === DependenceTypes.python3; |
| `back/services/dependence.ts:311` | if (nearest textual declaration) | const isPythonDependence = dependency.type === DependenceTypes.python3; |
| `back/services/schedule.ts:3` | module / top-level (nearest textual declaration) | import nodeSchedule from 'node-schedule'; |
| `back/services/system.ts:156` | updateNodeMirror (nearest textual declaration) | let cmd = 'pnpm config delete registry'; |
| `back/services/system.ts:158` | if (nearest textual declaration) | cmd = \`pnpm config set registry ${info.nodeMirror}\`; |
| `back/services/system.ts:168` | if (nearest textual declaration) | command += \` && pnpm i -g\`; |
| `back/services/system.ts:180` | if (nearest textual declaration) | message: 'update node mirror end', |
| `back/services/system.ts:193` | if (nearest textual declaration) | id: 'update-node-mirror', |
| `back/services/system.ts:205` | updatePythonMirror (nearest textual declaration) | let cmd = 'pip config unset global.index-url'; |
| `back/services/system.ts:207` | if (nearest textual declaration) | cmd = \`pip3 config set global.index-url ${info.pythonMirror}\`; |
| `back/services/system.ts:608` | cleanDependence (nearest textual declaration) | public async cleanDependence(type: 'node' \| 'python3') { |
| `back/services/system.ts:609` | if (nearest textual declaration) | if (!type \|\| !['node', 'python3'].includes(type)) { |
| `back/services/system.ts:619` | if (nearest textual declaration) | type === 'node' ? DependenceTypes.nodejs : DependenceTypes.python3, |
| `back/shared/retention.ts:6` | module / top-level (nearest textual declaration) | export const DEPENDENCE_CACHE_TYPES = ['node', 'python3'] as const; |
| `back/tsconfig.json:16` | module / top-level (nearest textual declaration) | "moduleResolution": "node", |
| `back/validation/schedule.ts:15` | module / top-level (nearest textual declaration) | // 检测裸 /N 模式：cron-parser 会接受，但 node-schedule 会返回 null |
| `back/validation/schedule.ts:20` | if (nearest textual declaration) | // 检测 ? 字符：Quartz cron 语法，node-schedule 在大多数字段上返回 null |
| `docker/Dockerfile:1` | module / top-level (nearest textual declaration) | # Run Node package installation natively on the builder. Node/npm can spin at |
| `docker/Dockerfile:3` | module / top-level (nearest textual declaration) | FROM --platform=$BUILDPLATFORM node:18-alpine3.18 AS builder |
| `docker/Dockerfile:6` | module / top-level (nearest textual declaration) | ENV NPM_CONFIG_PREFIX=/opt/node-global |
| `docker/Dockerfile:7` | module / top-level (nearest textual declaration) | ENV PATH=/opt/node-global/bin:${PATH} |
| `docker/Dockerfile:9` | module / top-level (nearest textual declaration) | COPY package.json .npmrc pnpm-lock.yaml /tmp/build/ |
| `docker/Dockerfile:12` | module / top-level (nearest textual declaration) | && npm i -g pnpm@8.3.1 pm2 ts-node typescript@5 \ |
| `docker/Dockerfile:23` | module / top-level (nearest textual declaration) | pnpm install --prod --frozen-lockfile |
| `docker/Dockerfile:25` | module / top-level (nearest textual declaration) | FROM python:3.11-alpine |
| `docker/Dockerfile:44` | module / top-level (nearest textual declaration) | COPY --from=builder /opt/node-global/lib/node_modules/. /usr/local/lib/node_modules/ |
| `docker/Dockerfile:45` | module / top-level (nearest textual declaration) | COPY --from=builder /opt/node-global/bin/. /usr/local/bin/ |
| `docker/Dockerfile:64` | module / top-level (nearest textual declaration) | npm \ |
| `docker/Dockerfile:87` | module / top-level (nearest textual declaration) | COPY --from=builder /tmp/build/pnpm-lock.yaml /tmp/dependency-lock.yaml |
| `docker/Dockerfile:88` | module / top-level (nearest textual declaration) | RUN cd ${QL_DIR} && node /tmp/verify-build.cjs /tmp/dependency-lock.yaml |
| `docker/Dockerfile:90` | module / top-level (nearest textual declaration) | ENV PNPM_HOME=${QL_DIR}/data/dep_cache/node \ |
| `docker/Dockerfile:91` | module / top-level (nearest textual declaration) | PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile:92` | module / top-level (nearest textual declaration) | PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile:97` | module / top-level (nearest textual declaration) | PIP_CACHE_DIR=${PYTHON_HOME}/pip \ |
| `docker/Dockerfile:98` | module / top-level (nearest textual declaration) | PYTHONPATH=${PYTHON_HOME}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}/site-packages |
| `docker/Dockerfile:100` | module / top-level (nearest textual declaration) | RUN pip3 install --prefix ${PYTHON_HOME} requests |
| `docker/Dockerfile.310:1` | module / top-level (nearest textual declaration) | # Run Node package installation natively on the builder. Node/npm can spin at |
| `docker/Dockerfile.310:3` | module / top-level (nearest textual declaration) | FROM --platform=$BUILDPLATFORM node:18-alpine3.18 AS builder |
| `docker/Dockerfile.310:6` | module / top-level (nearest textual declaration) | ENV NPM_CONFIG_PREFIX=/opt/node-global |
| `docker/Dockerfile.310:7` | module / top-level (nearest textual declaration) | ENV PATH=/opt/node-global/bin:${PATH} |
| `docker/Dockerfile.310:9` | module / top-level (nearest textual declaration) | COPY package.json .npmrc pnpm-lock.yaml /tmp/build/ |
| `docker/Dockerfile.310:12` | module / top-level (nearest textual declaration) | && npm i -g pnpm@8.3.1 pm2 ts-node typescript@5 \ |
| `docker/Dockerfile.310:23` | module / top-level (nearest textual declaration) | pnpm install --prod --frozen-lockfile |
| `docker/Dockerfile.310:25` | module / top-level (nearest textual declaration) | FROM python:3.10-alpine |
| `docker/Dockerfile.310:44` | module / top-level (nearest textual declaration) | COPY --from=builder /opt/node-global/lib/node_modules/. /usr/local/lib/node_modules/ |
| `docker/Dockerfile.310:45` | module / top-level (nearest textual declaration) | COPY --from=builder /opt/node-global/bin/. /usr/local/bin/ |
| `docker/Dockerfile.310:64` | module / top-level (nearest textual declaration) | npm \ |
| `docker/Dockerfile.310:87` | module / top-level (nearest textual declaration) | COPY --from=builder /tmp/build/pnpm-lock.yaml /tmp/dependency-lock.yaml |
| `docker/Dockerfile.310:88` | module / top-level (nearest textual declaration) | RUN cd ${QL_DIR} && node /tmp/verify-build.cjs /tmp/dependency-lock.yaml |
| `docker/Dockerfile.310:90` | module / top-level (nearest textual declaration) | ENV PNPM_HOME=${QL_DIR}/data/dep_cache/node \ |
| `docker/Dockerfile.310:91` | module / top-level (nearest textual declaration) | PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.310:92` | module / top-level (nearest textual declaration) | PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.310:97` | module / top-level (nearest textual declaration) | PIP_CACHE_DIR=${PYTHON_HOME}/pip \ |
| `docker/Dockerfile.310:98` | module / top-level (nearest textual declaration) | PYTHONPATH=${PYTHON_HOME}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}/site-packages |
| `docker/Dockerfile.310:100` | module / top-level (nearest textual declaration) | RUN pip3 install --prefix ${PYTHON_HOME} requests |
| `docker/Dockerfile.debian:3` | module / top-level (nearest textual declaration) | FROM node:20-bookworm-slim AS nodebuilder |
| `docker/Dockerfile.debian:5` | module / top-level (nearest textual declaration) | FROM python:3.11.14-slim-bookworm AS builder |
| `docker/Dockerfile.debian:6` | module / top-level (nearest textual declaration) | COPY package.json .npmrc pnpm-lock.yaml /tmp/build/ |
| `docker/Dockerfile.debian:7` | module / top-level (nearest textual declaration) | COPY --from=nodebuilder /usr/local/bin/node /usr/local/bin/ |
| `docker/Dockerfile.debian:10` | module / top-level (nearest textual declaration) | ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \ |
| `docker/Dockerfile.debian:13` | module / top-level (nearest textual declaration) | npm i -g pnpm@8.3.1 && \ |
| `docker/Dockerfile.debian:15` | module / top-level (nearest textual declaration) | pnpm install --prod --frozen-lockfile |
| `docker/Dockerfile.debian:17` | module / top-level (nearest textual declaration) | FROM python:3.11.14-slim-bookworm |
| `docker/Dockerfile.debian:45` | module / top-level (nearest textual declaration) | COPY --from=nodebuilder /usr/local/bin/node /usr/local/bin/ |
| `docker/Dockerfile.debian:49` | module / top-level (nearest textual declaration) | ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \ |
| `docker/Dockerfile.debian:50` | module / top-level (nearest textual declaration) | ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx && \ |
| `docker/Dockerfile.debian:72` | module / top-level (nearest textual declaration) | npm install -g pnpm@8.3.1 pm2 ts-node typescript@5 && \ |
| `docker/Dockerfile.debian:73` | module / top-level (nearest textual declaration) | npm cache clean --force && \ |
| `docker/Dockerfile.debian:75` | module / top-level (nearest textual declaration) | rm -rf /root/.npm && \ |
| `docker/Dockerfile.debian:96` | module / top-level (nearest textual declaration) | COPY --from=builder /tmp/build/pnpm-lock.yaml /tmp/dependency-lock.yaml |
| `docker/Dockerfile.debian:97` | module / top-level (nearest textual declaration) | RUN cd ${QL_DIR} && node /tmp/verify-build.cjs /tmp/dependency-lock.yaml |
| `docker/Dockerfile.debian:99` | module / top-level (nearest textual declaration) | ENV PNPM_HOME=${QL_DIR}/data/dep_cache/node \ |
| `docker/Dockerfile.debian:100` | module / top-level (nearest textual declaration) | PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.debian:101` | module / top-level (nearest textual declaration) | PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.debian:106` | module / top-level (nearest textual declaration) | PIP_CACHE_DIR=${PYTHON_HOME}/pip \ |
| `docker/Dockerfile.debian:107` | module / top-level (nearest textual declaration) | PYTHONPATH=${PYTHON_HOME}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}/site-packages |
| `docker/Dockerfile.debian:109` | module / top-level (nearest textual declaration) | RUN pip3 install --prefix ${PYTHON_HOME} requests |
| `docker/Dockerfile.debian310:3` | module / top-level (nearest textual declaration) | FROM node:20-bookworm-slim AS nodebuilder |
| `docker/Dockerfile.debian310:5` | module / top-level (nearest textual declaration) | FROM python:3.10-slim-bookworm AS builder |
| `docker/Dockerfile.debian310:6` | module / top-level (nearest textual declaration) | COPY package.json .npmrc pnpm-lock.yaml /tmp/build/ |
| `docker/Dockerfile.debian310:7` | module / top-level (nearest textual declaration) | COPY --from=nodebuilder /usr/local/bin/node /usr/local/bin/ |
| `docker/Dockerfile.debian310:10` | module / top-level (nearest textual declaration) | ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \ |
| `docker/Dockerfile.debian310:13` | module / top-level (nearest textual declaration) | npm i -g pnpm@8.3.1 && \ |
| `docker/Dockerfile.debian310:15` | module / top-level (nearest textual declaration) | pnpm install --prod --frozen-lockfile |
| `docker/Dockerfile.debian310:17` | module / top-level (nearest textual declaration) | FROM python:3.10-slim-bookworm |
| `docker/Dockerfile.debian310:45` | module / top-level (nearest textual declaration) | COPY --from=nodebuilder /usr/local/bin/node /usr/local/bin/ |
| `docker/Dockerfile.debian310:49` | module / top-level (nearest textual declaration) | ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \ |
| `docker/Dockerfile.debian310:71` | module / top-level (nearest textual declaration) | npm install -g pnpm@8.3.1 pm2 ts-node typescript@5 && \ |
| `docker/Dockerfile.debian310:72` | module / top-level (nearest textual declaration) | npm cache clean --force && \ |
| `docker/Dockerfile.debian310:74` | module / top-level (nearest textual declaration) | rm -rf /root/.npm && \ |
| `docker/Dockerfile.debian310:96` | module / top-level (nearest textual declaration) | COPY --from=builder /tmp/build/pnpm-lock.yaml /tmp/dependency-lock.yaml |
| `docker/Dockerfile.debian310:97` | module / top-level (nearest textual declaration) | RUN cd ${QL_DIR} && node /tmp/verify-build.cjs /tmp/dependency-lock.yaml |
| `docker/Dockerfile.debian310:99` | module / top-level (nearest textual declaration) | ENV PNPM_HOME=${QL_DIR}/data/dep_cache/node \ |
| `docker/Dockerfile.debian310:100` | module / top-level (nearest textual declaration) | PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.debian310:101` | module / top-level (nearest textual declaration) | PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.debian310:106` | module / top-level (nearest textual declaration) | PIP_CACHE_DIR=${PYTHON_HOME}/pip \ |
| `docker/Dockerfile.debian310:107` | module / top-level (nearest textual declaration) | PYTHONPATH=${PYTHON_HOME}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}/site-packages |
| `docker/Dockerfile.debian310:109` | module / top-level (nearest textual declaration) | RUN pip3 install --prefix ${PYTHON_HOME} requests |
| `docker/build-manifest.cjs:1` | module / top-level (nearest textual declaration) | const fs = require('node:fs'); |
| `docker/build-manifest.cjs:2` | module / top-level (nearest textual declaration) | const path = require('node:path'); |
| `docker/build-manifest.cjs:3` | module / top-level (nearest textual declaration) | const crypto = require('node:crypto'); |
| `docker/docker-entrypoint.sh:98` | ensure_ql_permissions (nearest textual declaration) | # 修正 HOME 确保 npm/pip/pm2 等工具有可用的缓存目录 |
| `docker/docker-entrypoint.sh:132` | ensure_ql_permissions (nearest textual declaration) | # 自动检测调度模式：有 crond 二进制 → system 模式，否则 node 模式 |
| `docker/docker-entrypoint.sh:137` | ensure_ql_permissions (nearest textual declaration) | export QL_SCHEDULER="node" |
| `docker/verify-build.cjs:1` | module / top-level (nearest textual declaration) | const fs = require('node:fs'); |
| `docker/verify-build.cjs:2` | module / top-level (nearest textual declaration) | const crypto = require('node:crypto'); |
| `docker/verify-build.cjs:3` | module / top-level (nearest textual declaration) | const { execFileSync } = require('node:child_process'); |
| `docker/verify-build.cjs:12` | module / top-level (nearest textual declaration) | .update(fs.readFileSync('pnpm-lock.yaml')) |
| `package.json:3` | module / top-level (nearest textual declaration) | "packageManager": "pnpm@8.3.1", |
| `package.json:16` | module / top-level (nearest textual declaration) | "start": "concurrently -n w: npm:start:*", |
| `package.json:21` | module / top-level (nearest textual declaration) | "test": "TS_NODE_PROJECT=back/tsconfig.json node -r ts-node/register/transpile-only --test test/back/*.test.cjs test/front/*.test.cjs", |
| `package.json:22` | module / top-level (nearest textual declaration) | "benchmark:execution": "TS_NODE_PROJECT=back/tsconfig.json node -r ts-node/register/transpile-only scripts/benchmark-execution.cjs", |
| `package.json:23` | module / top-level (nearest textual declaration) | "build:info": "node scripts/write-build-info.cjs", |
| `package.json:24` | module / top-level (nearest textual declaration) | "panel": "npm run build:back && node static/build/app.js", |
| `package.json:25` | module / top-level (nearest textual declaration) | "gen:proto": "protoc --experimental_allow_proto3_optional --plugin=./node_modules/.bin/protoc-gen-ts_proto ./back/protos/*.proto --ts_proto_out=./ --ts_proto_opt=outputServices=grpc-js,env=node,esModuleInterop=true,snakeToCamel=false", |
| `package.json:45` | module / top-level (nearest textual declaration) | "pnpm": { |
| `package.json:71` | module / top-level (nearest textual declaration) | "sqlite3": "npm:@whyour/sqlite3@1.1.2", |
| `package.json:106` | module / top-level (nearest textual declaration) | "node-schedule": "^2.1.0", |
| `package.json:115` | module / top-level (nearest textual declaration) | "sqlite3": "npm:@whyour/sqlite3@1.1.2", |
| `package.json:142` | module / top-level (nearest textual declaration) | "@types/node": "^17.0.21", |
| `package.json:143` | module / top-level (nearest textual declaration) | "@types/node-schedule": "^1.3.2", |
| `package.json:190` | module / top-level (nearest textual declaration) | "ts-node": "^10.9.2", |
| `sample/extra.sample.sh:4` | module / top-level (nearest textual declaration) | ## 安装node依赖使用 pnpm add -g xxx xxx |
| `sample/extra.sample.sh:5` | module / top-level (nearest textual declaration) | ## 安装python依赖使用 pip3 install xxx |
| `sample/notify.js:1` | module / top-level (nearest textual declaration) | const querystring = require('node:querystring'); |
| `sample/notify.py:1` | module / top-level (nearest textual declaration) | #!/usr/bin/env python3 |
| `scripts/benchmark-execution.cjs:2` | module / top-level (nearest textual declaration) | const fs = require('node:fs'); |
| `scripts/benchmark-execution.cjs:3` | module / top-level (nearest textual declaration) | const os = require('node:os'); |
| `scripts/benchmark-execution.cjs:4` | module / top-level (nearest textual declaration) | const crypto = require('node:crypto'); |
| `scripts/benchmark-execution.cjs:5` | module / top-level (nearest textual declaration) | const { spawn, execFileSync } = require('node:child_process'); |
| `scripts/benchmark-execution.cjs:6` | module / top-level (nearest textual declaration) | const { performance } = require('node:perf_hooks'); |
| `scripts/benchmark-execution.cjs:17` | module / top-level (nearest textual declaration) | { name: 'empty-node', command: '' }, |
| `scripts/benchmark-execution.cjs:43` | module / top-level (nearest textual declaration) | .update(fs.readFileSync('pnpm-lock.yaml')) |
| `scripts/benchmark-execution.cjs:45` | module / top-level (nearest textual declaration) | node: process.version, |
| `scripts/write-build-info.cjs:1` | module / top-level (nearest textual declaration) | const fs = require('node:fs'); |
| `scripts/write-build-info.cjs:2` | module / top-level (nearest textual declaration) | const path = require('node:path'); |
| `scripts/write-build-info.cjs:3` | module / top-level (nearest textual declaration) | const crypto = require('node:crypto'); |
| `scripts/write-build-info.cjs:4` | module / top-level (nearest textual declaration) | const { execFileSync } = require('node:child_process'); |
| `scripts/write-build-info.cjs:21` | for (nearest textual declaration) | .update(fs.readFileSync('pnpm-lock.yaml')) |
| `shell/api.sh:4` | create_token (nearest textual declaration) | local token_command="ts-node-transpile-only ${dir_root}/back/token.ts" |
| `shell/api.sh:7` | create_token (nearest textual declaration) | token_command="node ${token_file}" |
| `shell/bot.sh:25` | module / top-level (nearest textual declaration) | $SUDO apk --no-cache add -f zlib-dev gcc jpeg-dev python3-dev musl-dev freetype-dev |
| `shell/bot.sh:28` | module / top-level (nearest textual declaration) | $SUDO apt-get install -y gcc python3-dev musl-dev zlib1g-dev libjpeg-dev libfreetype-dev |
| `shell/bot.sh:54` | module / top-level (nearest textual declaration) | if [[ ! $(pip3 show "${LREAD%%=*}" 2>/dev/null) ]]; then |
| `shell/bot.sh:55` | module / top-level (nearest textual declaration) | pip3 --default-timeout=100 install ${LREAD} |
| `shell/bot.sh:64` | module / top-level (nearest textual declaration) | ps -eo pid,command \| grep "python3 -m jbot" \| grep -v grep \| awk '{print $1}' \| xargs kill -9 2>/dev/null |
| `shell/bot.sh:65` | module / top-level (nearest textual declaration) | nohup python3 -m jbot >$dir_log/bot/nohup.log 2>&1 & |
| `shell/check.sh:100` | main (nearest textual declaration) | npm i -g pnpm@8.3.1 pm2 ts-node typescript@5 |
| `shell/lang/en.sh:25` | module / top-level (nearest textual declaration) | ['npm 模块位置: %s']='npm module location: %s' |
| `shell/lang/en.sh:71` | module / top-level (nearest textual declaration) | ['3、安装python3依赖...\n']='3. Installing python3 dependencies...\n' |
| `shell/lang/en.sh:104` | module / top-level (nearest textual declaration) | ['未找到 qinglong 模块，请先执行 npm i -g @whyour/qinglong 安装']='Module not found. Run: npm i -g @whyour/qinglong' |
| `shell/lang/zh.sh:25` | module / top-level (nearest textual declaration) | ['npm 模块位置: %s']='npm 模块位置: %s' |
| `shell/lang/zh.sh:104` | module / top-level (nearest textual declaration) | ['未找到 qinglong 模块，请先执行 npm i -g @whyour/qinglong 安装']='未找到 qinglong 模块，请先执行 npm i -g @whyour/qinglong 安装' |
| `shell/node_path_cache.sh:7` | ql_node_path_cache_key (nearest textual declaration) | pnpm_bin=$(type -P pnpm) \|\| return 1 |
| `shell/node_path_cache.sh:8` | ql_node_path_cache_key (nearest textual declaration) | node_bin=$(type -P node) \|\| return 1 |
| `shell/node_path_cache.sh:21` | ql_node_path_cache_key (nearest textual declaration) | for file in "$directory/.npmrc" "$directory/pnpm-workspace.yaml"; do |
| `shell/node_path_cache.sh:33` | ql_node_path_cache_key (nearest textual declaration) | "${XDG_CONFIG_HOME:-${HOME:-}/.config}/pnpm/rc" \ |
| `shell/node_path_cache.sh:94` | ql_read_node_path_cache (nearest textual declaration) | # Private lock creation must not change pnpm's inherited creation mask. |
| `shell/node_path_cache.sh:97` | ql_read_node_path_cache (nearest textual declaration) | result=$(pnpm root -g 9>&- 2>/dev/null) \|\| return $? |
| `shell/node_path_cache.sh:117` | ql_get_node_global_path (nearest textual declaration) | pnpm root -g 2>/dev/null |
| `shell/node_path_cache.sh:122` | ql_get_node_global_path (nearest textual declaration) | cache="${dir_tmp}/pnpm-root-${EUID}.cache" |
| `shell/node_path_cache.sh:123` | ql_get_node_global_path (nearest textual declaration) | key=$(ql_node_path_cache_key) \|\| { pnpm root -g 2>/dev/null; return $?; } |
| `shell/otask.sh:75` | run_nohup (nearest textual declaration) | nohup node $file_name &>$log_path & |
| `shell/otask.sh:103` | append_node_dependency_path (nearest textual declaration) | pnpm_global_path=$(pnpm root -g 2>/dev/null) \|\| true |
| `shell/preload/client.js:150` | if (nearest textual declaration) | !line.includes('node:internal') && |
| `shell/preload/client.py:215` | catch (nearest textual declaration) | ["node", self.temp_script], |
| `shell/preload/esm-loader.mjs:1` | module / top-level (nearest textual declaration) | import { existsSync } from 'node:fs'; |
| `shell/preload/esm-loader.mjs:2` | module / top-level (nearest textual declaration) | import { join } from 'node:path'; |
| `shell/preload/esm-loader.mjs:15` | isBareSpecifier (nearest textual declaration) | !specifier.startsWith('node:') && |
| `shell/preload/esm-loader.mjs:25` | if (nearest textual declaration) | // 解析优先级：全局 pnpm > 系统全局 |
| `shell/preload/sitecustomize.js:22` | function (nearest textual declaration) | !request.startsWith('node:') && |
| `shell/preload/sitecustomize.js:81` | run (nearest textual declaration) | \`node -e "require('fs').writeFileSync('${tempFile}', JSON.stringify(process.env))"\`, |
| `shell/preload/sitecustomize.py:64` | run (nearest textual declaration) | python_cmd = f"python3 -c 'import os,json; f=open(\\\"{temp_file}\\\",\\\"w\\\"); json.dump(dict(os.environ),f); f.close()'" |
| `shell/pub.sh:10` | module / top-level (nearest textual declaration) | ts-node-transpile-only sample/tool.ts |
| `shell/share.sh:236` | npm_install_sub (nearest textual declaration) | npm install --production --no-bin-links |
| `shell/share.sh:237` | npm_install_sub (nearest textual declaration) | elif ! type pnpm &>/dev/null; then |
| `shell/share.sh:238` | npm_install_sub (nearest textual declaration) | npm install --production |
| `shell/share.sh:240` | npm_install_sub (nearest textual declaration) | pnpm install --loglevel error --production |
| `shell/share.sh:289` | delete_pm2 (nearest textual declaration) | # Also try to kill any directly spawned node processes |
| `shell/share.sh:290` | delete_pm2 (nearest textual declaration) | pkill -f "node.*static/build/app.js" 2>/dev/null \|\| true |
| `shell/share.sh:305` | reload_pm2 (nearest textual declaration) | # Kill any existing node processes for qinglong |
| `shell/share.sh:306` | reload_pm2 (nearest textual declaration) | pkill -f "node.*static/build/app.js" 2>/dev/null \|\| true |
| `shell/share.sh:308` | reload_pm2 (nearest textual declaration) | # Start node directly in the background. In containers, keep application |
| `shell/share.sh:311` | reload_pm2 (nearest textual declaration) | nohup node static/build/app.js >/proc/1/fd/1 2>/proc/1/fd/2 & |
| `shell/share.sh:313` | reload_pm2 (nearest textual declaration) | nohup node static/build/app.js >$dir_log/qinglong.log 2>&1 & |
| `shell/share.sh:352` | format_log_time (nearest textual declaration) | echo $(python3 -c 'from datetime import datetime; print(datetime.now().strftime("%Y-%m-%d-%H-%M-%S-%f")[:-3])') |
| `shell/start.sh:3` | module / top-level (nearest textual declaration) | # 前置依赖 nodejs、npm、python3 |
| `shell/start.sh:8` | module / top-level (nearest textual declaration) | npm_dir=$(npm root -g) |
| `shell/start.sh:9` | module / top-level (nearest textual declaration) | pnpm_dir=$(pnpm root -g) |
| `shell/start.sh:15` | module / top-level (nearest textual declaration) | t '未找到 qinglong 模块，请先执行 npm i -g @whyour/qinglong 安装' |
| `shell/start.sh:77` | module / top-level (nearest textual declaration) | npm install -g pnpm@8.3.1 pm2 ts-node typescript@5 |
| `shell/start.sh:80` | module / top-level (nearest textual declaration) | export PYTHON_SHORT_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")') |
| `shell/start.sh:81` | module / top-level (nearest textual declaration) | export PNPM_HOME=${QL_DIR}/data/dep_cache/node |
| `shell/start.sh:82` | module / top-level (nearest textual declaration) | export PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 |
| `shell/start.sh:83` | module / top-level (nearest textual declaration) | export PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 |
| `shell/start.sh:87` | module / top-level (nearest textual declaration) | export PIP_CACHE_DIR=${PYTHON_HOME}/pip |
| `shell/start.sh:88` | module / top-level (nearest textual declaration) | export PYTHONPATH=${PYTHON_HOME}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}/site-packages |
| `shell/start.sh:91` | module / top-level (nearest textual declaration) | pip3 install --prefix ${PYTHON_HOME} requests |
| `shell/task.sh:24` | define_program (nearest textual declaration) | which_program="node" |
| `shell/task.sh:26` | define_program (nearest textual declaration) | which_program="python3" |
| `shell/task.sh:30` | define_program (nearest textual declaration) | which_program="ts-node-transpile-only" |
| `src/hooks/useFilterTreeData.ts:43` | if (nearest textual declaration) | .filter((node) => node); |
| `src/locales/en-US.json:291` | module / top-level (nearest textual declaration) | "支持python3、javascript、shell、typescript 的定时任务管理面板": "A scheduling task management panel that supports python3, javascript, shell, and typescript", |
| `src/locales/en-US.json:563` | module / top-level (nearest textual declaration) | "运行任务前执行的命令，比如 cp/mv/python3 xxx.py/node xxx.js": "Run commands before executing the task, e.g., cp/mv/python3 xxx.py/node xxx.js", |
| `src/locales/en-US.json:564` | module / top-level (nearest textual declaration) | "运行任务后执行的命令，比如 cp/mv/python3 xxx.py/node xxx.js": "Run commands after executing the task, e.g., cp/mv/python3 xxx.py/node xxx.js", |
| `src/locales/en-US.json:566` | module / top-level (nearest textual declaration) | "运行订阅前执行的命令，比如 cp/mv/python3 xxx.py/node xxx.js": "Run commands before executing the subscription, e.g., cp/mv/python3 xxx.py/node xxx.js", |
| `src/locales/en-US.json:567` | module / top-level (nearest textual declaration) | "运行订阅后执行的命令，比如 cp/mv/python3 xxx.py/node xxx.js": "Run commands after executing the subscription, e.g., cp/mv/python3 xxx.py/node xxx.js", |
| `src/locales/zh-CN.json:563` | module / top-level (nearest textual declaration) | "运行任务前执行的命令，比如 cp/mv/python3 xxx.py/node xxx.js": "运行任务前执行的命令，比如 cp/mv/python3 xxx.py/node xxx.js", |
| `src/locales/zh-CN.json:564` | module / top-level (nearest textual declaration) | "运行任务后执行的命令，比如 cp/mv/python3 xxx.py/node xxx.js": "运行任务后执行的命令，比如 cp/mv/python3 xxx.py/node xxx.js", |
| `src/locales/zh-CN.json:566` | module / top-level (nearest textual declaration) | "运行订阅前执行的命令，比如 cp/mv/python3 xxx.py/node xxx.js": "运行订阅前执行的命令，比如 cp/mv/python3 xxx.py/node xxx.js", |
| `src/locales/zh-CN.json:567` | module / top-level (nearest textual declaration) | "运行订阅后执行的命令，比如 cp/mv/python3 xxx.py/node xxx.js": "运行订阅后执行的命令，比如 cp/mv/python3 xxx.py/node xxx.js", |
| `src/pages/config/index.tsx:70` | if (nearest textual declaration) | const onSelect = (value: any, node: any) => { |
| `src/pages/config/index.tsx:72` | if (nearest textual declaration) | setTitle(node.value); |
| `src/pages/config/index.tsx:73` | if (nearest textual declaration) | getConfig(node.value); |
| `src/pages/crontab/modal.tsx:248` | if (nearest textual declaration) | '运行任务前执行的命令，比如 cp/mv/python3 xxx.py/node xxx.js', |
| `src/pages/crontab/modal.tsx:276` | validator (nearest textual declaration) | '运行任务后执行的命令，比如 cp/mv/python3 xxx.py/node xxx.js', |
| `src/pages/dependence/index.tsx:595` | if (nearest textual declaration) | key: 'python3', |
| `src/pages/dependence/modal.tsx:10` | module / top-level (nearest textual declaration) | 'python3', |
| `src/pages/log/index.tsx:57` | if (nearest textual declaration) | const getLog = (node: any) => { |
| `src/pages/log/index.tsx:60` | if (nearest textual declaration) | \`${config.apiPrefix}logs/detail?file=${node.title}&path=${ |
| `src/pages/log/index.tsx:61` | if (nearest textual declaration) | node.parent \|\| '' |
| `src/pages/log/index.tsx:86` | if (nearest textual declaration) | const onSelect = (value: any, node: any) => { |
| `src/pages/log/index.tsx:87` | if (nearest textual declaration) | if (node.key === select \|\| !value) { |
| `src/pages/log/index.tsx:91` | if (nearest textual declaration) | setCurrentNode(node); |
| `src/pages/log/index.tsx:94` | if (nearest textual declaration) | if (node.type === 'directory') { |
| `src/pages/log/index.tsx:100` | if (nearest textual declaration) | getLog(node); |
| `src/pages/log/index.tsx:104` | if (nearest textual declaration) | onSelect(keys[0], e.node); |
| `src/pages/script/editModal.tsx:50` | module / top-level (nearest textual declaration) | const onSelect = (value: any, node: any) => { |
| `src/pages/script/editModal.tsx:51` | if (nearest textual declaration) | if (node.key === selectedKey \|\| !value) { |
| `src/pages/script/editModal.tsx:55` | if (nearest textual declaration) | if (node.type === 'directory') { |
| `src/pages/script/editModal.tsx:60` | if (nearest textual declaration) | setCNode(node); |
| `src/pages/script/editModal.tsx:62` | if (nearest textual declaration) | getDetail(node); |
| `src/pages/script/editModal.tsx:63` | if (nearest textual declaration) | setSelectedKey(node.key); |
| `src/pages/script/editModal.tsx:66` | if (nearest textual declaration) | const getDetail = (node: any) => { |
| `src/pages/script/editModal.tsx:69` | if (nearest textual declaration) | \`${config.apiPrefix}scripts/detail?file=${node.title}&path=${ |
| `src/pages/script/editModal.tsx:70` | if (nearest textual declaration) | node.parent \|\| '' |
| `src/pages/script/editModal.tsx:173` | if (nearest textual declaration) | <Option value="python">python</Option> |
| `src/pages/script/index.tsx:87` | if (nearest textual declaration) | const getDetail = (node: any, options: any = {}) => { |
| `src/pages/script/index.tsx:91` | if (nearest textual declaration) | node.title, |
| `src/pages/script/index.tsx:92` | if (nearest textual declaration) | )}&path=${node.parent \|\| ''}\`, |
| `src/pages/script/index.tsx:124` | if (nearest textual declaration) | node: { |
| `src/pages/script/index.tsx:130` | if (nearest textual declaration) | const item = findNode(_data, (c) => c.key === obj.node.key); |
| `src/pages/script/index.tsx:132` | if (nearest textual declaration) | obj.node = item; |
| `src/pages/script/index.tsx:139` | if (nearest textual declaration) | const onSelect = (value: any, node: any) => { |
| `src/pages/script/index.tsx:140` | if (nearest textual declaration) | if (node.key === select \|\| !value) { |
| `src/pages/script/index.tsx:144` | if (nearest textual declaration) | setSelect(node.key); |
| `src/pages/script/index.tsx:145` | if (nearest textual declaration) | setCurrentNode(node); |
| `src/pages/script/index.tsx:147` | if (nearest textual declaration) | if (node.type === 'directory') { |
| `src/pages/script/index.tsx:153` | if (nearest textual declaration) | if (!canPreviewInMonaco(node.title)) { |
| `src/pages/script/index.tsx:163` | if (nearest textual declaration) | getDetail(node, { |
| `src/pages/script/index.tsx:174` | if (nearest textual declaration) | const node = e.node; |
| `src/pages/script/index.tsx:175` | if (nearest textual declaration) | if (node.key === select && isEditing) { |
| `src/pages/script/index.tsx:189` | onOk (nearest textual declaration) | onSelect(keys[0], e.node); |
| `src/pages/script/index.tsx:190` | onOk (nearest textual declaration) | handleIsEditing(e.node.title, false); |
| `src/pages/script/index.tsx:194` | onOk (nearest textual declaration) | handleIsEditing(e.node.title, false); |
| `src/pages/script/index.tsx:195` | onOk (nearest textual declaration) | onSelect(keys[0], e.node); |
| `src/pages/script/index.tsx:230` | onOk (nearest textual declaration) | const onDoubleClick = (e: any, node: any) => { |
| `src/pages/script/index.tsx:231` | if (nearest textual declaration) | if (node.type === 'file') { |
| `src/pages/script/index.tsx:232` | if (nearest textual declaration) | setSelect(node.key); |
| `src/pages/script/index.tsx:233` | if (nearest textual declaration) | setCurrentNode(node); |
| `src/pages/script/index.tsx:234` | if (nearest textual declaration) | handleIsEditing(node.title, true); |
| `src/pages/setting/dependence.tsx:13` | module / top-level (nearest textual declaration) | 'node-mirror': 'nodeMirror', |
| `src/pages/setting/dependence.tsx:14` | module / top-level (nearest textual declaration) | 'python-mirror': 'pythonMirror', |
| `src/pages/setting/dependence.tsx:28` | module / top-level (nearest textual declaration) | const [cleanType, setCleanType] = useState<string>('node'); |
| `src/pages/setting/dependence.tsx:156` | if (nearest textual declaration) | name="node" |
| `src/pages/setting/dependence.tsx:175` | if (nearest textual declaration) | updateSystemConfigStream('node-mirror'); |
| `src/pages/setting/dependence.tsx:185` | if (nearest textual declaration) | name="python" |
| `src/pages/setting/dependence.tsx:204` | if (nearest textual declaration) | updateSystemConfig('python-mirror'); |
| `src/pages/setting/dependence.tsx:251` | if (nearest textual declaration) | defaultValue={'node'} |
| `src/pages/setting/dependence.tsx:257` | if (nearest textual declaration) | { label: 'node', value: 'node' }, |
| `src/pages/setting/dependence.tsx:258` | if (nearest textual declaration) | { label: 'python3', value: 'python3' }, |
| `src/pages/setting/other.tsx:437` | onOk (nearest textual declaration) | { label: intl.get('清除 Node 依赖缓存'), value: 'node' }, |
| `src/pages/setting/other.tsx:438` | onOk (nearest textual declaration) | { label: intl.get('清除 Python 依赖缓存'), value: 'python3' }, |
| `src/pages/subscription/modal.tsx:493` | catch (nearest textual declaration) | '运行订阅前执行的命令，比如 cp/mv/python3 xxx.py/node xxx.js', |
| `src/pages/subscription/modal.tsx:507` | catch (nearest textual declaration) | '运行订阅后执行的命令，比如 cp/mv/python3 xxx.py/node xxx.js', |
| `src/utils/config.ts:552` | module / top-level (nearest textual declaration) | dependenceTypes: ['nodejs', 'python3', 'linux'], |
| `src/utils/const.ts:4` | module / top-level (nearest textual declaration) | '.py': 'python', |
| `src/utils/monaco/index.ts:69` | module / top-level (nearest textual declaration) | 'yarn.lock', |
| `src/utils/monaco/index.ts:70` | module / top-level (nearest textual declaration) | 'pnpm-lock.yaml', |
## Global ENV Read Inventory

| File:line | Enclosing symbol / scope | Evidence |
|---|---|---|
| `.umirc.ts:4` | module / top-level (nearest textual declaration) | const baseUrl = process.env.QlBaseUrl \|\| '/'; |
| `.umirc.ts:17` | module / top-level (nearest textual declaration) | publicPath: process.env.NODE_ENV === 'production' ? './' : '/', |
| `back/api/system.ts:50` | function (nearest textual declaration) | branch: process.env.QL_BRANCH \|\| 'master', |
| `back/app.ts:145` | if (nearest textual declaration) | if (process.env.pm_id !== undefined && process.env.QL_WORKER_APM !== 'true') { |
| `back/app.ts:223` | startWorkerProcess (nearest textual declaration) | const serviceType = process.env.SERVICE_TYPE; |
| `back/config/const.ts:29` | module / top-level (nearest textual declaration) | export const PYTHON_INSTALL_DIR = process.env.PYTHON_HOME; |
| `back/config/container.ts:2` | isInContainer (nearest textual declaration) | return process.env.QL_CONTAINER === 'true'; |
| `back/config/index.ts:33` | module / top-level (nearest textual declaration) | port: parseInt(process.env.BACK_PORT \|\| '5700', 10), |
| `back/config/index.ts:34` | module / top-level (nearest textual declaration) | grpcPort: parseInt(process.env.GRPC_PORT \|\| '5500', 10), |
| `back/config/index.ts:35` | module / top-level (nearest textual declaration) | bindHost: process.env.BIND_HOST \|\| '::', |
| `back/config/index.ts:36` | module / top-level (nearest textual declaration) | bindHostGrpc: process.env.BIND_HOST_GRPC \|\| '::', |
| `back/config/index.ts:37` | module / top-level (nearest textual declaration) | nodeEnv: process.env.NODE_ENV \|\| 'development', |
| `back/config/index.ts:38` | module / top-level (nearest textual declaration) | isDevelopment: process.env.NODE_ENV === 'development', |
| `back/config/index.ts:39` | module / top-level (nearest textual declaration) | isProduction: process.env.NODE_ENV === 'production', |
| `back/config/index.ts:41` | module / top-level (nearest textual declaration) | level: process.env.LOG_LEVEL \|\| 'silly', |
| `back/config/index.ts:47` | module / top-level (nearest textual declaration) | secret: process.env.JWT_SECRET \|\| 'whyour-secret', |
| `back/config/index.ts:48` | module / top-level (nearest textual declaration) | expiresIn: process.env.JWT_EXPIRES_IN, |
| `back/config/index.ts:51` | module / top-level (nearest textual declaration) | origin: process.env.CORS_ORIGIN |
| `back/config/index.ts:52` | module / top-level (nearest textual declaration) | ? process.env.CORS_ORIGIN.split(',') |
| `back/config/index.ts:58` | module / top-level (nearest textual declaration) | process.env.NODE_ENV = process.env.NODE_ENV \|\| 'development'; |
| `back/config/index.ts:60` | if (nearest textual declaration) | if (!process.env.QL_DIR) { |
| `back/config/index.ts:65` | if (nearest textual declaration) | process.env.QL_DIR = qlHomePath.replace(/\/$/g, ''); |
| `back/config/index.ts:71` | if (nearest textual declaration) | let baseUrl = process.env.QlBaseUrl \|\| ''; |
| `back/config/index.ts:83` | if (nearest textual declaration) | const rootPath = process.env.QL_DIR as string; |
| `back/config/index.ts:88` | if (nearest textual declaration) | if (process.env.QL_DATA_DIR) { |
| `back/config/index.ts:89` | if (nearest textual declaration) | dataPath = process.env.QL_DATA_DIR.replace(/\/$/g, ''); |
| `back/config/index.ts:107` | if (nearest textual declaration) | const envFile = path.join(preloadPath, 'env.sh'); |
| `back/config/index.ts:108` | if (nearest textual declaration) | const jsEnvFile = path.join(preloadPath, 'env.js'); |
| `back/config/index.ts:109` | if (nearest textual declaration) | const pyEnvFile = path.join(preloadPath, 'env.py'); |
| `back/config/index.ts:149` | if (nearest textual declaration) | envFile, |
| `back/config/index.ts:150` | if (nearest textual declaration) | jsEnvFile, |
| `back/config/index.ts:151` | if (nearest textual declaration) | pyEnvFile, |
| `back/config/serverEnv.ts:8` | getPickedEnv (nearest textual declaration) | const picked = pick(process.env, ['QlBaseUrl', 'DeployEnv', 'QL_DIR']); |
| `back/config/util.ts:23` | getOsTypeSync (nearest textual declaration) | const envOs = process.env.QL_OS_TYPE?.toLowerCase(); |
| `back/config/util.ts:747` | isDemoEnv (nearest textual declaration) | return process.env.DeployEnv === 'demo'; |
| `back/config/util.ts:776` | isAlpine (nearest textual declaration) | const envOs = process.env.QL_OS_TYPE?.toLowerCase(); |
| `back/loaders/express.ts:19` | resolveTrustProxy (nearest textual declaration) | function resolveTrustProxy(value = process.env.QL_TRUST_PROXY) { |
| `back/loaders/initFile.ts:8` | module / top-level (nearest textual declaration) | const rootPath = process.env.QL_DIR as string; |
| `back/loaders/initFile.ts:11` | if (nearest textual declaration) | if (process.env.QL_DATA_DIR) { |
| `back/loaders/initFile.ts:12` | if (nearest textual declaration) | dataPath = process.env.QL_DATA_DIR.replace(/\/$/g, ''); |
| `back/schedule/health.ts:88` | catch (nearest textual declaration) | process.env.QL_CONTAINER === 'true' |
| `back/services/cron.ts:56` | schedulerMode (nearest textual declaration) | const env = process.env.QL_SCHEDULER; |
| `back/services/env.ts:265` | if (nearest textual declaration) | js_env_string += \`process.env.${key}=\\`${_env_value.replace( |
| `back/services/env.ts:269` | if (nearest textual declaration) | py_env_string += \`os.environ['${key}']='''${_env_value.replace( |
| `back/services/env.ts:276` | if (nearest textual declaration) | await writeFileWithLock(config.envFile, env_string); |
| `back/services/env.ts:277` | if (nearest textual declaration) | await writeFileWithLock(config.jsEnvFile, js_env_string); |
| `back/services/env.ts:278` | if (nearest textual declaration) | await writeFileWithLock(config.pyEnvFile, py_env_string); |
| `back/services/http.ts:47` | tryListen (nearest textual declaration) | exclusive: process.env.QL_HTTP_SHARED_LISTEN !== 'true', |
| `back/shared/trustProxy.ts:12` | getEnvironmentSetting (nearest textual declaration) | return process.env.QL_TRUST_PROXY?.trim() \|\| ''; |
| `docker/Dockerfile:7` | module / top-level (nearest textual declaration) | ENV PATH=/opt/node-global/bin:${PATH} |
| `docker/Dockerfile:77` | module / top-level (nearest textual declaration) | RUN git clone --depth=1 -b ${QL_BRANCH} ${QL_URL} ${QL_DIR} \ |
| `docker/Dockerfile:78` | module / top-level (nearest textual declaration) | && cd ${QL_DIR} \ |
| `docker/Dockerfile:81` | module / top-level (nearest textual declaration) | && chmod 777 ${QL_DIR}/shell/*.sh \ |
| `docker/Dockerfile:82` | module / top-level (nearest textual declaration) | && chmod 777 ${QL_DIR}/docker/*.sh |
| `docker/Dockerfile:88` | module / top-level (nearest textual declaration) | RUN cd ${QL_DIR} && node /tmp/verify-build.cjs /tmp/dependency-lock.yaml |
| `docker/Dockerfile:90` | module / top-level (nearest textual declaration) | ENV PNPM_HOME=${QL_DIR}/data/dep_cache/node \ |
| `docker/Dockerfile:91` | module / top-level (nearest textual declaration) | PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile:92` | module / top-level (nearest textual declaration) | PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile:95` | module / top-level (nearest textual declaration) | ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PNPM_HOME}:${PYTHON_HOME}/bin:${HOME}/bin \ |
| `docker/Dockerfile:104` | module / top-level (nearest textual declaration) | RUN ln -sf ${QL_DIR}/shell/task.sh /usr/local/bin/task \ |
| `docker/Dockerfile:105` | module / top-level (nearest textual declaration) | && ln -sf ${QL_DIR}/shell/update.sh /usr/local/bin/ql \ |
| `docker/Dockerfile:108` | module / top-level (nearest textual declaration) | WORKDIR ${QL_DIR} |
| `docker/Dockerfile.310:7` | module / top-level (nearest textual declaration) | ENV PATH=/opt/node-global/bin:${PATH} |
| `docker/Dockerfile.310:77` | module / top-level (nearest textual declaration) | RUN git clone --depth=1 -b ${QL_BRANCH} ${QL_URL} ${QL_DIR} \ |
| `docker/Dockerfile.310:78` | module / top-level (nearest textual declaration) | && cd ${QL_DIR} \ |
| `docker/Dockerfile.310:81` | module / top-level (nearest textual declaration) | && chmod 777 ${QL_DIR}/shell/*.sh \ |
| `docker/Dockerfile.310:82` | module / top-level (nearest textual declaration) | && chmod 777 ${QL_DIR}/docker/*.sh |
| `docker/Dockerfile.310:88` | module / top-level (nearest textual declaration) | RUN cd ${QL_DIR} && node /tmp/verify-build.cjs /tmp/dependency-lock.yaml |
| `docker/Dockerfile.310:90` | module / top-level (nearest textual declaration) | ENV PNPM_HOME=${QL_DIR}/data/dep_cache/node \ |
| `docker/Dockerfile.310:91` | module / top-level (nearest textual declaration) | PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.310:92` | module / top-level (nearest textual declaration) | PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.310:95` | module / top-level (nearest textual declaration) | ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PNPM_HOME}:${PYTHON_HOME}/bin:${HOME}/bin \ |
| `docker/Dockerfile.310:104` | module / top-level (nearest textual declaration) | RUN ln -sf ${QL_DIR}/shell/task.sh /usr/local/bin/task \ |
| `docker/Dockerfile.310:105` | module / top-level (nearest textual declaration) | && ln -sf ${QL_DIR}/shell/update.sh /usr/local/bin/ql \ |
| `docker/Dockerfile.310:108` | module / top-level (nearest textual declaration) | WORKDIR ${QL_DIR} |
| `docker/Dockerfile.debian:80` | module / top-level (nearest textual declaration) | RUN mkdir -p ${QL_DIR} && \ |
| `docker/Dockerfile.debian:81` | module / top-level (nearest textual declaration) | chown -R ${QL_UID}:${QL_GID} ${QL_DIR} |
| `docker/Dockerfile.debian:86` | module / top-level (nearest textual declaration) | RUN git clone --depth=1 -b ${QL_BRANCH} ${QL_URL} ${QL_DIR} \ |
| `docker/Dockerfile.debian:87` | module / top-level (nearest textual declaration) | && cd ${QL_DIR} \ |
| `docker/Dockerfile.debian:90` | module / top-level (nearest textual declaration) | && chmod 777 ${QL_DIR}/shell/*.sh \ |
| `docker/Dockerfile.debian:91` | module / top-level (nearest textual declaration) | && chmod 777 ${QL_DIR}/docker/*.sh |
| `docker/Dockerfile.debian:97` | module / top-level (nearest textual declaration) | RUN cd ${QL_DIR} && node /tmp/verify-build.cjs /tmp/dependency-lock.yaml |
| `docker/Dockerfile.debian:99` | module / top-level (nearest textual declaration) | ENV PNPM_HOME=${QL_DIR}/data/dep_cache/node \ |
| `docker/Dockerfile.debian:100` | module / top-level (nearest textual declaration) | PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.debian:101` | module / top-level (nearest textual declaration) | PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.debian:104` | module / top-level (nearest textual declaration) | ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PNPM_HOME}:${PYTHON_HOME}/bin:${HOME}/bin \ |
| `docker/Dockerfile.debian:115` | module / top-level (nearest textual declaration) | RUN ln -sf ${QL_DIR}/shell/task.sh /usr/local/bin/task \ |
| `docker/Dockerfile.debian:116` | module / top-level (nearest textual declaration) | && ln -sf ${QL_DIR}/shell/update.sh /usr/local/bin/ql \ |
| `docker/Dockerfile.debian:119` | module / top-level (nearest textual declaration) | WORKDIR ${QL_DIR} |
| `docker/Dockerfile.debian310:79` | module / top-level (nearest textual declaration) | RUN mkdir -p ${QL_DIR} && \ |
| `docker/Dockerfile.debian310:80` | module / top-level (nearest textual declaration) | chown -R ${QL_UID}:${QL_GID} ${QL_DIR} |
| `docker/Dockerfile.debian310:86` | module / top-level (nearest textual declaration) | RUN git clone --depth=1 -b ${QL_BRANCH} ${QL_URL} ${QL_DIR} \ |
| `docker/Dockerfile.debian310:87` | module / top-level (nearest textual declaration) | && cd ${QL_DIR} \ |
| `docker/Dockerfile.debian310:90` | module / top-level (nearest textual declaration) | && chmod 777 ${QL_DIR}/shell/*.sh \ |
| `docker/Dockerfile.debian310:91` | module / top-level (nearest textual declaration) | && chmod 777 ${QL_DIR}/docker/*.sh |
| `docker/Dockerfile.debian310:97` | module / top-level (nearest textual declaration) | RUN cd ${QL_DIR} && node /tmp/verify-build.cjs /tmp/dependency-lock.yaml |
| `docker/Dockerfile.debian310:99` | module / top-level (nearest textual declaration) | ENV PNPM_HOME=${QL_DIR}/data/dep_cache/node \ |
| `docker/Dockerfile.debian310:100` | module / top-level (nearest textual declaration) | PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.debian310:101` | module / top-level (nearest textual declaration) | PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.debian310:104` | module / top-level (nearest textual declaration) | ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PNPM_HOME}:${PYTHON_HOME}/bin:${HOME}/bin \ |
| `docker/Dockerfile.debian310:115` | module / top-level (nearest textual declaration) | RUN ln -sf ${QL_DIR}/shell/task.sh /usr/local/bin/task \ |
| `docker/Dockerfile.debian310:116` | module / top-level (nearest textual declaration) | && ln -sf ${QL_DIR}/shell/update.sh /usr/local/bin/ql \ |
| `docker/Dockerfile.debian310:119` | module / top-level (nearest textual declaration) | WORKDIR ${QL_DIR} |
| `docker/docker-entrypoint.sh:33` | ensure_ql_permissions (nearest textual declaration) | if ! mkdir -p "$QL_DIR/.tmp" 2>/dev/null; then |
| `docker/docker-entrypoint.sh:34` | ensure_ql_permissions (nearest textual declaration) | if chown -R "$current_uid:$current_gid" "$QL_DIR" 2>/dev/null; then |
| `docker/docker-entrypoint.sh:38` | ensure_ql_permissions (nearest textual declaration) | ql_owner=$(stat -c '%u' "$QL_DIR" 2>/dev/null \|\| stat -f '%u' "$QL_DIR" 2>/dev/null) |
| `docker/docker-entrypoint.sh:52` | ensure_ql_permissions (nearest textual declaration) | rmdir "$QL_DIR/.tmp" 2>/dev/null \|\| true |
| `docker/docker-entrypoint.sh:55` | ensure_ql_permissions (nearest textual declaration) | if [ ! -w "$QL_DIR/data" ] \|\| [ ! -x "$QL_DIR/data" ]; then |
| `docker/docker-entrypoint.sh:56` | ensure_ql_permissions (nearest textual declaration) | if chown "$current_uid:$current_gid" "$QL_DIR/data" 2>/dev/null; then |
| `docker/docker-entrypoint.sh:58` | ensure_ql_permissions (nearest textual declaration) | if [ ! -w "$QL_DIR/data" ] \|\| [ ! -x "$QL_DIR/data" ]; then |
| `docker/docker-entrypoint.sh:65` | ensure_ql_permissions (nearest textual declaration) | data_owner=$(stat -c '%u' "$QL_DIR/data" 2>/dev/null \|\| stat -f '%u' "$QL_DIR/data" 2>/dev/null) |
| `docker/docker-entrypoint.sh:99` | ensure_ql_permissions (nearest textual declaration) | if [ ! -w "$HOME" ]; then |
| `docker/docker-entrypoint.sh:100` | ensure_ql_permissions (nearest textual declaration) | mkdir -p "$QL_DIR/.tmp" |
| `docker/docker-entrypoint.sh:101` | ensure_ql_permissions (nearest textual declaration) | export HOME="$QL_DIR/.tmp" |
| `ecosystem.config.js:1` | module / top-level (nearest textual declaration) | const isContainer = process.env.QL_CONTAINER === 'true'; |
| `ecosystem.config.js:9` | module / top-level (nearest textual declaration) | pmx: !isContainer \|\| process.env.QL_PRIMARY_APM === 'true', |
| `sample/notify.js:173` | for (nearest textual declaration) | const v = process.env[key]; |
| `sample/notify.js:1693` | sendNotify (nearest textual declaration) | let skipTitle = process.env.SKIP_PUSH_TITLE; |
| `sample/notify.py:159` | print (nearest textual declaration) | if os.getenv(k): |
| `sample/notify.py:160` | print (nearest textual declaration) | v = os.getenv(k) |
| `sample/notify.py:1220` | send (nearest textual declaration) | skipTitle = os.getenv("SKIP_PUSH_TITLE") |
| `sample/tool.ts:5` | module / top-level (nearest textual declaration) | const accessKey = process.env.QINIU_AK; |
| `sample/tool.ts:6` | module / top-level (nearest textual declaration) | const secretKey = process.env.QINIU_SK; |
| `sample/tool.ts:10` | module / top-level (nearest textual declaration) | scope: \`${process.env.QINIU_SCOPE}:${key}\`, |
| `shell/check.sh:44` | pm2_log (nearest textual declaration) | local pm2Home="${PM2_HOME:-$HOME/.pm2}" |
| `shell/node_path_cache.sh:10` | ql_node_path_cache_key (nearest textual declaration) | printf '%s\n' 'v1' "$EUID" "$PWD" "$PATH" "${HOME:-}" \ |
| `shell/node_path_cache.sh:32` | ql_node_path_cache_key (nearest textual declaration) | for file in "${HOME:-}/.npmrc" \ |
| `shell/node_path_cache.sh:33` | ql_node_path_cache_key (nearest textual declaration) | "${XDG_CONFIG_HOME:-${HOME:-}/.config}/pnpm/rc" \ |
| `shell/otask.sh:79` | env_str_to_array (nearest textual declaration) | . $file_env |
| `shell/otask.sh:93` | append_node_dependency_path (nearest textual declaration) | export PREV_NODE_PATH="${NODE_PATH:=}" |
| `shell/otask.sh:96` | append_node_dependency_path (nearest textual declaration) | export NODE_PATH="${NODE_PATH:+${NODE_PATH}:}${dir_dep}" |
| `shell/otask.sh:107` | append_node_dependency_path (nearest textual declaration) | export NODE_PATH="${NODE_PATH:+${NODE_PATH}:}${pnpm_global_path}" |
| `shell/otask.sh:308` | check_file (nearest textual declaration) | if [[ -f $file_env ]]; then |
| `shell/otask.sh:312` | check_file (nearest textual declaration) | export PREV_PYTHONPATH="${PYTHONPATH:=}" |
| `shell/otask.sh:316` | check_file (nearest textual declaration) | export PYTHONPATH="${dir_preload}:${dir_config}:${PYTHONPATH}" |
| `shell/otask.sh:319` | check_file (nearest textual declaration) | . $file_env |
| `shell/preload/client.js:8` | module / top-level (nearest textual declaration) | process.env.QL_DATA_DIR \|\| join(process.env.QL_DIR, 'data'), |
| `shell/preload/client.js:25` | loadTlsCredentials (nearest textual declaration) | protoPath: join(process.env.QL_DIR, 'back/protos/api.proto'), |
| `shell/preload/client.js:26` | loadTlsCredentials (nearest textual declaration) | serverAddress: \`localhost:${process.env.GRPC_PORT \|\| '5500'}\`, |
| `shell/preload/client.py:194` | _execute_node (nearest textual declaration) | const api = require('{os.getenv("QL_DIR")}/shell/preload/client.js'); |
| `shell/preload/esm-loader.mjs:27` | if (nearest textual declaration) | process.env.QL_NODE_GLOBAL_PATH, |
| `shell/preload/sitecustomize.js:13` | preferGlobalNodeModules (nearest textual declaration) | const { QL_NODE_GLOBAL_PATH } = process.env; |
| `shell/preload/sitecustomize.js:68` | run (nearest textual declaration) | } = process.env; |
| `shell/preload/sitecustomize.js:71` | run (nearest textual declaration) | process.env.NODE_OPTIONS = PREV_NODE_OPTIONS; |
| `shell/preload/sitecustomize.js:81` | run (nearest textual declaration) | \`node -e "require('fs').writeFileSync('${tempFile}', JSON.stringify(process.env))"\`, |
| `shell/preload/sitecustomize.js:106` | for (nearest textual declaration) | process.env[key] = newEnvObject[key]; |
| `shell/preload/sitecustomize.js:141` | if (nearest textual declaration) | const array = (process.env[envParam] \|\| '').split('&'); |
| `shell/preload/sitecustomize.js:145` | if (nearest textual declaration) | process.env[envParam] = envStr; |
| `shell/preload/sitecustomize.py:41` | run (nearest textual declaration) | prev_pythonpath = os.getenv("PREV_PYTHONPATH", "") |
| `shell/preload/sitecustomize.py:42` | run (nearest textual declaration) | os.environ["PYTHONPATH"] = prev_pythonpath |
| `shell/preload/sitecustomize.py:45` | run (nearest textual declaration) | file_name = sys.argv[0].replace(f"{os.getenv('dir_scripts')}/", "") |
| `shell/preload/sitecustomize.py:52` | run (nearest textual declaration) | f'source {os.getenv("file_task_before")} {file_name}' |
| `shell/preload/sitecustomize.py:55` | run (nearest textual declaration) | task_before = os.getenv("task_before") |
| `shell/preload/sitecustomize.py:64` | run (nearest textual declaration) | python_cmd = f"python3 -c 'import os,json; f=open(\\\"{temp_file}\\\",\\\"w\\\"); json.dump(dict(os.environ),f); f.close()'" |
| `shell/preload/sitecustomize.py:78` | run (nearest textual declaration) | os.environ[key] = value |
| `shell/preload/sitecustomize.py:112` | run (nearest textual declaration) | env_param = os.getenv("envParam") |
| `shell/preload/sitecustomize.py:113` | run (nearest textual declaration) | num_param = os.getenv("numParam") |
| `shell/preload/sitecustomize.py:116` | run (nearest textual declaration) | array = (os.getenv(env_param) or "").split("&") |
| `shell/preload/sitecustomize.py:120` | run (nearest textual declaration) | os.environ[env_param] = env_str |
| `shell/share.sh:4` | module / top-level (nearest textual declaration) | export dir_root=$QL_DIR |
| `shell/share.sh:8` | module / top-level (nearest textual declaration) | if [[ ${QL_DATA_DIR:=} ]]; then |
| `shell/share.sh:9` | module / top-level (nearest textual declaration) | export dir_data="${QL_DATA_DIR%/}" |
| `shell/share.sh:29` | module / top-level (nearest textual declaration) | export file_env=$dir_preload/env.sh |
| `shell/share.sh:140` | detect_termux (nearest textual declaration) | if [[ $PATH == *com.termux* ]]; then |
| `shell/share.sh:374` | get_env_array (nearest textual declaration) | builtin mapfile -t exported_variables < <(awk "$export_name_program" "$file_env") |
| `shell/share.sh:379` | get_env_array (nearest textual declaration) | done < <(awk "$export_name_program" "$file_env") |
| `shell/start.sh:7` | module / top-level (nearest textual declaration) | if [[ ! $QL_DIR ]]; then |
| `shell/start.sh:18` | module / top-level (nearest textual declaration) | if [[ $QL_DIR ]]; then |
| `shell/start.sh:19` | module / top-level (nearest textual declaration) | t '请先手动设置 export QL_DIR=%s，环境变量，并手动添加到系统环境变量，然后再次执行命令 qinglong 启动服务' "$QL_DIR" |
| `shell/start.sh:25` | module / top-level (nearest textual declaration) | if [[ ! $QL_DATA_DIR ]]; then |
| `shell/start.sh:30` | module / top-level (nearest textual declaration) | if [[ $QL_DATA_DIR != */data ]]; then |
| `shell/start.sh:81` | module / top-level (nearest textual declaration) | export PNPM_HOME=${QL_DIR}/data/dep_cache/node |
| `shell/start.sh:82` | module / top-level (nearest textual declaration) | export PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 |
| `shell/start.sh:83` | module / top-level (nearest textual declaration) | export PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 |
| `shell/start.sh:94` | module / top-level (nearest textual declaration) | cd ${QL_DIR} |
| `shell/start.sh:96` | module / top-level (nearest textual declaration) | chmod 777 ${QL_DIR}/shell/*.sh |
| `shell/start.sh:98` | module / top-level (nearest textual declaration) | . ${QL_DIR}/shell/share.sh |
| `shell/start.sh:99` | module / top-level (nearest textual declaration) | . ${QL_DIR}/shell/env.sh |
| `shell/task.sh:3` | module / top-level (nearest textual declaration) | dir_shell=$QL_DIR/shell |
| `shell/update.sh:3` | module / top-level (nearest textual declaration) | dir_shell=$QL_DIR/shell |
## Deployment Assumptions Inventory

| File:line | Enclosing symbol / scope | Evidence |
|---|---|---|
| `back/config/const.ts:58` | module / top-level (nearest textual declaration) | 'Debian' \| 'Ubuntu' \| 'Alpine', |
| `back/config/const.ts:66` | module / top-level (nearest textual declaration) | Debian: { |
| `back/config/const.ts:67` | module / top-level (nearest textual declaration) | install: maybeSudo('apt-get install -y'), |
| `back/config/const.ts:68` | module / top-level (nearest textual declaration) | uninstall: maybeSudo('apt-get remove -y'), |
| `back/config/const.ts:75` | check (nearest textual declaration) | install: maybeSudo('apt-get install -y'), |
| `back/config/const.ts:76` | check (nearest textual declaration) | uninstall: maybeSudo('apt-get remove -y'), |
| `back/config/const.ts:82` | check (nearest textual declaration) | Alpine: { |
| `back/config/const.ts:83` | check (nearest textual declaration) | install: 'apk add --no-check-certificate', |
| `back/config/const.ts:84` | check (nearest textual declaration) | uninstall: 'apk del', |
| `back/config/const.ts:85` | check (nearest textual declaration) | info: 'apk info -es', |
| `back/config/container.ts:2` | isInContainer (nearest textual declaration) | return process.env.QL_CONTAINER === 'true'; |
| `back/config/index.ts:60` | if (nearest textual declaration) | if (!process.env.QL_DIR) { |
| `back/config/index.ts:65` | if (nearest textual declaration) | process.env.QL_DIR = qlHomePath.replace(/\/$/g, ''); |
| `back/config/index.ts:83` | if (nearest textual declaration) | const rootPath = process.env.QL_DIR as string; |
| `back/config/index.ts:88` | if (nearest textual declaration) | if (process.env.QL_DATA_DIR) { |
| `back/config/index.ts:89` | if (nearest textual declaration) | dataPath = process.env.QL_DATA_DIR.replace(/\/$/g, ''); |
| `back/config/serverEnv.ts:8` | getPickedEnv (nearest textual declaration) | const picked = pick(process.env, ['QlBaseUrl', 'DeployEnv', 'QL_DIR']); |
| `back/config/util.ts:19` | module / top-level (nearest textual declaration) | let osType: 'Debian' \| 'Ubuntu' \| 'Alpine' \| undefined; |
| `back/config/util.ts:21` | getOsTypeSync (nearest textual declaration) | function getOsTypeSync(): 'Debian' \| 'Ubuntu' \| 'Alpine' \| undefined { |
| `back/config/util.ts:24` | getOsTypeSync (nearest textual declaration) | if (envOs === 'alpine') return 'Alpine'; |
| `back/config/util.ts:25` | getOsTypeSync (nearest textual declaration) | if (envOs === 'debian') return 'Debian'; |
| `back/config/util.ts:33` | getOsTypeSync (nearest textual declaration) | execSync('which apt-get', { stdio: 'ignore' }); |
| `back/config/util.ts:34` | getOsTypeSync (nearest textual declaration) | return 'Debian'; |
| `back/config/util.ts:37` | getOsTypeSync (nearest textual declaration) | execSync('which apk', { stdio: 'ignore' }); |
| `back/config/util.ts:38` | getOsTypeSync (nearest textual declaration) | return 'Alpine'; |
| `back/config/util.ts:703` | getGetCommand (nearest textual declaration) | [DependenceTypes.linux]: getOsTypeSync() === 'Alpine' |
| `back/config/util.ts:704` | getGetCommand (nearest textual declaration) | ? \`apk info -es ${name}\` |
| `back/config/util.ts:716` | getInstallCommand (nearest textual declaration) | [DependenceTypes.linux]: getOsTypeSync() === 'Alpine' |
| `back/config/util.ts:717` | getInstallCommand (nearest textual declaration) | ? 'apk add --no-check-certificate' |
| `back/config/util.ts:718` | getInstallCommand (nearest textual declaration) | : maybeSudo('apt-get install -y'), |
| `back/config/util.ts:738` | if (nearest textual declaration) | [DependenceTypes.linux]: getOsTypeSync() === 'Alpine' |
| `back/config/util.ts:739` | if (nearest textual declaration) | ? 'apk del' |
| `back/config/util.ts:740` | if (nearest textual declaration) | : maybeSudo('apt-get remove -y'), |
| `back/config/util.ts:755` | isDebian (nearest textual declaration) | function isDebian(osReleaseInfo: string): boolean { |
| `back/config/util.ts:756` | isDebian (nearest textual declaration) | return osReleaseInfo.includes('Debian'); |
| `back/config/util.ts:767` | isAlpine (nearest textual declaration) | function isAlpine(osReleaseInfo: string): boolean { |
| `back/config/util.ts:768` | isAlpine (nearest textual declaration) | return osReleaseInfo.includes('Alpine'); |
| `back/config/util.ts:772` | isAlpine (nearest textual declaration) | 'Debian' \| 'Ubuntu' \| 'Alpine' \| undefined |
| `back/config/util.ts:777` | if (nearest textual declaration) | if (envOs === 'alpine') { |
| `back/config/util.ts:778` | if (nearest textual declaration) | osType = 'Alpine'; |
| `back/config/util.ts:781` | if (nearest textual declaration) | if (envOs === 'debian') { |
| `back/config/util.ts:782` | if (nearest textual declaration) | osType = 'Debian'; |
| `back/config/util.ts:794` | if (nearest textual declaration) | if (isDebian(osReleaseInfo)) { |
| `back/config/util.ts:795` | if (nearest textual declaration) | osType = 'Debian'; |
| `back/config/util.ts:798` | if (nearest textual declaration) | } else if (isAlpine(osReleaseInfo)) { |
| `back/config/util.ts:799` | if (nearest textual declaration) | osType = 'Alpine'; |
| `back/config/util.ts:856` | switch (nearest textual declaration) | case 'Debian': |
| `back/config/util.ts:857` | switch (nearest textual declaration) | filePath = '/etc/apt/sources.list.d/debian.sources'; |
| `back/config/util.ts:860` | if (nearest textual declaration) | return \`${S}sed -i 's\|${currentDomainWithScheme}\|${mirrorDomainWithScheme \|\| 'http://deb.debian.org'}\|g' ${filePath} \|\| (${S}mkdir -p /etc/apt/sources.list.d && echo -e "Types: deb\\nURIs: ${mirrorDomainWithScheme \|\| 'http://deb.debian.org'}\\nSuites: \\$(grep VERSION_CODENAME /etc/os-release \| cut -d= -f2) \\$(grep VERSION_CODENAME /etc/os-release \| cut -d= -f2)-updates\\nComponents: main\\nSigned-By: /usr/share/keyrings/debian-archive-keyring.gpg" \| ${S}tee ${filePath}) && ${S}apt-get update\`; |
| `back/config/util.ts:862` | if (nearest textual declaration) | return \`${S}mkdir -p /etc/apt/sources.list.d && echo -e "Types: deb\\nURIs: ${mirrorDomainWithScheme \|\| 'http://deb.debian.org'}\\nSuites: \\$(grep VERSION_CODENAME /etc/os-release \| cut -d= -f2) \\$(grep VERSION_CODENAME /etc/os-release \| cut -d= -f2)-updates\\nComponents: main\\nSigned-By: /usr/share/keyrings/debian-archive-keyring.gpg" \| ${S}tee ${filePath} && ${S}apt-get update\`; |
| `back/config/util.ts:868` | if (nearest textual declaration) | return \`${S}sed -i 's\|${currentDomainWithScheme}\|${mirrorDomainWithScheme \|\| 'http://archive.ubuntu.com'}\|g' ${filePath} \|\| (${S}mkdir -p /etc/apt/sources.list.d && echo -e "Types: deb\\nURIs: ${mirrorDomainWithScheme \|\| 'http://archive.ubuntu.com'}\\nSuites: \\$(grep VERSION_CODENAME /etc/os-release \| cut -d= -f2) \\$(grep VERSION_CODENAME /etc/os-release \| cut -d= -f2)-updates \\$(grep VERSION_CODENAME /etc/os-release \| cut -d= -f2)-backports\\nComponents: main restricted universe multiverse\\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg" \| ${S}tee ${filePath}) && ${S}apt-get update\`; |
| `back/config/util.ts:870` | if (nearest textual declaration) | return \`${S}mkdir -p /etc/apt/sources.list.d && echo -e "Types: deb\\nURIs: ${mirrorDomainWithScheme \|\| 'http://archive.ubuntu.com'}\\nSuites: \\$(grep VERSION_CODENAME /etc/os-release \| cut -d= -f2) \\$(grep VERSION_CODENAME /etc/os-release \| cut -d= -f2)-updates \\$(grep VERSION_CODENAME /etc/os-release \| cut -d= -f2)-backports\\nComponents: main restricted universe multiverse\\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg" \| ${S}tee ${filePath} && ${S}apt-get update\`; |
| `back/config/util.ts:872` | if (nearest textual declaration) | case 'Alpine': |
| `back/config/util.ts:873` | if (nearest textual declaration) | filePath = '/etc/apk/repositories'; |
| `back/config/util.ts:876` | if (nearest textual declaration) | return \`sed -i 's\|${currentDomainWithScheme}\|${mirrorDomainWithScheme \|\| 'http://dl-cdn.alpinelinux.org'}\|g' ${filePath} \|\| (mkdir -p /etc/apk && echo -e "\\$(grep VERSION_ID /etc/os-release \| cut -d= -f2 \| cut -d. -f1,2)/main\\n\\$(grep VERSION_ID /etc/os-release \| cut -d= -f2 \| cut -d. -f1,2)/community" \| sed "s\|^\|${mirrorDomainWithScheme \|\| 'http://dl-cdn.alpinelinux.org'}/alpine/v\|" \| tee ${filePath}) && apk update\`; |
| `back/config/util.ts:878` | if (nearest textual declaration) | return \`mkdir -p /etc/apk && echo -e "\\$(grep VERSION_ID /etc/os-release \| cut -d= -f2 \| cut -d. -f1,2)/main\\n\\$(grep VERSION_ID /etc/os-release \| cut -d= -f2 \| cut -d. -f1,2)/community" \| sed "s\|^\|${mirrorDomainWithScheme \|\| 'http://dl-cdn.alpinelinux.org'}/alpine/v\|" \| tee ${filePath} && apk update\`; |
| `back/loaders/initFile.ts:8` | module / top-level (nearest textual declaration) | const rootPath = process.env.QL_DIR as string; |
| `back/loaders/initFile.ts:11` | if (nearest textual declaration) | if (process.env.QL_DATA_DIR) { |
| `back/loaders/initFile.ts:12` | if (nearest textual declaration) | dataPath = process.env.QL_DATA_DIR.replace(/\/$/g, ''); |
| `back/schedule/health.ts:88` | catch (nearest textual declaration) | process.env.QL_CONTAINER === 'true' |
| `back/schedule/health.ts:89` | catch (nearest textual declaration) | ? 'PM2 file logging is disabled in containers. Check \`docker logs <container>\` for early startup errors.' |
| `back/services/dependence.ts:313` | if (nearest textual declaration) | let linuxCommand = {} as typeof LINUX_DEPENDENCE_COMMAND.Alpine; |
| `deploy/kubernetes/base/qinglong.yaml:45` | module / top-level (nearest textual declaration) | image: whyour/qinglong:debian |
| `deploy/kubernetes/overlays/example/kustomization.yaml:10` | module / top-level (nearest textual declaration) | newTag: debian |
| `docker/Dockerfile:2` | module / top-level (nearest textual declaration) | # 100% CPU when Alpine s390x is emulated through QEMU. |
| `docker/Dockerfile:3` | module / top-level (nearest textual declaration) | FROM --platform=$BUILDPLATFORM node:18-alpine3.18 AS builder |
| `docker/Dockerfile:11` | module / top-level (nearest textual declaration) | && apk add --no-cache git \ |
| `docker/Dockerfile:25` | module / top-level (nearest textual declaration) | FROM python:3.11-alpine |
| `docker/Dockerfile:33` | module / top-level (nearest textual declaration) | ENV QL_DIR=/ql \ |
| `docker/Dockerfile:35` | module / top-level (nearest textual declaration) | QL_CONTAINER=true \ |
| `docker/Dockerfile:48` | module / top-level (nearest textual declaration) | && apk update -f \ |
| `docker/Dockerfile:49` | module / top-level (nearest textual declaration) | && apk upgrade \ |
| `docker/Dockerfile:50` | module / top-level (nearest textual declaration) | && apk --no-cache add -f bash \ |
| `docker/Dockerfile:65` | module / top-level (nearest textual declaration) | && rm -rf /var/cache/apk/* \ |
| `docker/Dockerfile:66` | module / top-level (nearest textual declaration) | && apk update \ |
| `docker/Dockerfile:72` | module / top-level (nearest textual declaration) | && rm -rf /root/.cache \ |
| `docker/Dockerfile:77` | module / top-level (nearest textual declaration) | RUN git clone --depth=1 -b ${QL_BRANCH} ${QL_URL} ${QL_DIR} \ |
| `docker/Dockerfile:78` | module / top-level (nearest textual declaration) | && cd ${QL_DIR} \ |
| `docker/Dockerfile:81` | module / top-level (nearest textual declaration) | && chmod 777 ${QL_DIR}/shell/*.sh \ |
| `docker/Dockerfile:82` | module / top-level (nearest textual declaration) | && chmod 777 ${QL_DIR}/docker/*.sh |
| `docker/Dockerfile:86` | module / top-level (nearest textual declaration) | COPY docker/verify-build.cjs docker/build-manifest.cjs /tmp/ |
| `docker/Dockerfile:88` | module / top-level (nearest textual declaration) | RUN cd ${QL_DIR} && node /tmp/verify-build.cjs /tmp/dependency-lock.yaml |
| `docker/Dockerfile:90` | module / top-level (nearest textual declaration) | ENV PNPM_HOME=${QL_DIR}/data/dep_cache/node \ |
| `docker/Dockerfile:91` | module / top-level (nearest textual declaration) | PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile:92` | module / top-level (nearest textual declaration) | PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile:93` | module / top-level (nearest textual declaration) | HOME=/root |
| `docker/Dockerfile:104` | module / top-level (nearest textual declaration) | RUN ln -sf ${QL_DIR}/shell/task.sh /usr/local/bin/task \ |
| `docker/Dockerfile:105` | module / top-level (nearest textual declaration) | && ln -sf ${QL_DIR}/shell/update.sh /usr/local/bin/ql \ |
| `docker/Dockerfile:108` | module / top-level (nearest textual declaration) | WORKDIR ${QL_DIR} |
| `docker/Dockerfile:113` | module / top-level (nearest textual declaration) | ENTRYPOINT ["./docker/docker-entrypoint.sh"] |
| `docker/Dockerfile.310:2` | module / top-level (nearest textual declaration) | # 100% CPU when Alpine s390x is emulated through QEMU. |
| `docker/Dockerfile.310:3` | module / top-level (nearest textual declaration) | FROM --platform=$BUILDPLATFORM node:18-alpine3.18 AS builder |
| `docker/Dockerfile.310:11` | module / top-level (nearest textual declaration) | && apk add --no-cache git \ |
| `docker/Dockerfile.310:25` | module / top-level (nearest textual declaration) | FROM python:3.10-alpine |
| `docker/Dockerfile.310:33` | module / top-level (nearest textual declaration) | ENV QL_DIR=/ql \ |
| `docker/Dockerfile.310:35` | module / top-level (nearest textual declaration) | QL_CONTAINER=true \ |
| `docker/Dockerfile.310:48` | module / top-level (nearest textual declaration) | && apk update -f \ |
| `docker/Dockerfile.310:49` | module / top-level (nearest textual declaration) | && apk upgrade \ |
| `docker/Dockerfile.310:50` | module / top-level (nearest textual declaration) | && apk --no-cache add -f bash \ |
| `docker/Dockerfile.310:65` | module / top-level (nearest textual declaration) | && rm -rf /var/cache/apk/* \ |
| `docker/Dockerfile.310:66` | module / top-level (nearest textual declaration) | && apk update \ |
| `docker/Dockerfile.310:72` | module / top-level (nearest textual declaration) | && rm -rf /root/.cache \ |
| `docker/Dockerfile.310:77` | module / top-level (nearest textual declaration) | RUN git clone --depth=1 -b ${QL_BRANCH} ${QL_URL} ${QL_DIR} \ |
| `docker/Dockerfile.310:78` | module / top-level (nearest textual declaration) | && cd ${QL_DIR} \ |
| `docker/Dockerfile.310:81` | module / top-level (nearest textual declaration) | && chmod 777 ${QL_DIR}/shell/*.sh \ |
| `docker/Dockerfile.310:82` | module / top-level (nearest textual declaration) | && chmod 777 ${QL_DIR}/docker/*.sh |
| `docker/Dockerfile.310:86` | module / top-level (nearest textual declaration) | COPY docker/verify-build.cjs docker/build-manifest.cjs /tmp/ |
| `docker/Dockerfile.310:88` | module / top-level (nearest textual declaration) | RUN cd ${QL_DIR} && node /tmp/verify-build.cjs /tmp/dependency-lock.yaml |
| `docker/Dockerfile.310:90` | module / top-level (nearest textual declaration) | ENV PNPM_HOME=${QL_DIR}/data/dep_cache/node \ |
| `docker/Dockerfile.310:91` | module / top-level (nearest textual declaration) | PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.310:92` | module / top-level (nearest textual declaration) | PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.310:93` | module / top-level (nearest textual declaration) | HOME=/root |
| `docker/Dockerfile.310:104` | module / top-level (nearest textual declaration) | RUN ln -sf ${QL_DIR}/shell/task.sh /usr/local/bin/task \ |
| `docker/Dockerfile.310:105` | module / top-level (nearest textual declaration) | && ln -sf ${QL_DIR}/shell/update.sh /usr/local/bin/ql \ |
| `docker/Dockerfile.310:108` | module / top-level (nearest textual declaration) | WORKDIR ${QL_DIR} |
| `docker/Dockerfile.310:113` | module / top-level (nearest textual declaration) | ENTRYPOINT ["./docker/docker-entrypoint.sh"] |
| `docker/Dockerfile.debian:2` | module / top-level (nearest textual declaration) | # full Debian build matrix, including arm/v7, ppc64le, and s390x. |
| `docker/Dockerfile.debian:11` | module / top-level (nearest textual declaration) | apt-get update && \ |
| `docker/Dockerfile.debian:12` | module / top-level (nearest textual declaration) | apt-get install --no-install-recommends -y libatomic1 && \ |
| `docker/Dockerfile.debian:25` | module / top-level (nearest textual declaration) | ENV QL_DIR=/ql \ |
| `docker/Dockerfile.debian:27` | module / top-level (nearest textual declaration) | QL_CONTAINER=true \ |
| `docker/Dockerfile.debian:36` | module / top-level (nearest textual declaration) | mkdir -p /home/qinglong/bin /home/qinglong/.ssh && \ |
| `docker/Dockerfile.debian:37` | module / top-level (nearest textual declaration) | chmod 700 /home/qinglong/.ssh && \ |
| `docker/Dockerfile.debian:38` | module / top-level (nearest textual declaration) | chown -R ${QL_UID}:${QL_GID} /home/qinglong && \ |
| `docker/Dockerfile.debian:43` | module / top-level (nearest textual declaration) | ENV QL_HOME=/home/$QL_USER |
| `docker/Dockerfile.debian:51` | module / top-level (nearest textual declaration) | apt-get update && \ |
| `docker/Dockerfile.debian:52` | module / top-level (nearest textual declaration) | apt-get upgrade -y && \ |
| `docker/Dockerfile.debian:53` | module / top-level (nearest textual declaration) | apt-get install --no-install-recommends -y git \ |
| `docker/Dockerfile.debian:66` | module / top-level (nearest textual declaration) | apt-get clean && \ |
| `docker/Dockerfile.debian:74` | module / top-level (nearest textual declaration) | rm -rf /root/.cache && \ |
| `docker/Dockerfile.debian:75` | module / top-level (nearest textual declaration) | rm -rf /root/.npm && \ |
| `docker/Dockerfile.debian:77` | module / top-level (nearest textual declaration) | rm -rf /etc/apt/apt.conf.d/docker-clean && \ |
| `docker/Dockerfile.debian:80` | module / top-level (nearest textual declaration) | RUN mkdir -p ${QL_DIR} && \ |
| `docker/Dockerfile.debian:81` | module / top-level (nearest textual declaration) | chown -R ${QL_UID}:${QL_GID} ${QL_DIR} |
| `docker/Dockerfile.debian:86` | module / top-level (nearest textual declaration) | RUN git clone --depth=1 -b ${QL_BRANCH} ${QL_URL} ${QL_DIR} \ |
| `docker/Dockerfile.debian:87` | module / top-level (nearest textual declaration) | && cd ${QL_DIR} \ |
| `docker/Dockerfile.debian:90` | module / top-level (nearest textual declaration) | && chmod 777 ${QL_DIR}/shell/*.sh \ |
| `docker/Dockerfile.debian:91` | module / top-level (nearest textual declaration) | && chmod 777 ${QL_DIR}/docker/*.sh |
| `docker/Dockerfile.debian:95` | module / top-level (nearest textual declaration) | COPY docker/verify-build.cjs docker/build-manifest.cjs /tmp/ |
| `docker/Dockerfile.debian:97` | module / top-level (nearest textual declaration) | RUN cd ${QL_DIR} && node /tmp/verify-build.cjs /tmp/dependency-lock.yaml |
| `docker/Dockerfile.debian:99` | module / top-level (nearest textual declaration) | ENV PNPM_HOME=${QL_DIR}/data/dep_cache/node \ |
| `docker/Dockerfile.debian:100` | module / top-level (nearest textual declaration) | PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.debian:101` | module / top-level (nearest textual declaration) | PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.debian:102` | module / top-level (nearest textual declaration) | HOME=/home/qinglong |
| `docker/Dockerfile.debian:115` | module / top-level (nearest textual declaration) | RUN ln -sf ${QL_DIR}/shell/task.sh /usr/local/bin/task \ |
| `docker/Dockerfile.debian:116` | module / top-level (nearest textual declaration) | && ln -sf ${QL_DIR}/shell/update.sh /usr/local/bin/ql \ |
| `docker/Dockerfile.debian:119` | module / top-level (nearest textual declaration) | WORKDIR ${QL_DIR} |
| `docker/Dockerfile.debian:124` | module / top-level (nearest textual declaration) | ENTRYPOINT ["./docker/docker-entrypoint.sh"] |
| `docker/Dockerfile.debian310:2` | module / top-level (nearest textual declaration) | # full Debian build matrix, including arm/v7, ppc64le, and s390x. |
| `docker/Dockerfile.debian310:11` | module / top-level (nearest textual declaration) | apt-get update && \ |
| `docker/Dockerfile.debian310:12` | module / top-level (nearest textual declaration) | apt-get install --no-install-recommends -y libatomic1 && \ |
| `docker/Dockerfile.debian310:25` | module / top-level (nearest textual declaration) | ENV QL_DIR=/ql \ |
| `docker/Dockerfile.debian310:27` | module / top-level (nearest textual declaration) | QL_CONTAINER=true \ |
| `docker/Dockerfile.debian310:36` | module / top-level (nearest textual declaration) | mkdir -p /home/qinglong/bin /home/qinglong/.ssh && \ |
| `docker/Dockerfile.debian310:37` | module / top-level (nearest textual declaration) | chmod 700 /home/qinglong/.ssh && \ |
| `docker/Dockerfile.debian310:38` | module / top-level (nearest textual declaration) | chown -R ${QL_UID}:${QL_GID} /home/qinglong && \ |
| `docker/Dockerfile.debian310:43` | module / top-level (nearest textual declaration) | ENV QL_HOME=/home/$QL_USER |
| `docker/Dockerfile.debian310:50` | module / top-level (nearest textual declaration) | apt-get update && \ |
| `docker/Dockerfile.debian310:51` | module / top-level (nearest textual declaration) | apt-get upgrade -y && \ |
| `docker/Dockerfile.debian310:52` | module / top-level (nearest textual declaration) | apt-get install --no-install-recommends -y git \ |
| `docker/Dockerfile.debian310:65` | module / top-level (nearest textual declaration) | apt-get clean && \ |
| `docker/Dockerfile.debian310:73` | module / top-level (nearest textual declaration) | rm -rf /root/.cache && \ |
| `docker/Dockerfile.debian310:74` | module / top-level (nearest textual declaration) | rm -rf /root/.npm && \ |
| `docker/Dockerfile.debian310:76` | module / top-level (nearest textual declaration) | rm -rf /etc/apt/apt.conf.d/docker-clean && \ |
| `docker/Dockerfile.debian310:79` | module / top-level (nearest textual declaration) | RUN mkdir -p ${QL_DIR} && \ |
| `docker/Dockerfile.debian310:80` | module / top-level (nearest textual declaration) | chown -R ${QL_UID}:${QL_GID} ${QL_DIR} |
| `docker/Dockerfile.debian310:86` | module / top-level (nearest textual declaration) | RUN git clone --depth=1 -b ${QL_BRANCH} ${QL_URL} ${QL_DIR} \ |
| `docker/Dockerfile.debian310:87` | module / top-level (nearest textual declaration) | && cd ${QL_DIR} \ |
| `docker/Dockerfile.debian310:90` | module / top-level (nearest textual declaration) | && chmod 777 ${QL_DIR}/shell/*.sh \ |
| `docker/Dockerfile.debian310:91` | module / top-level (nearest textual declaration) | && chmod 777 ${QL_DIR}/docker/*.sh |
| `docker/Dockerfile.debian310:95` | module / top-level (nearest textual declaration) | COPY docker/verify-build.cjs docker/build-manifest.cjs /tmp/ |
| `docker/Dockerfile.debian310:97` | module / top-level (nearest textual declaration) | RUN cd ${QL_DIR} && node /tmp/verify-build.cjs /tmp/dependency-lock.yaml |
| `docker/Dockerfile.debian310:99` | module / top-level (nearest textual declaration) | ENV PNPM_HOME=${QL_DIR}/data/dep_cache/node \ |
| `docker/Dockerfile.debian310:100` | module / top-level (nearest textual declaration) | PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.debian310:101` | module / top-level (nearest textual declaration) | PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 \ |
| `docker/Dockerfile.debian310:102` | module / top-level (nearest textual declaration) | HOME=/home/qinglong |
| `docker/Dockerfile.debian310:115` | module / top-level (nearest textual declaration) | RUN ln -sf ${QL_DIR}/shell/task.sh /usr/local/bin/task \ |
| `docker/Dockerfile.debian310:116` | module / top-level (nearest textual declaration) | && ln -sf ${QL_DIR}/shell/update.sh /usr/local/bin/ql \ |
| `docker/Dockerfile.debian310:119` | module / top-level (nearest textual declaration) | WORKDIR ${QL_DIR} |
| `docker/Dockerfile.debian310:124` | module / top-level (nearest textual declaration) | ENTRYPOINT ["./docker/docker-entrypoint.sh"] |
| `docker/docker-compose.yml:3` | module / top-level (nearest textual declaration) | image: whyour/qinglong:latest # 基于 Debian 的版本：whyour/qinglong:debian |
| `docker/docker-entrypoint.sh:20` | log_with_style (nearest textual declaration) | # /ql/data 是 Docker Volume 挂载点，权限可能与 /ql 不同，需单独检测 |
| `docker/docker-entrypoint.sh:33` | ensure_ql_permissions (nearest textual declaration) | if ! mkdir -p "$QL_DIR/.tmp" 2>/dev/null; then |
| `docker/docker-entrypoint.sh:34` | ensure_ql_permissions (nearest textual declaration) | if chown -R "$current_uid:$current_gid" "$QL_DIR" 2>/dev/null; then |
| `docker/docker-entrypoint.sh:38` | ensure_ql_permissions (nearest textual declaration) | ql_owner=$(stat -c '%u' "$QL_DIR" 2>/dev/null \|\| stat -f '%u' "$QL_DIR" 2>/dev/null) |
| `docker/docker-entrypoint.sh:45` | ensure_ql_permissions (nearest textual declaration) | log_with_style "ERROR" "  1. 使用镜像内置用户: docker run --user ${ql_owner:-5432}:${ql_owner:-5432} ..." |
| `docker/docker-entrypoint.sh:52` | ensure_ql_permissions (nearest textual declaration) | rmdir "$QL_DIR/.tmp" 2>/dev/null \|\| true |
| `docker/docker-entrypoint.sh:55` | ensure_ql_permissions (nearest textual declaration) | if [ ! -w "$QL_DIR/data" ] \|\| [ ! -x "$QL_DIR/data" ]; then |
| `docker/docker-entrypoint.sh:56` | ensure_ql_permissions (nearest textual declaration) | if chown "$current_uid:$current_gid" "$QL_DIR/data" 2>/dev/null; then |
| `docker/docker-entrypoint.sh:58` | ensure_ql_permissions (nearest textual declaration) | if [ ! -w "$QL_DIR/data" ] \|\| [ ! -x "$QL_DIR/data" ]; then |
| `docker/docker-entrypoint.sh:65` | ensure_ql_permissions (nearest textual declaration) | data_owner=$(stat -c '%u' "$QL_DIR/data" 2>/dev/null \|\| stat -f '%u' "$QL_DIR/data" 2>/dev/null) |
| `docker/docker-entrypoint.sh:79` | ensure_ql_permissions (nearest textual declaration) | # Fix DNS resolution issues in Alpine Linux |
| `docker/docker-entrypoint.sh:80` | ensure_ql_permissions (nearest textual declaration) | if [ -f /etc/alpine-release ]; then |
| `docker/docker-entrypoint.sh:97` | ensure_ql_permissions (nearest textual declaration) | # 自定义用户（非 qinglong/root）可能 HOME 为空或不可写 |
| `docker/docker-entrypoint.sh:100` | ensure_ql_permissions (nearest textual declaration) | mkdir -p "$QL_DIR/.tmp" |
| `docker/docker-entrypoint.sh:101` | ensure_ql_permissions (nearest textual declaration) | export HOME="$QL_DIR/.tmp" |
| `ecosystem.config.js:1` | module / top-level (nearest textual declaration) | const isContainer = process.env.QL_CONTAINER === 'true'; |
| `ecosystem.config.js:18` | module / top-level (nearest textual declaration) | // visible through \`docker logs\` before Winston is initialized. |
| `sample/config.sample.sh:38` | module / top-level (nearest textual declaration) | ## 是否自动启动bot，默认不启动，设置为true时自动启动，目前需要自行克隆bot仓库所需代码，存到ql/repo目录下，文件夹命名为dockerbot |
| `sample/config.sample.sh:182` | module / top-level (nearest textual declaration) | ## CHRONOCAT相关API https://chronocat.vercel.app/install/docker/official/ |
| `sample/notify.js:131` | get (nearest textual declaration) | // CHRONOCAT API https://chronocat.vercel.app/install/docker/official/ |
| `scripts/write-build-info.cjs:5` | module / top-level (nearest textual declaration) | const { collectBuildFiles } = require('../docker/build-manifest.cjs'); |
| `shell/bot.sh:5` | module / top-level (nearest textual declaration) | repo_path="${dir_repo}/dockerbot" |
| `shell/bot.sh:24` | module / top-level (nearest textual declaration) | alpine) |
| `shell/bot.sh:25` | module / top-level (nearest textual declaration) | $SUDO apk --no-cache add -f zlib-dev gcc jpeg-dev python3-dev musl-dev freetype-dev |
| `shell/bot.sh:27` | module / top-level (nearest textual declaration) | debian\|ubuntu) |
| `shell/bot.sh:28` | module / top-level (nearest textual declaration) | $SUDO apt-get install -y gcc python3-dev musl-dev zlib1g-dev libjpeg-dev libfreetype-dev |
| `shell/check.sh:39` | pm2_log (nearest textual declaration) | if [[ "$QL_CONTAINER" == "true" ]]; then |
| `shell/check.sh:40` | pm2_log (nearest textual declaration) | t '---> 容器内 PM2 日志不落盘；早期启动错误请执行 docker logs --tail 300 <容器名>' |
| `shell/lang/en.sh:88` | module / top-level (nearest textual declaration) | ['---> 容器内 PM2 日志不落盘；早期启动错误请执行 docker logs --tail 300 <容器名>']='---> PM2 logs are not persisted in containers; run docker logs --tail 300 <container> for early startup errors' |
| `shell/lang/en.sh:105` | module / top-level (nearest textual declaration) | ['请先手动设置 export QL_DIR=%s，环境变量，并手动添加到系统环境变量，然后再次执行命令 qinglong 启动服务']='Set env: export QL_DIR=%s, then run qinglong to start' |
| `shell/lang/en.sh:106` | module / top-level (nearest textual declaration) | ['请先手动设置数据存储目录 export QL_DATA_DIR 环境变量，目录必须以斜杠开头的绝对路径，并且以 /data 结尾，例如 /ql/data 并手动添加到系统环境变量']='Set QL_DATA_DIR (absolute path ending with /data, e.g. /ql/data)' |
| `shell/lang/en.sh:107` | module / top-level (nearest textual declaration) | ['QL_DATA_DIR 必须以 /data 结尾，例如 /ql/data，如果有历史数据，请新建 data 目录，把历史数据放到 data 目录中']='QL_DATA_DIR must end with /data, e.g. /ql/data' |
| `shell/lang/zh.sh:88` | module / top-level (nearest textual declaration) | ['---> 容器内 PM2 日志不落盘；早期启动错误请执行 docker logs --tail 300 <容器名>']='---> 容器内 PM2 日志不落盘；早期启动错误请执行 docker logs --tail 300 <容器名>' |
| `shell/lang/zh.sh:105` | module / top-level (nearest textual declaration) | ['请先手动设置 export QL_DIR=%s，环境变量，并手动添加到系统环境变量，然后再次执行命令 qinglong 启动服务']='请先手动设置 export QL_DIR=%s，环境变量，并手动添加到系统环境变量，然后再次执行命令 qinglong 启动服务' |
| `shell/lang/zh.sh:106` | module / top-level (nearest textual declaration) | ['请先手动设置数据存储目录 export QL_DATA_DIR 环境变量，目录必须以斜杠开头的绝对路径，并且以 /data 结尾，例如 /ql/data 并手动添加到系统环境变量']='请先手动设置数据存储目录 export QL_DATA_DIR 环境变量，目录必须以斜杠开头的绝对路径，并且以 /data 结尾，例如 /ql/data 并手动添加到系统环境变量' |
| `shell/lang/zh.sh:107` | module / top-level (nearest textual declaration) | ['QL_DATA_DIR 必须以 /data 结尾，例如 /ql/data，如果有历史数据，请新建 data 目录，把历史数据放到 data 目录中']='QL_DATA_DIR 必须以 /data 结尾，例如 /ql/data，如果有历史数据，请新建 data 目录，把历史数据放到 data 目录中' |
| `shell/node_path_cache.sh:74` | ql_read_node_path_cache (nearest textual declaration) | # BusyBox flock (Alpine) has no -w. Both implementations support -n; |
| `shell/preload/client.js:8` | module / top-level (nearest textual declaration) | process.env.QL_DATA_DIR \|\| join(process.env.QL_DIR, 'data'), |
| `shell/preload/client.js:25` | loadTlsCredentials (nearest textual declaration) | protoPath: join(process.env.QL_DIR, 'back/protos/api.proto'), |
| `shell/preload/client.py:194` | _execute_node (nearest textual declaration) | const api = require('{os.getenv("QL_DIR")}/shell/preload/client.js'); |
| `shell/share.sh:4` | module / top-level (nearest textual declaration) | export dir_root=$QL_DIR |
| `shell/share.sh:8` | module / top-level (nearest textual declaration) | if [[ ${QL_DATA_DIR:=} ]]; then |
| `shell/share.sh:9` | module / top-level (nearest textual declaration) | export dir_data="${QL_DATA_DIR%/}" |
| `shell/share.sh:310` | reload_pm2 (nearest textual declaration) | if [[ "$QL_CONTAINER" == "true" ]]; then |
| `shell/start.sh:7` | module / top-level (nearest textual declaration) | if [[ ! $QL_DIR ]]; then |
| `shell/start.sh:11` | module / top-level (nearest textual declaration) | QL_DIR="$npm_dir/@whyour/qinglong" |
| `shell/start.sh:13` | module / top-level (nearest textual declaration) | QL_DIR="$pnpm_dir/@whyour/qinglong" |
| `shell/start.sh:18` | module / top-level (nearest textual declaration) | if [[ $QL_DIR ]]; then |
| `shell/start.sh:19` | module / top-level (nearest textual declaration) | t '请先手动设置 export QL_DIR=%s，环境变量，并手动添加到系统环境变量，然后再次执行命令 qinglong 启动服务' "$QL_DIR" |
| `shell/start.sh:25` | module / top-level (nearest textual declaration) | if [[ ! $QL_DATA_DIR ]]; then |
| `shell/start.sh:26` | module / top-level (nearest textual declaration) | t '请先手动设置数据存储目录 export QL_DATA_DIR 环境变量，目录必须以斜杠开头的绝对路径，并且以 /data 结尾，例如 /ql/data 并手动添加到系统环境变量' |
| `shell/start.sh:30` | module / top-level (nearest textual declaration) | if [[ $QL_DATA_DIR != */data ]]; then |
| `shell/start.sh:31` | module / top-level (nearest textual declaration) | t 'QL_DATA_DIR 必须以 /data 结尾，例如 /ql/data，如果有历史数据，请新建 data 目录，把历史数据放到 data 目录中' |
| `shell/start.sh:51` | module / top-level (nearest textual declaration) | alpine) |
| `shell/start.sh:52` | module / top-level (nearest textual declaration) | $SUDO apk update |
| `shell/start.sh:53` | module / top-level (nearest textual declaration) | $SUDO apk add -f bash \ |
| `shell/start.sh:67` | module / top-level (nearest textual declaration) | debian\|ubuntu) |
| `shell/start.sh:68` | module / top-level (nearest textual declaration) | $SUDO apt-get update |
| `shell/start.sh:69` | module / top-level (nearest textual declaration) | $SUDO apt-get install -y git curl wget tzdata perl openssl jq nginx procps netcat-openbsd openssh-client |
| `shell/start.sh:81` | module / top-level (nearest textual declaration) | export PNPM_HOME=${QL_DIR}/data/dep_cache/node |
| `shell/start.sh:82` | module / top-level (nearest textual declaration) | export PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 |
| `shell/start.sh:83` | module / top-level (nearest textual declaration) | export PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 |
| `shell/start.sh:94` | module / top-level (nearest textual declaration) | cd ${QL_DIR} |
| `shell/start.sh:96` | module / top-level (nearest textual declaration) | chmod 777 ${QL_DIR}/shell/*.sh |
| `shell/start.sh:98` | module / top-level (nearest textual declaration) | . ${QL_DIR}/shell/share.sh |
| `shell/start.sh:99` | module / top-level (nearest textual declaration) | . ${QL_DIR}/shell/env.sh |
| `shell/task.sh:3` | module / top-level (nearest textual declaration) | dir_shell=$QL_DIR/shell |
| `shell/update.sh:3` | module / top-level (nearest textual declaration) | dir_shell=$QL_DIR/shell |
| `shell/update.sh:293` | reload_qinglong (nearest textual declaration) | if [[ "${QL_BRANCH}" == "develop" ]] \|\| [[ "${QL_BRANCH}" == "debian" ]] \|\| [[ "${QL_BRANCH}" == "debian-dev" ]]; then |
| `shell/update.sh:298` | reload_qinglong (nearest textual declaration) | rm -rf ${dir_root}/back ${dir_root}/cli ${dir_root}/docker ${dir_root}/sample ${dir_root}/shell ${dir_root}/src |
| `shell/update.sh:329` | update_qinglong (nearest textual declaration) | if [[ "${QL_BRANCH}" == "develop" ]] \|\| [[ "${QL_BRANCH}" == "debian" ]] \|\| [[ "${QL_BRANCH}" == "debian-dev" ]]; then |
| `src/locales/en-US.json:2` | module / top-level (nearest textual declaration) | "1. 宿主机执行 docker run --rm -v\n                  /var/run/docker.sock:/var/run/docker.sock\n                  containrrr/watchtower -cR <容器名>": "1. Execute 'docker run --rm -v /var/run/docker.sock:/var/run/docker.sock containrrr/watchtower -cR <container_name>' on the host machine", |
| `src/locales/en-US.json:15` | module / top-level (nearest textual declaration) | "Chronocat Red 服务的连接地址 https://chronocat.vercel.app/install/docker/official/": "Connection address of the Chronocat Red service https://chronocat.vercel.app/install/docker/official/", |
| `src/locales/en-US.json:35` | module / top-level (nearest textual declaration) | "alpine linux 镜像源": "Alpine Linux Mirror Source", |
| `src/locales/en-US.json:38` | module / top-level (nearest textual declaration) | "docker安装在持久化config目录下的chronocat.yml文件可找到": "The docker installation can be found in the persistence config directory in the chronocat.yml file", |
| `src/locales/zh-CN.json:2` | module / top-level (nearest textual declaration) | "1. 宿主机执行 docker run --rm -v\n                  /var/run/docker.sock:/var/run/docker.sock\n                  containrrr/watchtower -cR <容器名>": "1. 宿主机执行 docker run --rm -v\n                  /var/run/docker.sock:/var/run/docker.sock\n                  containrrr/watchtower -cR <容器名>", |
| `src/locales/zh-CN.json:15` | module / top-level (nearest textual declaration) | "Chronocat Red 服务的连接地址 https://chronocat.vercel.app/install/docker/official/": "Chronocat Red 服务的连接地址 https://chronocat.vercel.app/install/docker/official/", |
| `src/locales/zh-CN.json:34` | module / top-level (nearest textual declaration) | "alpine linux 镜像源": "alpine linux 镜像源", |
| `src/locales/zh-CN.json:37` | module / top-level (nearest textual declaration) | "docker安装在持久化config目录下的chronocat.yml文件可找到": "docker安装在持久化config目录下的chronocat.yml文件可找到", |
| `src/pages/error/index.tsx:83` | if (nearest textual declaration) | 1. 宿主机执行 docker run --rm -v |
| `src/pages/error/index.tsx:84` | if (nearest textual declaration) | /var/run/docker.sock:/var/run/docker.sock |
| `src/pages/setting/dependence.tsx:215` | if (nearest textual declaration) | tooltip={intl.get('debian linux 镜像源')} |
| `src/utils/config.ts:478` | module / top-level (nearest textual declaration) | 'Chronocat Red 服务的连接地址 https://chronocat.vercel.app/install/docker/official/', |
| `src/utils/config.ts:492` | module / top-level (nearest textual declaration) | 'docker安装在持久化config目录下的chronocat.yml文件可找到', |
| `src/utils/index.ts:317` | if (nearest textual declaration) | const scriptDir = \`${window.__ENV__QL_DIR}/data/scripts\`; |
| `src/utils/monaco/index.ts:82` | module / top-level (nearest textual declaration) | '.dockerignore', |

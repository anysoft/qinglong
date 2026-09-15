# Filesystem Layout / Deployment Assumptions

> Phase 0 历史快照：本文记录重构前基线。当前代码已新增 GitCredential / Repository、可空订阅引用及兼容适配器；现状增量、测试和限制见 [Phase 1 报告](../../PHASE1_REPORT.md)。旧执行管线保持基线行为。

路径权威：`back/config/index.ts`、`back/loaders/initFile.ts`、`shell/share.sh` 顶层、Dockerfile 环境定义。下面是代码布局，不是对用户数据目录的扫描。

```text
QL_DIR/                        # backend推导源码/构建根或使用环境覆盖
├── .env                       # Backend启动配置，config加载时要求存在
├── .tmp/                      # 下载、恢复、node path cache等
├── shell/preload/
│   ├── env.sh / env.js / env.py
│   ├── __ql_notify__.js / __ql_notify__.py
│   └── lang_env.sh
├── sample/                    # 模板、示例；非运行数据真相源
├── static/build/              # Backend构建
├── static/dist/               # Frontend构建
└── data/                      # 默认；多数代码尊重QL_DATA_DIR覆盖
    ├── db/
    │   ├── database.sqlite
    │   └── keyv.sqlite
    ├── repo/<uniq_path>/       # shallow clones，可被rm -rf
    ├── raw/                   # raw订阅下载
    ├── scripts/<uniq_path>/   # 复制的脚本，手工文件与notify
    ├── config/
    │   ├── config.sh
    │   ├── crontab.list
    │   ├── auth.json / token.json
    │   ├── task_before.sh / .js / .py
    │   ├── task_after.sh / extra.sh
    │   ├── dependence-proxy.sh
    │   ├── grpc/               # gRPC证书材料
    │   └── bak/                # 配置备份路径
    ├── log/
    │   ├── .tmp/              # subscription扫描清单
    │   ├── update/
    │   └── <task-or-alias>/*.log
    ├── syslog/*.log
    ├── deps/                  # 用户共享辅助文件，不是pip prefix
    ├── dep_cache/
    │   ├── node/              # PNPM_HOME及安装目录
    │   └── python3/           # prefix/site-packages + pip下载缓存
    ├── ssh.d/                 # key、host config
    ├── bak/                   # 备份
    └── upload/                # 上传文件（如头像）
HOME/.ssh/config               # Include data/ssh.d/*.config
HOME/bin/{ql,task}             # loaders/deps建立symlink
/tmp/env_<pid>.json            # preload before环境回传，含可能敏感值
```

| 路径 | Owner / Purpose | 分类 / Persistent | Safe to delete? / Rebuildable? |
|---|---|---|---|
| db/database.sqlite | 所有业务模型 | Source of Truth / 是 | 否；只能备份恢复 |
| db/keyv.sqlite | shareStore跨worker缓存 | Generated + auth runtime / 是 | 运行中否；需受控重启从DB恢复，不能假设缓存无secret |
| repo | Subscription Git snapshot | Generated，但可能有用户本地更改 / 是 | 当前实现会删；不能当作保存worktree的可靠介质 |
| raw | file subscription下载 | Generated / 是 | 下载可恢复但离线/源删除时不可重建 |
| scripts | ScriptService + Subscription | 手工Source of Truth与复制数据混合 / 是 | 否；用户修改/生成文件不可保证重建 |
| config | Config/System/Auth/Hooks | Source of Truth混合生成文件 / 是 | 否；crontab.list/token可受控重建，不代表整个目录可删 |
| log/.tmp | scanner临时清单 | Runtime State / 文件持久但临时意义 | 仅无订阅执行时清理，可重建 |
| log | executor/subscription | 历史观测数据 / 是 | 可按留存策略删，不可重建相同历史 |
| syslog | Winston | 历史诊断 / 是 | 按7d轮转，非运行配置 |
| deps | 用户共享辅助包/文件 | Source of Truth / 是 | 否，非“缓存” |
| dep_cache/node、python3 | 依赖安装器 | 安装环境 + Cache / 是 | 运行时不可安全删；需重装并核验可重复性 |
| bak、config/bak | 备份/恢复 | Source of recovery / 是 | 仅按明确备份留存策略 |
| ssh.d + HOME/.ssh | SSH凭证及include | Secret/source + generated / 是 | 删除会中断Git；由DB可部分重建，不代表所有HOME SSH配置可覆盖 |
| upload | 用户上传 | Source of Truth / 是 | 否 |
| QL_DIR/.tmp | 更新包/node path cache/restore | Cache + Runtime State | 无更新/恢复/执行时才可清理；entrypoint可将它作为HOME |
| shell/preload/env.* | EnvService | Generated Secret / 源码树中可写文件 | 可重建；运行中删除会导致加载失败 |
| /tmp/env_PID.json | JS/Python preload | 临时Secret | 正常删除；异常残留需识别所有者/活跃PID后处理 |

## Deployment Assumptions

- Docker QL_DIR=/ql，VOLUME /ql/data；Dockerfile 中依赖 prefix 直接 `$QL_DIR/data/...`，不会因 QL_DATA_DIR 自动重算。
- Alpine 构建层 node:18，运行层 Python Alpine 并由 apk 安装 node/npm；Debian nodebuilder:20。构建 Node 与运行 Node 不是一个“可选择 Task runtime”。完整精确二进制需在镜像内 `node --version/python3 --version` 核验。
- `QL_CONTAINER==='true'` 是 Backend container 判断（config/container.ts），不是依赖 /.dockerenv；maybeSudo 对 container 返回 sudo 前缀。未发现专门 yum 依赖安装分支。
- Alpine apk；Debian/Ubuntu apt-get/dpkg；Native start 根据 OS 安装系统工具，有非 root sudo 处理。不应在审计主机执行 start.sh。
- Native start 要求 QL_DATA_DIR 为以 /data 结尾的绝对路径，但依赖环境仍用 QL_DIR/data。Backend config 对末尾 / 规范化，没有这个后缀要求。
- Docker entrypoint 处理 UID/GID、数据访问权限；HOME 不可写时回退 QL_DIR/.tmp。SSH 和命令 symlink 依赖 HOME 可写。
- Shell 要求 bash、git、perl、grep/egrep、find、curl、jq、date、cp 等；GNU/BSD date 分支存在，flock 在缺失平台降级。路径中空格/正则/branch slash 不能默认为已安全编码。
- `back/config/index.ts` 需 root .env；task launch shell=/bin/bash；生成 ENV 在 QL_DIR，只挂载data且源码只读可能出问题。
- `deploy/kubernetes/*` 是额外部署配置；不能把单Pod已有文件锁扩展为跨主机共享runtime锁。

完整逐行匹配见 12 清单。未启动容器、native 服务、Kubernetes，也未验证所有镜像 ABI，标为 NEED RUNTIME VERIFICATION。

## Phase 2 additive update

The Phase 0 layout above is historical. Persistent git/ and worktrees/ now coexist with unchanged repo/ and scripts/. See [Phase 2 filesystem and backup classification](phase2/06-filesystem-layout.md), including unique local commit/dirty data requirements; the Backup implementation has not changed.

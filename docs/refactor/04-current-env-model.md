> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](../architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# ENV 模型 / Config 边界

## Storage → Injection

`src/pages/env` → `back/api/env.ts` → `EnvService.create/update/disabled/enabled/remove` → Envs → `EnvService.set_envs`。数据库 name/value 是明文 STRING，无加密处理。UI 管理接口能返回实际值；任何密码样式显示都不是 at-rest encryption。

set_envs 读取 status=normal 且 name 非 null 的记录，按 envs 排序（isPinned DESC、position DESC、createdAt ASC），groupBy name，只接受 Bash 标识符。生成：

- `$QL_DIR/shell/preload/env.sh`：export NAME='value'，单引号 escape；组合后 trim。
- 同目录 env.js：process.env.NAME=`value`，转义反斜杠和反引号，但不转义 `${...}`。
- 同目录 env.py：os.environ['NAME']='''value'''，转义反斜杠/单引号。

三个文件用 writeFileWithLock 分别写，不是一次三文件事务；代码树可写假设，且文件不在 QL_DATA_DIR 中。Backend 不 source 它们，不把 Envs 写进主进程 process.env。

Task 在 import_config 时先 source config/config.sh。otask.check_file 对 Shell source env.sh；JS 用 NODE_OPTIONS -r sitecustomize.js→env.js；Python 用 PYTHONPATH 加 preload/config→sitecustomize.py→env.py。实际子进程获得 os.environ/process.env。普通自定义命令、清理 clear_non_sh_env 有额外差异，不能认为任意 command 都以完全同一方式注入。

## Scope / Duplicate / Disabled

- 仅 Global Envs；无 repo_id/task_id/runtime_id。配置脚本或用户命令可以手动覆盖，不是产品 scope。
- 重名 A/B 合并成 A&B；顺序决定 conc/desi 账号编号。name+value unique 不是 name unique。
- disabled 记录不会生成到三份文件；但**不保证进程绝对看不到同名变量**：父进程或 config.sh 可另提供，已启动进程保留旧快照。
- JS/Python 保留值首尾空格，Shell trim；pin/unPin 本身不调用 set_envs，下次重生成顺序可能改变。
- `${6*7}` 在 JS preload 中成为 42，而 Shell 中保持字面量，已有无害 characterization；后续修复必须单独评估兼容风险。

## Global ENV 消费者分类

| 类别 | 位置 / 函数 | 来源 / 与 Envs 表关系 |
|---|---|---|
| Backend internal | config/index.ts、serverEnv.ts、container.ts、http/grpc/config；完整行表见 12 | process.env 来自宿主/.env；不等于 Envs 表；包含监听、JWT、proxy、路径等 |
| Task runner | CronService.makeCommand、otask.check_file、preload env.* | 任务字段注入 + Envs 生成文件 + config.sh |
| Shell | share.import_config、env.sh store/restore、otask env_str_to_array/clear_env | config.sh、导出名清理、env.sh；shell/env.sh 本身是环境快照辅助，不是 Envs 生成文件 |
| Frontend | src/utils/config、api/env.js（serverEnv）以及 pages/env | 前端启动配置与管理 API；不能把前端 process.env 搜索命中理解为能读所有服务 secret |
| Notification | sample/notify.js env 读取、sample/notify.py os.environ；services/notify.ts | 脚本消费已注入 ENV；Backend 服务从 Auths.notification 获取参数 |
| Dependency install | config/const.ts PYTHON_HOME、util.getInstallCommand、DependenceService spawn | 继承服务进程 ENV，source dependence-proxy.sh；没有读取 Envs 表作为 installer scope |
| Subscription | ScheduleService spawn、update.sh source share/import_config | 继承服务进程 + config.sh proxy；未 source Envs 生成文件 |

[12-source-inventory.md](12-source-inventory.md) 给出逐文件/行证据（含命令、变量声明和注释，近邻符号是文本提示，不替代完整调用图）。未来 scoped ENV 只能在 task context 明确合并，不应污染 Backend、Git clone、installer。

## Config File 审计

`back/api/config.ts` files/detail/save 与 `ConfigService.getFile`：直接读取/写 config 文件，部分 `data/scripts/...` 路径转 scripts。writeFileWithLock、resolveFileAccess 黑名单/realpath 检查；旧 `/:file` 接口返回 410。不是 Config Asset Model，没有 Task FK、内容版本、secret encryption 或显式 scope。config/bak 是备份路径概念，不是内容版本管理契约。

发现路径差异：getFile 的 scripts 分支使用 config.scriptPath（尊重 QL_DATA_DIR），save 分支使用 join(config.rootPath,'data/scripts')。自定义 QL_DATA_DIR 时读写可能不一致；详见风险 R05。

Phase 1 以后建议：保留现有文件编辑 API 兼容层，另建 Config Asset 资源描述身份、版本、敏感标记与绑定，Resolver 再物化文件。不要把 config.sh 的全局可执行语义直接套到任意任务配置文件。本阶段不实施。

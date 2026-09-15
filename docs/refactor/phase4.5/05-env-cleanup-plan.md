# ENV Consolidation 审计

## 四个直接回答

1. **Phase 4 execution snapshot 现在还不足以替代 env.py/env.js。** resolver 返回 full variables，但 transport snapshot.json 仅写 overlay/unset/secretNames；它还读取并复制三个 legacy global 文件，且无 scoped 时直接 return null。
2. **Python 仍依赖 env.py。** sitecustomize.py 无 snapshot 时 import env，有 snapshot 时 exec global.py 副本。
3. **Node 仍依赖 env.js。** sitecustomize.js require global.js 副本或原 env.js。
4. **完成有限 transport 替换后，三语言可以统一使用 child process environment；当前不能直接删。** 目标：REMOVE in Phase 4.5B **after replacement gates**，若 gates 未完成就保留桥，不能标“立即可删”。

证据：services/taskEnvironmentResolver.ts:mergeTaskEnvironment/resolve；executionEnvironmentTransport.ts:prepare；shell/task_env.sh；otask.sh:check_file/env_str_to_array/clear_non_sh_env；preload/sitecustomize.*；EnvService.set_envs。

| 组件/语义 | 当前 | 目标/动作 |
| --- | --- | --- |
| Envs | name+value unique，按置顶/position/时间同名 & 聚合，明文 response | REPLACE Global key unique + 显式 is_secret/SET/UNSET；不迁移旧值 |
| duplicate aggregation | conc/desi 账号顺序依赖 | REMOVE；多账号用 Profile/不同 Task，不把 & 当隐式集合 |
| disabled | 忽略该条，可能看见 Base 同名 | KEEP “不参与”这一领域语义，去隐藏兼容逻辑；要删除用 UNSET |
| whitespace/template | Shell trim，JS eval template，Python literal | REMOVE；所有 scope 全语言原始字符串、无插值求值 |
| env.sh/js/py generator | 每次 Global CRUD 写三个程序 | REPLACE 后 REMOVE；只生成完整 env map，不生成 JS/Python 程序 |
| shell/env.sh | 启动 store/restore helper，非 Global 生成文件 | TEMPORARY_BRIDGE，不能被 env.* 通配删除 |
| /api/env.js | 前端启动配置 serverEnv | KEEP/RENAME；不是 Global Secret preload |
| scoped merge/Profile/UNSET/Secret | 已有资源与纯 merge | KEEP；替换 globals 聚合输入，扩展到 Global Secret |
| preloads | ENV+hooks+SDK+dependency+signals | 只先去 ENV import/apply 重复职责；其余留 5–10 |
| temp env files | private snapshot；before JSON 回传；旧 /tmp/env_PID.json | full env transport 保留安全临时机制；hook 回传待 Phase 5 |
| process.env mutation | Backend config defaults 与 Task preload 分属不同进程 | 不得全局搜索删除；Task child 可赋值，Backend 不注入业务 ENV |

## 4.5B 最小替换方案与 Gate

- Global 加入同一变量存储/校验/Secret DTO 契约，UI 合并到 Environment；unique key，取消排序影响值/账号隐式拆分。
- Resolver 用明确 Base Runtime allowlist（PATH/HOME/语言必须项）+Global+Profile+Task；不要默认把全部 backend process.env（JWT/服务凭据）当业务 Base。保留 profile precedence 和 fail-closed。
- 每次 Task（包括只有 Global、无 scopes）准备完整 resolved env；执行子进程使用该环境，预览与实际一致。clear_env/语言 preload 不能再次清掉它；UNSET 必须跨后续加载仍成立。
- 这是有限 ENV bridge 整合，不是 Phase 10 Runner 重写；保留现调度和 task.sh 的启动/退出责任。若实现需要改造所有 Runner 职责，4.5B 停在隔离适配并将后续工作列为阻塞，不能直接删生成器。
- **不能漏掉**：manual/runCron/system crond ID 入口，ScriptService 的无 ID `.swap` 运行（至少 Global），自定义 command，JS/mjs/TS、Python、Shell，hooks 和子进程。旧公开 CLI 不再承诺，但内部无 ID 使用不能消失。
- Gate：三语言 spaces/multiline/quotes/Unicode/$()/backticks 字面量一致；empty/disabled/UNSET；全局-only/no-ID；50 次并发不同 Profile；配置变更不改运行 snapshot；Secret 不入 API/log/argv；父环境不变；没有任何 env.js/env.py/global.js/global.py import/copy，启动不生成三文件。
- 通过后删生成器、文件路径配置和仅对应的 Global import。preload 的 hooks/QLAPI/依赖解析继续由明确 bridge 保留。

不把明文 SQLite 秘密变成自制加密；at-rest encryption 是独立后续安全改进。API masked 值不回填。Profile clone/reference protection、私有权限、cleanup、脱敏保留。

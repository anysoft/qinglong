# Final Fresh Operational Schema v1

状态：**PASS — Fresh v1 Schema Frozen for next development phase**。

## 最终模型

`back/loaders/db.ts` 将 15 个 ORM 模型及 PlatformMetadata 在一个 SQLite IMMEDIATE 事务直接创建，不先建旧表再 ALTER。Subscriptions.repository_id 为必填 FK；worktree_id 在准备完成前可空；URL、git_mode、type、credential override、pull/proxy/alias/command 已删除。Envs.name 唯一，value 为 TEXT，支持 SET/UNSET、is_secret 和 enabled/disabled（SDK 存储 status 数字）；position 不参与合并语义。Crontabs 继续作为 B15，新增 source_relative_path、discovery_key、discovery_definition 与 unique(sub_id, discovery_key)。

## 引导与拒绝策略

- `initializeOperationalSchema` 只接受空库或带唯一版本记录、匹配 model/schema signature、通过 FK 检查的 v1。
- 非空未知库、旧 QingLong 库及本阶段中间检查点库均抛出 `UNSUPPORTED_DATABASE_SCHEMA: This platform requires a fresh database.`。不升级、不 DROP、不 reset。
- DDL 失败事务回滚；重启仅验证，不执行 sync 或补列。
- 不导入 auth.json、不创建可用 admin/admin、不接受明文密码或旧 token 形状；管理员一次初始化设置哈希密码。
- 不自动安装依赖或执行 repo/raw/path migration；中断依赖操作仅取消，开机任务在 HTTP 就绪后启动。
- Fresh 目录使用私有权限、拒绝 symlink；不创建 repo/raw，不清理既有用户目录。

## 验收证据

`tests/platform/fresh-schema.test.cjs` 覆盖空库、版本/FK/签名、重启、未知库保留、DDL 回滚与 symlink；`bootstrap-data.test.cjs` 覆盖安全初始化与中断恢复，`bootstrap-failure.test.cjs` 保留启动失败边界。

`diagnostics/phase4.5b/platform-e2e.cjs` 已使用最终编译产物，从空目录实际启动 HTTP/gRPC，通过浏览器完成管理员、Credential、Repository、Subscription、Discovery、ENV、三语言运行、日志及重启再次执行，最后验证版本 1/FK/目录。

没有 checkpoint v1 → final v1 migration。Phase 5 以后若修改模型，必须设计新平台自身 v1 → future schema evolution；不得通过覆盖 v1 签名假装兼容。

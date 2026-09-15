# Immutable Node Builds

每次 Build 分配新 ID 与独立 node_modules。生成私有 package.json 和固定 npm/pnpm 配置。Build ID 路径在构建期间稳定，避免包中绝对路径在发布 rename 后失效；该目录在成功事务前不可被 Resolver 使用。

QUEUED → INSTALLING → VERIFYING → READY；Operation SUCCESS、快照、Current 指针在同一事务提交。失败、取消、进程中断分别记录 FAILED/CANCELLED/INTERRUPTED，保留旧 Current。成功 Build 的 identity、package/lock/resolved 快照由数据库 trigger 保护。

Verify 检查根目录所有权、Runtime/CLI hash、manifest/config/lock hash、包管理器实际 resolved graph、direct 包身份、node_modules 内链接边界。不会逐文件 hash 所有 node_modules，也不宣称检测任意同用户文件篡改。

History 支持 Diff、Verify、Promote、Export、删除非 Current Build。Promote 先验证旧 Build 再原子切换。Delete 取得 EX pin，先安全清理文件再事务删除记录；失败保留 ERROR/恢复信息，未知文件不删除。

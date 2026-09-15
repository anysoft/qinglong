# Immutable revisions and builds

Revision 有 SQLite UPDATE 拒绝触发器。Build identity 永不更新；已发布 resolved/hash/freeze/metadata 不可改写。READY 只允许保持 READY 或进入 DELETING。验证仅更新 health/verified_at，不重新安装包。

Build 生命周期：QUEUED → CREATING → INSTALLING → VERIFYING → READY；失败/取消/中断保留对应终态。失败保留旧 Current 和已保存的 Desired Revision，允许显式 Rebuild 生成新 Build。

成功提交：验证文件系统 → 日志 drain/fsync → 同一 DB transaction 保存 READY/snapshot + 切 Current/Desired/Runtime + operation SUCCESS。DB 失败时新目录仍未被 Current 引用，重启由 operation recovery 标记中断。

历史默认保留，手动删除只允许非 Current、无引用、取得排他 Build lease。Promote 旧 READY Build 先完整验证，再事务切指针；不重新安装。Diff 返回 Added/Removed/Changed；Freeze 是观察结果，不是强制 artifact hash 的可复现 lockfile。

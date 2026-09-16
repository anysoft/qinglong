# File operations

文件树每次只枚举一个目录，目录优先、按名称的确定顺序分页；默认200、最大1000条，单目录扫描上限100000条，超限明确拒绝。不会递归返回整个 Worktree。

读取返回相对路径、kind、size、mtime、mode、identity；普通文件附 SHA256、UTF-8/二进制判定、BOM/EOL、可编辑状态和 Git 状态。UTF-8 fatal decode 与 NUL 检测；2 MiB 编辑、10 MiB 预览，超限只返回 metadata，不把大文件装入编辑器。现有 BOM、CRLF/LF 和权限保留；新文件0644、UTF-8，不因 .sh 自动设置执行位。

保存同目录私有临时文件 → 完整写入 → chmod原mode → fsync → 再核验原文件 → rename → fsync父目录。新建用临时文件+排他link发布；删除只支持文件和空目录。重命名使用固定内部 POSIX no-replace helper（Darwin renamex_np / Linux renameat2），不允许覆盖目标。生产 helper 由持锁 supervisor 运行。

搜索只限当前 Worktree。固定字面量匹配、无 shell/正则表达式；不跟随 symlink。最多10000条扫描、200结果、单文件256 KiB、读取总预算32 MiB、3秒时间预算、目录深度64，达到限制返回 truncated。Gitignored/user依赖目录不改变安全边界。

保存期间另建同目录、平台保留名称的临时回滚副本；成功后立即删除，不写 data/bak。写入或发布失败保持原文件，发布后 fsync 失败恢复原字节和 mode。若恢复自身失败，保留原副本并返回 WORKSPACE_RECOVERY_REQUIRED，不自动清除未知文件。平台 lease 覆盖整个操作，备份不会观察其正常中间状态。

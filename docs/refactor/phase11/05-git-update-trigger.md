# Git Update Trigger

同步顺序固定为 Repository Fetch → Worktree Update → Discovery Reconcile → Git Update Event → ExecutionService.submit。TaskSource 推导所属 Worktree，不允许用户指定执行 Git 命令。

ANY_CHANGE 接受提交变化；SOURCE_CHANGE 只匹配入口文件；PATH_FILTER 匹配相对 glob。固定 argv 的 `git diff --no-ext-diff --no-textconv --name-only -z before after --` 复用现有 GitCommandService 与 guard。diff 失败关闭触发并记录 FAILED/GIT_DIFF_FAILED。

事件身份为 trigger_id + 仓库、Worktree、before/after 的摘要。相同提交无事件；首次同步缺省 SKIPPED，可显式 fire_on_initial。before 采用上次完整成功的订阅同步提交，使 Discovery 失败后的相同 Git HEAD 重试仍能补齐事件且不会重复提交。

提交前再次核对事件的 Repository/Worktree 与当前 TaskSource；绑定已改变则 SKIP，防止旧绑定的事件运行新绑定。

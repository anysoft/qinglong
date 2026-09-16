# Discovery Ownership

Task 身份为 `(subscription_id, SHA256(relative_entrypoint))`。重命名产生新身份，旧 Task 保留为停用记录。discovery_definition 是上次发现的 metadata，不是调度真相。

仅名称仍等于旧发现值时跟随源名称；保留用户 name override、arguments、enabled、Runtime、ENV、Config、Hooks、Settings。新 Task 只在资源 READY 时启用。分支重新绑定时只更新已发现 Source 的 Worktree 引用，保留 cwd 与其他声明。

Discovery Cron 使用 `(task_id,'source-cron')` 稳定身份。用户编辑接管为 USER，后续 reconcile 不改写。用户删除该 Cron 时保存 disabled USER 身份，防止再生。源 metadata 移除只删除仍为 DISCOVERY 的 Cron；额外 USER Trigger 永不覆盖。

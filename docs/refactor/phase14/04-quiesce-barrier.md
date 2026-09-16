# Cross-process quiesce

控制目录为 DATA_DIR 同级的 `<DATA_DIR>.platform-control`，不会随恢复切换。backup.lock 排他控制快照所有者；mutation.lock 共享租约覆盖业务修改，快照取得排他租约才读取源数据。barrier.json 是持久 admission 状态，不替代 FD 锁。

| Consumer | Admission / lifetime |
|---|---|
| Panel/Open API/公开 webhook | HTTP admission 加每个异步业务 route handler 的独立租约；断连不释放尚未完成的业务写入 |
| ExecutionService.submit | 普通 producer |
| Execution tick/execute/recover | QUIESCING 中允许既有 queue drain，覆盖最终清理 |
| TriggerScheduler / TriggerEvents | 暂停新触发，不改 next_fire_at 或 misfire |
| ManagedSubscription.exclusive | 覆盖 fetch、worktree、discovery、Git trigger critical section |
| RuntimeOperation request / execute / recover | producer 拒绝；既有操作完成后释放 |
| Python/Node environment metadata/build | 直接服务入口和 operation 生命周期共同保护 |
| NotificationDispatcher.deliver | 从 claim 到 send 结果落库，不接受新 delivery claim |
| ScheduleService / token | 排队回调、子进程、onEnd 全部结束后释放 |

AsyncLocalStorage 只记录 admission 继承；每个嵌套异步 operation 自己持 FD，不能在 HTTP 返回后失去保护。Runtime、Hook 和旧调度子进程继承平台租约。primary 的 backend.lock 继承给 cluster workers，离线 apply 必须先取得同一把排他锁。

RESTORE_PENDING 禁止新写入，备份状态和只读面板可继续访问。启动只在恢复 journal 处理之后清理 abandoned snapshot；坏 journal 或残留 pending 标记必须失败关闭。

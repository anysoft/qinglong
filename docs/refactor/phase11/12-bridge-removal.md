# Bridge Removal

B07：SubscriptionDiscoveryAdapter、ManagedSubscription.stage/copy/publish 和 TaskService.reconcileDiscoveredTasks 旧补偿入口删除；发现直接写 canonical Task + Trigger。

B03：任务 CRUD 与启动不再调用 autosave_crontab/setCrontab；Fresh Trigger 运行不需要 crontab.list 或系统 crond。物理清除残余 Linux 专用适配器 BLOCKED_BY_LINUX_GATE。

B04：Task 调度切换为 TriggerScheduler；订阅周期同步和系统维护仍使用 ScheduleService/node-schedule/gRPC，保留已知消费者。

B15：SchedulerProjection 不再由普通 Task 创建、更新、同步产生；历史表/旧 API/统计仍保留。TaskRun 是新执行结果来源。

B01 编辑器与既有脚本目录、B09/B10 bootstrap/Linux package、B14 历史日志保留。没有删除用户数据，也没有开始 Phase 12。

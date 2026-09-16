# Per-Run Logs / Live Follow

保持 data/log/task-runs/run-ID.log，单 Run 包含各 Attempt 按时间顺序的已脱敏输出。保留 Phase 10 的 drain/fsync 与日志 writer；redactor 改为只保留仍可能匹配 Secret 的尾部，安全短输出无需等待 MAIN 完成；attempt 时间和事件 sequence 辅助定位。

GET /api/task-runs/:id/log 接受 tail、offset、cursor、limit。默认 tail 64 KiB；tail=false 从头增量读取；limit 4..262144 字节，每次最多读取 limit+4。cursor 为 opaque base64 JSON，绑定 Run ID、offset、dev/ino。拒绝错 Run、越界、换 inode、符号链接、异常 owner/权限、任意 path/raw 参数。UTF-8 起止边界不拆码点。文件不存在时返回空内容及终态信息。

沿用已认证 SockJS /api/ws，RUN_LOG_SUBSCRIBE {runId,cursor} / RUN_LOG_UNSUBSCRIBE；每连接仅一个订阅、500ms bounded read，帧含 previous_cursor/content/cursor/terminal。现有 token 校验与到期检查保持。关闭连接/终态释放跟随计时器。

UI 以 HTTP cursor 为读进度权威，socket 帧唤醒读取，1 秒轮询作为断线兜底；刷新重新从文件读取并保留展示尾部 2 MiB。服务端读取始终有界，无独立 websocket server。大日志刷新追赶可能需要多次请求。

终态刷新 log_size/last_log_at；Dashboard 不递归扫描 DATA_DIR。当前没有截断/自动保留策略，log_truncated 默认 0。活跃日志大小与迁移前历史文件大小不承诺实时完整，按正式日志接口可取得实际 size。

旧 /logs API 的目录、读取、下载、删除拒绝 task-runs；rmlog 的 find prune 排除该目录。正常 Task/Runs UI 不再调用旧 Task path 日志。

剩余兼容读取：TaskExecutionBridge.log → ExecutionService.log 仍可返回 latest Run 的旧有界4MiB文本，供既有Task log API消费者使用；它不是normal Task/Runs UI的日志接口。内部执行测试也继续调用该方法，不存在raw未脱敏读取。退出条件见B14登记。

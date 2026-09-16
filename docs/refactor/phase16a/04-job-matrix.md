# Jobs and triggers

| Trigger | Core | Managed Runtime | Browser |
|---|---|---|---|
| pull_request | yes | no | no |
| push main/master/develop | yes | yes | no |
| push codex/** | yes | no | no |
| dispatch normal | yes | no | no |
| dispatch/call full | yes | yes | yes |

workflow_dispatch默认full；workflow_call提供同样scope接口。preflight15分钟、core45分钟、runtime/browser90分钟、summary10分钟。普通workflow+ref取消旧运行；full使用独立run ID并禁止新普通CI取消它。按scope跳过与测试skip分开报告。

Ubuntu的正式测试不允许skip；Darwin只承认已有三个node-path锁测试的明确名称。测试总数从真实TAP结尾读取，进程退出但没有完整TAP报告视为失败。

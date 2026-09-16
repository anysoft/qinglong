# Diagnostics and artifacts

每job上传linux-JOB-RUNID-SHA，保留30天。内部phase16a-JOB-RUNID-SHORTSHA.tar.gz包含ci-summary.json、preflight.json以及logs/tests/runtime/browser/static/cleanup。安全的小summary与tar同时上传，汇总job读取它们，不解包不可信归档。

收集顺序：正式Runtime资源清理操作与日志 → collect安全诊断 → 停止残留登记进程/删除owned根 → 写cleanup结果 → package。GitHub always补偿步骤覆盖通常的中断；机器强制消失时无法保证任何after步骤运行，不能承诺CANCELLED总有artifact。

仅允许JSON/log/txt/经脱敏的PNG；拒绝symlink、多硬链接、特殊文件、路径越界、SQLite/归档/运行时binary。单stage日志最多64MiB，超出立即失败并记录truncated；总诊断64MiB，超限失败并保留安全错误摘要，不静默删除关键日志。没有上传repository/node_modules/数据库/密钥/backup或明文staging。

随机fixture canary、固定历史canary和private-key标记均扫描。扫描失败整体FAIL、阻止tar发布、清除本次旧tar；只允许安全的失败summary。浏览器截图遮罩inputs/dialogs/editor与已登记秘密，网络仅method/path/status，hooks路径脱敏，不保存请求头/body。

最终diagnostics/ci/final-summary.json记录needs结果、真实测试数、类型预算、scope skip与上传失败。上传失败标为ARTIFACT_UPLOAD_FAILED，不能伪装测试通过或无artifact成功。

GitHub artifact名包含run attempt；汇总按needs.core.outputs.artifact选择确切的core证据，避免Re-run jobs时旧attempt覆盖新结果。workflow_call显式normal不会因调用者是develop push而额外启用managed job。

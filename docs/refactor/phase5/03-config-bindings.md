# Repository / Task Bindings

Repository 默认绑定与 Task 绑定分别持久化。同一 owner 的 `(target_base, normalized target_path)` 唯一。目标按 NFC 规范化，拒绝绝对路径、空段、`.`、`..`、反斜杠、NUL、超长路径和 `.git` 等内部段。

优先级：启用的 Repository ATTACH → 启用的 Task ATTACH/MASK。Task ATTACH 替换相同 key；MASK 删除继承项。禁用项不参与解析。手工 Task 无 Repository 时只解析自身绑定。

`WORKSPACE_ROOT` 指执行源逻辑根；`TASK_DIR` 指入口文件所在目录，不是用户指定 cwd。Config 领域只接收 TaskWorkspaceResolver 给出的 workspaceRoot/taskDir/cwd/resourceKey；当前 scripts 发布命名仅存在 B17 映射层。手工根禁止注入其他 publication 的保留命名空间。

最终物理目标还会去重，避免两个不同 base 指向同一文件。预览显示来源、目标、revision、模式和策略，不返回内容。Repository 删除诊断包括 config_bindings；标记 DELETING 后禁止新增绑定。Task 删除级联自身 bindings/hooks，不删除资产。

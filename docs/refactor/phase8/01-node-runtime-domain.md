# Node Runtime 与共享 Core

Node Runtime 是 RuntimeInstallation 中 language=NODE、implementation=NODEJS 的一行，provider 为 NODE_DISTRIBUTION。精确版本与资源 ID 分离：版本不能自动漂移，文件路径只用数据库 ID。Catalog 只保存 Provider metadata，不为未安装版本创建 Runtime。

复用 RuntimeProvider、RuntimeInstallation、RuntimeOperation、RuntimeReferenceService。NodeEnvironmentService 是领域处理器；排队、持久状态、日志、取消、超时和 recovery 均由 RuntimeOperationService 执行。没有第二套 Node Jobs。

Python 列表限定 PYTHON；Node 列表限定 NODE；通用 operation 列表支持 All/Python/Node。数据库 provider/language/implementation 约束阻止交叉身份，引用聚合器始终包含 Python 与 Node 来源。

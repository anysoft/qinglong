# Python Environment domain

Environment 是平台资源，由整数 ID 标识，名称只用于展示。Runtime 精确绑定 PYTHON/CPYTHON Installation，不属于 Repository；没有 Task/Hook 外键或自动发现。

- Environment：可乐观更新的名称/描述、Desired Revision、Current Build、状态、version。
- Revision：不可变 Runtime ID、结构化 PEP 508 dependencies、spec_hash。
- Build：不可变物化 generation，独有 venv、resolved snapshot、验证和主机信息。
- RuntimeOperation：唯一长操作框架；没有第二套 Job/取消/日志基础设施。

Desired Revision 可领先于 Current Build；失败的新依赖定义保留，旧 Current 继续可解析。切换 Runtime 必须创建 Revision/Build。Clone 复制定义并通过新 Build 物化，不复制 venv。

# Runtime Domain

Phase 6 管理平台拥有的 CPython **可执行运行时**。RuntimeProviders → RuntimeInstallations → RuntimeOperations 是新领域；目前 CHECK 限定 PYTHON/PYENV/CPYTHON，未来语言以显式 schema evolution 扩展，不建立空 Node 表。

Installation 唯一身份为 provider_id + implementation + exact version。Catalog 是 Provider JSON 缓存，不生成安装记录。删除保留 REMOVED tombstone 与操作历史，重复安装复用身份；活跃列表排除 tombstone。

RuntimeReferenceService 聚合引用来源；当前为空，Phase 7 必须注册 Environment 引用并在同一资源锁下保护创建/删除。没有 Task/Hook Runtime 字段、venv、依赖安装、运行时 ENV Profile。

当前 Task Python 继续 B02/B06 的解释器查找与 preload。安装 Runtime 不会改变 Task PATH、Backend Python 或系统解释器。

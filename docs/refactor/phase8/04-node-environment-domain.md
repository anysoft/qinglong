# Node Environment 与 Revision

Environment 保存名称、描述、Runtime/Toolchain、Desired Revision 和 Current Build 指针及 optimistic version。元数据编辑不触发 Build。依赖修改必须 expected_version 匹配，创建不可变 Revision，不能覆盖旧 Revision。

Revision 保存结构化 dependencies/devDependencies、production_only、install_scripts_policy、spec hash。服务与 API 均验证名称、版本范围和重复项；标准 npm name/semver 校验器来自所选 Runtime bundled npm。仅支持 registry semver specifications；tags、URL、file、workspace、Git、本地路径、任意 npm/pnpm 参数均不支持。

Desired 与 Resolved 分开：Desired 更新后构建失败，旧 Current 仍可用。Clone 复制定义及策略，创建新 Environment/Revision，再新建 Build，不复制 node_modules。

Resolver 只返回 READY + HEALTHY Current，固定 Runtime/Toolchain/Revision/Build、绝对 Node、lock hash 和 Build 目录，并提供 Build SH pin。API 预览序列化后释放 pin；未来执行消费者必须持有到运行结束。没有 Task、Hook 或 Repository binding。

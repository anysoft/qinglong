# Package Manager Toolchains

NodePackageManagerToolchains 独立记录 runtime_id、manager_type、exact version、state、verified_at 和 CLI metadata。身份不可修改；新版本创建新资源。删除后保留 REMOVED tombstone，允许重新安装相同身份。

PNPM 为推荐默认。本阶段适配 pnpm 10、最低 10.9.0；实测 10.17.1。该下限对应显式 dangerouslyAllowAllBuilds 策略。使用 managed Node + bundled npm 将 pnpm@exact 安装到私有 toolchain root；--ignore-scripts --engine-strict。不使用全局 npm/pnpm，不修改 Runtime 或系统 Node。

NPM 使用 bundled exact npm，记录为 Toolchain，不自动升级。执行始终是 managed absolute node + 已验证真实 CLI 文件，检查 engines.node 与所选 Node 相容及 CLI --version。Corepack 仅记录能力，不要求 corepack enable。

Runtime SH 与 Toolchain EX 锁防止安装/验证/删除冲突；Environment、Revision 和 Build 引用使删除失败。Yarn、pnpm 其他 major、独立 npm 升级延后。

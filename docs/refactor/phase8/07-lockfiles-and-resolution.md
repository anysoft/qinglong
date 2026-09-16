# Lockfiles 与 Resolution

READY Build 保存 package.json、pnpm-lock.yaml 或 package-lock.json 的内容与 SHA256，保存完整可遍历 resolved graph/hash 及 manager/runtime/policy metadata。

首次 Build 或显式 Re-resolve 使用 Desired Revision 重新求解。Rebuild 使用当前成功 Build 的原 Revision、同一 exact Runtime/Toolchain 和捕获锁文件；pnpm --frozen-lockfile / npm ci。Registry 新增兼容 transitive 版本不会使 Frozen Rebuild 漂移。

Diff 按包名比较版本集合，返回 Added/Removed/Changed，兼容同名多个 transitive 版本。production_only 控制 devDependencies 安装，Desired 仍保留 dev specification。

锁文件篡改使 Verify INVALID、Resolver 拒绝。原生扩展依赖主机 OS/arch/libc 和系统工具，锁文件可重复解析不代表跨平台二进制完全一致。原生编译失败必须显式失败，不切换 Current。

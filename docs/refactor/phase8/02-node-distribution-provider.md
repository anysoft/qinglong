# Official Node Distribution Provider

默认来源 https://nodejs.org/dist/index.json 。Catalog 保存 stable exact version、发布日期、LTS 标记和官方平台 artifacts。支持官方 darwin/linux 的 x64/arm64 tar.xz；Linux 官方构建需要兼容 glibc，musl/Alpine 没有本阶段验证。

安装顺序：精确 Catalog 校验 → 私有 Operation staging → 下载 SHASUMS256.txt 与精确 artifact → SHA256 比较 → 安全解包 → 绝对 Node 验证 → 原子 rename → ownership sidecar → READY。下载通过固定 curl 参数、协议和大小限制；没有 shell expansion。校验失败不会发布 Runtime，临时目录清理。

Python stdlib archive helper 先检查全部成员，拒绝 traversal、绝对路径、重复名称、symlink/hardlink 越界、特殊设备及超量文件；手动独占写入，链接最后创建。Node 验证读取 process.execPath/version/versions/platform/arch，检查精确身份并记录 bundled npm CLI/hash/version、Corepack 能力。

Repair 重新下载相同 exact artifact，验证 staging 后替换已确认所有权的旧目录；有任何 Environment/Revision/Build/Toolchain 引用时禁止 Repair/Remove。未知 inode 不接管、不删除。

供应链结论：**SHA256 verified against trusted upstream metadata**。没有实现 PGP signature verification，不将 HTTPS+SHA256 描述为签名验证。

实网证据见 diagnostics/phase8/managed-node/result.json；浏览器使用该已验证 binary 的复制 fixture，不能替代实网证据。

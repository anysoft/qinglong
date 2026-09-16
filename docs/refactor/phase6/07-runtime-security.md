# Security Contract

- API 仅面板登录路径可用；Open API 明确拒绝。沿用全局 token 校验，无新免鉴权路由。
- Joi 拒绝未知字段；version 经过 exact 格式 + Provider Catalog 双重校验；URL、path、command、arbitrary code、mirror/proxy/env 不接受客户端输入。
- spawn 固定程序与 argv，Provider upstream 与 revision 编译期固定。build env 从空对象构建，仅固定工具 PATH、私有 HOME/TMPDIR、locale、Provider/cache/build paths、jobs、Git 隔离项、PYTHONNOUSERSITE；不继承 Backend/Task/Config/GitCredential secrets、PYTHONPATH/PYTHONHOME、NODE_OPTIONS。
- 直接 -I -S 运行解释器验证，避免用户 sitecustomize/user-site。不存在全局 task PATH 变化。
- 所有权、symlink、目录前缀、inode 与 checksum 检查；Remove/Repair 引用保护；未知数据不自动清理。
- 操作 HTTP DTO 不含 owner_token/owner_pid、环境或内部日志路径。日志 ID 不接受任意文件路径。JSON/parser errors 返回静态错误码。
- OS 工具/headers 不由 Manager 安装；诊断不是精确跨发行版依赖保证。无任意 Python console。

验证包括注入/恶意版本、父目录与解释器逃逸、未知目录、跨进程锁、PID reuse、SIGKILL 子进程收敛、日志上限/UTF-8/脱敏、模拟 ENOSPC/删除失败与引用保护。静态审计对照 platform-phase5 确认 Task/Hook/Config/Dependency 执行文件无变更。

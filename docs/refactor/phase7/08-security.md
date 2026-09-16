# Security boundaries

- 面板 Runtime 权限；/open 显式 403，沿用登录验证。无新系统白名单。
- 请求 schema 拒绝未知字段、physical path、executable、command、pip_args、URL/VCS/local dependency、凭证和任意 index。
- Runtime/Environment 路径只用 ID，私有目录、逐级拒绝 symlink、ownership sidecar + dev/ino。venv interpreter 仅允许链接到选定 managed Runtime executable。
- stdout/stderr 复用流式 redactor、bounded private log、UTF-8/drain；API 错误静态化。第三方 package name/version 作为文本显示，不拼 shell/path。
- Python/PIP 环境显式构建；不继承 Task/Config/用户 PYTHONPATH/PYTHONHOME、global pip config、Git credentials 或代理 Secret。
- No system-site-packages、shared mutable site-packages、activation、Runtime global package mutation。

安装依赖会以平台进程 OS 权限执行第三方构建/安装代码。此机制隔离正常包安装位置，**不提供恶意包代码沙箱**，也不防御同 UID 的持续恶意文件竞争。没有通用“import 所有 distribution”检查；使用 pip check 与 metadata。

Shared Package Layer **DEFERRED**：ABI/只读层/优先级/独立引用尚无必要契约；不以 PYTHONPATH/sitecustomize 或 system-site-packages 替代。

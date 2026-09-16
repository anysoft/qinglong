# Private pyenv Provider

官方来源 https://github.com/pyenv/pyenv.git；固定 release **v2.8.5**，commit **c293de3650a2d08ea36c5f6f0d55c5a3841b0c72**。证据：diagnostics/phase6/pyenv-source.json。

Provider code 在 runtime/python/pyenv/providers/<revision>，安装目录是同级 versions/。显式 setup/update/repair 经临时目录 fetch 精确 commit、detach checkout、结构/可执行性/HEAD 检查，然后发布。repair 只隔离旧 Provider code，绝不替换 versions。

通过官方 standalone python-build --definitions 和 python-build -v VERSION PREFIX 使用受信任 definitions；不使用 host pyenv、shim、pyenv init/global/local/shell/exec，也不读取用户 .python-version。平台升级更换 pinned revision 后，用户显式 Update 才更新 Provider；安装不会自动更新。

Git 使用 argv、固定 upstream、无交互，隔离 HOME，禁用 system/global Git config、credential helper、hooks。验证检测 HEAD、dirty worktree、Provider 文件与 pyenv --version。Provider 故障不阻止已有解释器独立 Verify/Remove。

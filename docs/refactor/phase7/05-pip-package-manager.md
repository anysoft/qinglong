# pip adapter and cache

PipPackageManager 仅调用绝对 venv Python `-I -B -m pip`，requirement 逐条 argv，使用 `--` 终止 option parsing。开启 require-virtualenv、no-input、disable-version-check、显式 cache 与 index。PIP_CONFIG_FILE=/dev/null 禁用配置文件加载；进程不继承用户 PIP_* 或代理配置。

生产第一版固定公开 `https://pypi.org/simple`，不接受客户端 index_url/extra_index_url、arbitrary pip args、proxy、credentials。认证私有 registry 未实现，不能借 Task ENV 或 Config Secret 绕过。测试仅通过构造器注入受控 loopback index，生产没有环境变量测试开关。

缓存位于 `cache/python/pip`，仅共享下载/构建 artifact；Environment 安装目录独立。删除环境不删除缓存。Cache Clear、自动 GC、共享安装层均 DEFERRED。

默认 pip 的 PEP 517 build isolation 与 wheel/sdist 策略，不自动升级 pip/setuptools/wheel，不自动安装系统编译依赖。记录 pip version、sorted package name/version、direct 标志、index policy、freeze、resolved hash。`source_index` 表示本次解析策略，并非每个 artifact 的独立溯源证明，bundled pip 也会出现在 resolved 列表。

依据：[pip configuration](https://pip.pypa.io/en/stable/topics/configuration/)。

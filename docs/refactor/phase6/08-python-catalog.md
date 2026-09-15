# Python Catalog

来源为已验证私有 pinned Provider 的官方 python-build --definitions。仅匹配 CPython 3.x.y stable exact 标识，去重后按数值降序。PyPy、Anaconda、Stackless、free-threaded variant、dev/rc/a/b 与两段版本均排除。

Catalog 保存为 Provider JSON + revision/last_refresh_at；页面 GET 只读缓存。setup/update/repair 后刷新，独立 POST provider/catalog 显式刷新当前 Provider definitions；要获得上游新增 definition 需平台更新 pin 并显式 Update。

Catalog 表示官方 definition 可用，不保证特定 OS/SDK 能编译所有历史版本。真实验证中 Python 3.13.15 完整通过；3.12.12 在当前 macOS ensurepip 阶段失败；过旧版本不支持 -I 或系统构建失败会进入 ERROR，不冒充 READY。默认没有预发布开关，没有 latest/stable 漂移。

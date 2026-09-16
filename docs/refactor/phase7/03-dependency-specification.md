# Desired specification

API 接受最多 100 条 requirement，每条最多 1000 字符。先拒绝换行、控制字符、option 前缀、URL/VCS/file/local path 与 shell substitution，再通过 managed Runtime bundled pip 的 `packaging.requirements.Requirement` 解析标准 PEP 508。保留原表达式，以 PEP 503 normalized name 拒绝重复，支持 extras、version constraints、markers。

Revision 保存 `{normalized_name, requirement}`，不把传递依赖误写成 Desired。spec_hash 包含 exact Runtime ID、Desired、平台 index policy、隔离/引导策略版本。

UI 支持每行一个表达式的粘贴输入，空行忽略；不接受完整 pip requirements-file 指令（-r/-c/-e/--index-url 等）。不自动读取 Repository requirements.txt/pyproject。没有 Upgrade All 或预解析 dry-run。

标准 parser 来自 Runtime 自带 pip，不安装/升级 Runtime packaging；没有自行实现完整 PEP grammar。未携带可用 bundled pip 的 Runtime 将明确校验失败，不能回退宿主 pip。

依据：[Packaging Requirement](https://packaging.pypa.io/en/stable/requirements.html)。

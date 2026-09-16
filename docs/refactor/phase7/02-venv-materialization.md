# venv materialization

使用已验证 Runtime 的绝对 executable 执行 `-I -B -m venv --symlinks <owned build>/venv`；由 bundled ensurepip 引导 pip。创建后先验证身份/隔离，再安装依赖，完成后再次验证。

每个 generation 在最终独有路径构建，但数据库尚未发布。不能把临时目录中的 venv rename 到另一位置：console script shebang 包含绝对路径。发布是 READY 与 Current pointer 的同一短事务。

验证检查 ownership、sys.executable 的 venv 路径、sys.prefix、sys.base_prefix 的 managed Runtime、精确 CPython version、user-site 禁用、pip/purelib/platlib/site-packages 均在 venv 内，随后 pip check 与结构化 metadata 检查。平台不依赖 activate。

进程从空白平台操作环境出发，私有 HOME/TMP，关闭 Python bytecode 写入；不继承 Task/Config/Backend Python 搜索路径或代理凭证。Runtime 不安装业务包。第三方安装代码以平台 OS 权限执行，不是沙箱。

依据：[Python venv](https://docs.python.org/3/library/venv.html)。

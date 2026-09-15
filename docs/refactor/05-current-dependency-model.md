> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](../architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# Dependency / Runtime 当前模型

## 命令生成与安装位置

`DependenceService.create/update/reInstall` → installDependenceOneByOne → taskLimit.runDependeny（并发 1）→ util.getInstallCommand/getGetCommand/getUninstallCommand → cross-spawn('/bin/bash')。如果 dependence-proxy.sh 存在先 source。stdout/stderr 入 DB log 数组、发送 SockJS；退出码决定 installed/installFailed 等；取消通过命令查 PID + kill。

| Runtime | 文件 / 函数 | 当前 executable / command | 用途与位置 |
|---|---|---|---|
| Python | shell/task.sh:define_program | python3 | .py/.pyc task，用 PATH 查找 |
| Node | shell/task.sh:define_program | node | .js/.mjs task，用 PATH 查找 |
| TypeScript | shell/task.sh:define_program | ts-node-transpile-only | .ts task |
| Shell | shell/task.sh:define_program | `.` | source .sh，同一 Shell（不是总会启动 bash file） |
| Python | back/config/util.ts:getInstallCommand | `pip3 install --disable-pip-version-check --root-user-action=ignore [--prefix=$PYTHON_HOME] NAME` | 有 PYTHON_HOME 装自定义 prefix，否则 pip 默认环境 |
| Python | util.getUninstallCommand | `pip3 uninstall --disable-pip-version-check --root-user-action=ignore -y NAME` | 无显式 --prefix，依赖当前 Python metadata 路径 |
| Python | util.getGetCommand | python3 -c + importlib.metadata.version / find_spec | 检查可见安装 |
| Node | util.getInstallCommand/getUninstallCommand/getGetCommand | pnpm add -g / remove -g / ls -g | 全局安装/移除/查询 |
| Node | otask.append_node_dependency_path / node_path_cache.sh | pnpm root -g | 查并缓存全局 node_modules，加入 NODE_PATH |
| Node | preload/sitecustomize.js:run/preferGlobalNodeModules | node -e / Module._resolveFilename patch | before 环境回传；优先全局依赖；ESM loader 补解析 |
| Python | preload/sitecustomize.py:run | python3 -c | before shell 环境回传 JSON |
| Node | shell/api.sh:create_token / back/loaders/initTask.ts | node static/build/token.js 或 ts-node-transpile-only back/token.ts | 内部 token，不是 Task runtime |
| Node | shell/share.sh:npm_install_2 / reload_pm2；shell/start.sh | pnpm install / node / npm root -g / pnpm root -g | 应用安装/启动/定位 |
| Node/Python | docker/Dockerfile* / shell/start.sh | npm install -g pnpm/pm2/ts-node/typescript；pip3 requests | 镜像/启动依赖引导 |
| Linux | config/const.ts:LINUX_DEPENDENCE_COMMAND | Alpine apk；Debian/Ubuntu apt-get + dpkg-query | 系统级共享安装，yum 未实现 |

完整候选命令生成位置和部署命令见 [12-source-inventory.md](12-source-inventory.md)，含 sample/preload、token、构建、脚本工具，不限 task 分发函数。

## Python 能力

固定命令名 python3；版本由 PATH/宿主/镜像决定。镜像有 Python 3.10 与 3.11 构建变体，但没有 task/repo runtime 版本选择资源。pyenv、virtualenv、per-repo/reusable venv：Not implemented。用户可在原始 command/before 自行调用别的 executable/activate，不构成受管理的功能。

Docker：PYTHON_HOME/PYTHONUSERBASE=`$QL_DIR/data/dep_cache/python3`；PIP_CACHE_DIR=$PYTHON_HOME/pip；PYTHONPATH 包含该 prefix 和 lib/python版本/site-packages，PATH 加 prefix/bin。PYTHONPATH 已支持且 preload 临时加目录再恢复。Native start 也设置这些变量，并存在未遵守 QL_DATA_DIR 的路径，必须迁移审慎。

## Node 能力与隔离

版本由 PATH/镜像基础层确定；没有版本表、runtime selector 或项目安装绑定。全局 pnpm 路径通常 PNPM_HOME/global/5/node_modules（镜像设置 PNPM_HOME=$QL_DIR/data/dep_cache/node）。NODE_PATH 加 data/deps、pnpm global；`sitecustomize.js:preferGlobalNodeModules` 优先全局 resolve，ESM loader 也照顾全局包。项目自己的 package.json 可存在并被脚本自己使用，但 Dependencies 模块不为每个 repository 创建/维护 node_modules。

两个 repo 的 Python 同名冲突包写同一 prefix，可覆盖或因依赖冲突安装失败；Node 同名全局版本互相替换，且 preload 的优先级可能遮盖项目版本。没有 requirements lock/package-lock 解析协调或 per-repo resolver。

## Cache 不等于可随意删除

dep_cache/node、python3 **含安装环境本体**，不是只含下载缓存；清理后现有 DependenceModel.installed 可能失真。DependenceService.refreshInstalledStatuses 会把找不到的安装标记 installFailed；启动还有重装流程。pip 下载 cache、pnpm store、Node 全局路径缓存与已安装包要分别处理。`shell/node_path_cache.sh` 有文件锁和 cache invalidation，不是 Runtime 环境锁。Retention/System 提供 cache 清理，执行中的 task 无 runtime lease 保护。

测试只执行 resolver 命令生成和查询模型，不安装公网包或修改宿主 Python/Node 全局依赖；跨版本 binary/package 冲突运行验证仍需隔离镜像矩阵。

# Workflow security

权限仅contents:read，checkout persist-credentials:false；无自定义repository secrets、无pull_request_target、无write/id-token权限。PR title/body/branch不进入shell命令；GitHub结构化上下文通过env输入summary，文件名仅安全run ID/commit，不按分支删除目录。

保持仓库官方Actions稳定major约定：checkout/setup-node/upload-artifact v6、download-artifact v7；不再使用第三方pnpm action，改为锁文件中的pnpm工具。版本依据[checkout](https://github.com/actions/checkout)、[setup-node发行说明](https://github.com/actions/setup-node/releases)、[upload-artifact发行说明](https://github.com/actions/upload-artifact/releases)。自托管runner需满足所用Actions的运行器版本要求。

CI supervision复用POSIX hook_process helper，stdin EOF/timeout终止自己启动的进程组。监督器按父子关系登记PID/启动时间及独立进程组，Browser backend额外登记PID+启动时间，cleanup匹配身份后才发信号。不使用pkill/killall。关闭后台应用后才删除私有目录。所有正式生产lease/recovery语义保持。

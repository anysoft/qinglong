# Phase 10 — Runner v2

Runner 接受 Context 和本次 Attempt 的 ENV，使用绝对程序路径加 argv 数组执行；Task 参数不拼接成 Shell 命令。仅用户明确配置的 Hook command 写入私有命令文件交给 /bin/sh。

| Source | Program | argv |
|---|---|---|
| Python | pinned venv/bin/python | entrypoint, arguments |
| JavaScript | managed absolute node | entrypoint, arguments |
| TypeScript | managed absolute node | pinned tsx/dist/cli.mjs, entrypoint, arguments |
| Shell | /bin/sh | entrypoint, arguments |

固定 PATH 为解释器目录和系统基础工具目录。MAIN 再次过滤 NODE_PATH、NODE_OPTIONS、PYTHONPATH、PYTHONHOME、BASH_ENV、ENV、LD_*/DYLD_*；Python 设置 VIRTUAL_ENV 与 PYTHONNOUSERSITE。

复用 HookExecutor → hook_process.py → process_group.py。Supervisor 通过独立结果 FD 返回真实 exitCode / signal / timeout / cancellation，真实 exit 124 与监督超时不混淆。stdout/stderr 顺序进入同一 redactor；子进程组退出、排空日志后才完成。

# Managed runtimes

复用Phase12真实provisioners与Phase7/8环境测试、Phase10Runner测试。官方pyenv/CPython3.13.15经固定provider与源码checksum验证；Node官方24.x LTS分发经checksum验证，显式npm与pnpm10.17.1 toolchain。版本、安装/校验/删除日志进入runtime诊断。

先运行环境生命周期测试（避免Task引用污染），再运行真实Python venv import/Build snapshot/retry/timeout/cancel、CJS/ESM/tsx TypeScript、Shell执行。历史测试产生的旧路径报告在finally恢复，证据复制到本job目录。

Task解释器来自managed Runtime，host Node/Python仅用于编译/监督/测试工具。默认每job真实下载安装，不缓存最终安装。浏览器同job复用刚验证的官方binary作为原Phase14provider夹具，不用host解释器或fixture打印脚本假冒执行。

VERIFY/REMOVE由正式RuntimeOperations执行。即使失败，保留日志后仅删除owner证明属于当前job的临时根；未删除任何桥或用户数据。

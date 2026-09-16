# Ubuntu runner

固定ubuntu-24.04，不用ubuntu-latest。preflight记录uname、os-release、architecture、kernel、文件系统/磁盘、内存、Node/npm/Git/Python/Bash/flock/timeout/tar/gzip/sqlite3/ShellCheck与Chrome。缺工具或非Ubuntu24.04明确失败。

系统安装使用Ubuntu官方apt，按dpkg状态只安装缺包：build-essential、ca-certificates、curl、git、openssh-client、openssl、python3、jq、perl、util-linux、coreutils、tar、gzip、xz-utils、sqlite3、shellcheck、libssl-dev、zlib1g-dev、libbz2-dev、libreadline-dev、libsqlite3-dev、libffi-dev、liblzma-dev、libncurses-dev、uuid-dev。用途为Git/SSH/锁/脚本工具及真实CPython编译，不安装system crond。

apt只在缺包时调用，保留系统已有配置；包管理副作用不能承诺事务回滚。非root要求sudo -n。本机Darwin不执行apt，不能据此声称Linux通过。

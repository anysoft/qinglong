# Git Workspace

保留 RepositoryStorageService、WorktreeService、GitCommandService、GitCredentialResolver、RepositoryPathResolver、WorkspaceLocks 与 POSIX supervisor。远端访问只经 argv runner/私有凭据上下文；不在 URL/command/log 传密码。新平台没有 legacy clone/raw 路径。

Repository 的 git/ 存共享对象，worktrees/ 是独立代码工作区，ID生成路径。fetch不移动已检出分支；update只FF；dirty/ignored/ahead/diverged/detached/local commit/缺失注册/lease均按已有安全规则处理。错误恢复和ownership检查不是compatibility。

Workspace 可被用户编辑及多个Subscription引用；purpose只表创建来源。Task未来执行须绑定 lease 生命周期，当前Task脚本仍跑scripts，不可宣称已有运行期Worktree保护。非协作外部Git、网络文件系统、多主机不在现有锁保证内。

4.5B删除旧repo目录的条件包括可选bot clone退场。构建Docker/CI拉平台源码的git clone/fetch是不同供应链，不属于此删除范围。

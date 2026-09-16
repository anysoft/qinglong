# Stage / commit

Stage 仅接收1–200个校验过的相对文件路径，使用 git add -A -- paths，覆盖 tracked deletion。Unstage 使用 git restore --staged；unborn HEAD 使用 git rm --cached，绝不 reset --hard。

Commit 只提交 index，先拒绝未解决冲突和空 staged set。消息非空、最多8192 UTF-8字节、拒绝NUL，允许多行Unicode。作者必须显式配置 name/email；每次命令 -c user.name/user.email，禁用 signing/hooks，不继承宿主身份或伪造邮箱。

返回 commit SHA 与消息首行的有限摘要，不返回完整 Git 输出。Commit 不自动 Push、不触发 Task、不产生 GitUpdate Event。用户可在 diff 中分别查看工作区与 index 差异。

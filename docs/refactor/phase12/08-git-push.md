# Explicit push

Push 为独立明确动作，沿用 Repository 默认 Credential 的 SSH/HTTPS 私有上下文，并要求 WRITE capability。当前分支推送到已配置 upstream；没有 upstream 时，用户明确输入 origin 的目标分支并由 git check-ref-format 验证。仅允许登记 Repository 对应的 origin，核对 push URL 等于正式 remote_url。

固定 `git push --porcelain origin HEAD:refs/heads/<branch>`；首次显式使用 --set-upstream。不接受 URL、force、force-with-lease、任意 refspec，也不提供 rebase/reset/clean/branch switching。

non-fast-forward 映射 GIT_PUSH_NON_FAST_FORWARD；认证/网络错误为静态码。凭据不进入 URL、日志或响应，不返回 raw stderr。同步按钮调用既有 Subscription pipeline，不新造 pull/fetch/update 组合，不跳过 dirty/local commit 保护。

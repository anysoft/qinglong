# Repository-only Subscription

订阅必须引用 Repository；凭据仅来自 Repository，引用失效或禁用时失败，不降级匿名。
Fresh v1 直接创建最终订阅字段，移除 git_mode、URL/type、credential override、pull 参数、proxy、alias、command；历史建表迁移移至 tests/archived/legacy/schema。

分支为 branch-only。创建允许 worktree_id=NULL，Prepare 在锁内建立稳定绑定。发布和日志使用 subscription-ID，展示名称或 URL 拼写不改变身份。保留定时、间隔、手动执行、停止、日志和 Git 安全保护。

验证：step2-domain.log（24 pass）、step2-pipeline-retest.log、step2-regression-retest.log；初次失败来自已替换的旧契约断言，最终订阅全量回归记入 step3-regression.log。后端/前端构建通过，Fresh 实际进程启动、初始化、登录、重启通过。step2-static.txt 为空。

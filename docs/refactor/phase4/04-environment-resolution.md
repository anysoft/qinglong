> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](../../architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# Environment Resolution

入口 `TaskEnvironmentResolver.resolve(taskId | task, baseEnv)`。单次数据库事务批量获取 Task、Subscription、Repository、选中 Profile、Global rows、Profile variables 和 Task variables。`mergeTaskEnvironment` 为纯函数，返回冻结的原始字符串 map；不会 spawn、source、写日志、修改 process.env。

Profile 选择：Task.env_profile_id > Subscription.env_profile_id > Repository.default_env_profile_id > none。选中的引用不存在、禁用或属于其他 Repository，明确失败，不回退到其他账号。

变量覆盖：Inherited Base → Global → Repository Profile → Task Overrides。origins 为 SYSTEM/GLOBAL/REPOSITORY/TASK；输出含 variables、overlay、unsetVariables、secretNames、profile、metadata。UNSET 后 Task SET 可以重新添加；Task UNSET 可以删除 Repository SET。disabled 条目不参与。

Global enabled rows 按原 isPinned DESC、position DESC、createdAt ASC 排序并同名 `&` 合并。Resolver 的 Global 值是原始合并值，不执行旧 JS 模板表达式。实际语言兼容由 Snapshot 中的原 Global 生成文件负责：Shell trim、Node 模板求值等仍由原语言路径保留。因此 Preview 对 Global 展示原始配置值，不是执行任意模板后的值；新 overlay 在三个语言中的原始字符串完全一致。

Preview 只调用 Resolver，返回 origin/operation/is_secret/display；不启动任务、不创建 RunningInstance、不落地 Snapshot。Secret 为 value=null、display=********；宿主环境可能含后端密钥，SYSTEM 的值也全部隐藏。未标记的 Global/Scoped 值仍可展示，管理员应正确标记 Secret。

metadata 只包含 task/repository ID、Profile 选择来源和版本，不含值或裸 Secret hash。自动任务不缓存继承结果；Profile 或变量更新影响下一次运行，已经准备完成的 Snapshot 不变。

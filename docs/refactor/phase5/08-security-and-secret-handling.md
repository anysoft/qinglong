# 安全与 Secret

Secret Asset 的 List、metadata、revisions、usage、preview、错误均不含 content；GET content 返回 403。浏览器从不先取明文再遮罩。面板资源入口拒绝 Open App 路径；异常响应使用固定错误码，body-parser 错误在通用日志处理前拦截。Hook command 属于用户代码，用户把 Secret 直接写进 command 时，平台无法自动识别；UI 明确提示通过 ENV/Assets 传递。

资产存储目录 0700、canonical 内容 0400；每次 ENV/Hook 计划目录 0700、文件 0600；运行配置副本 0400/0600。Secret 静态加密留待未来，不使用伪加密。当前同一平台 OS 用户执行的脚本可主动访问其可读文件；只读副本与脱敏不是恶意脚本沙箱或 DLP。

初始脱敏包含 Secret ENV、Secret TEXT Asset 的完整内容；BEFORE 新标记/轮换 Secret 累积进入本次集合，旧值不丢失。保留账号分割、JSON 转义、URI 与 Base64 常见表示的屏蔽，支持跨 UTF-8 chunk。Config 内单个字段的任意输出、变形或编码组合不保证识别；尽量将真正需要按字段屏蔽的值同时声明为 Secret ENV。

路径防护与跨进程锁约束平台协作写者；不承诺抵御同一 OS 身份的恶意进程任意替换父目录、主动复制 Secret 或脱离进程组。未知恢复状态保留文件并失败，不以 Fresh-only 为由删除既有用户数据。

Script 内容读写/下载 API 通过 `config-access.lock` EX 排除正在注入的配置；配置执行取该锁 SH，因此不同工作区的配置任务仍可并行。API 持锁直到异步动作和响应都结束，下载与客户端中断不会提前放锁。Node 保留 open-file-description，Python 获取 flock 后退出不会使 API 租约丢失。存在遗留 materialization journal 时文件接口返回 CONFIG_RECOVERY_REQUIRED，先运行对应工作区恢复后再访问。此保守机制使任何配置执行期间的 Script 编辑/下载暂时返回 BUSY；后续 Code Editor/ExecutionContext 可缩小到目标工作区。

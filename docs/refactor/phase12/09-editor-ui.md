# Editor UI

复用已安装 Monaco，使用本地已打包 worker/资源；Python/JS/TS/Shell/JSON/YAML/Markdown/纯文本语法、行号、查找替换、多标签、dirty标记、Save/Close。无新增语言 Runtime、终端、LSP或远程IDE依赖。

左侧按目录浏览、分页、文件名/内容搜索、新建/重命名/删除；中央编辑器；右侧 Git Changes/staged count/author/message/Commit/Push，窄屏改为 Drawer。Repository Worktree 列表提供 Open Workspace。

页头展示 Repository/Worktree、HEAD/branch、dirty计数、ahead/behind、Used by N Tasks。绑定 Subscription 时显示正式 Sync/Apply Discovery 操作。user.env 为普通源码，不导入 Scoped ENV；没有 Run buffer、raw command 或自动执行入口。

错误显示静态码；文件冲突只有 Reload/Cancel。持锁运行期间保留内存草稿并提示 BUSY，任务结束后用户可重试保存。草稿不持久化，页面明确说明丢失条件。

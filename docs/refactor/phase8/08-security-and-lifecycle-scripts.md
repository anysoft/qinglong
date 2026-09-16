# Security 与 Lifecycle Scripts

ALLOW 默认允许第三方 lifecycle/native build code；IGNORE 对 npm/pnpm 显式关闭 scripts。pnpm 10.9+ workspace 配置显式设置 dangerouslyAllowAllBuilds，避免默默忽略用户选择。UI 显示风险说明。

**npm/pnpm install may execute third-party code；这不是 OS sandbox。** 子进程具有平台服务用户权限。私有 HOME、TMP、XDG、npm user/global config 和明确 PATH 隔离 ambient configuration；环境变量通过 allowlist 构造，不整体继承 process.env，不读取 Task ENV、Config Assets、Git Credentials 或 Task proxy。

生产 Registry 固定为 npmjs，客户端不能提交 registry/credentials/raw args/paths。测试只允许构造器 loopback registry 注入，产品无 fixture ENV 开关。直接依赖规格仅 registry semver；传递依赖由受信 Registry metadata/lockfile 描述，不能把该规则宣传为第三方代码隔离。

Archive、resource ID、ownership、symlink 边界和 Process Group 清理由安全测试覆盖。安装日志保留原生命令错误，API 不允许任意命令。私有认证 Registry、组织代理配置、Yarn 与高级脚本 allowlist 延后。

参考：[pnpm 10 settings](https://pnpm.io/10.x/settings)、[npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/)、[npm config](https://docs.npmjs.com/using-npm/config/)。

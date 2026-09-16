# Browser acceptance

直接调用diagnostics/phase12/browser-e2e.cjs与diagnostics/phase14/platform-e2e.cjs，没有CI专用简化场景。fresh DB、真正后端/前端、SSH Git fixture、Workspace编辑/commit/push、Task/Trigger/通知、本地备份和不同DATA_DIR恢复均保留。

QL_ACCEPTANCE_DIR可配置输出；QL_MANAGED_DIR指向同jobprovision结果。优先探测google-chrome/chromium，缺失时由锁定Playwright安装对应Chromium及系统库。headless；等待HTTP、DOM、operation state；没有新增固定长sleep。

成功和失败都记录console/network/backend日志及现有截图。每job随机生成测试秘密，API载荷与UI夹具使用相同随机映射；portable口令仅在进程内存/CLI stdin流转。SSH私钥和Webhook动态秘密登记用于artifact扫描。浏览器cookie/token状态和完整trace不上传。

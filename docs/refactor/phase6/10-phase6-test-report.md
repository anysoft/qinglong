# Phase 6 Test Evidence

## Deterministic release gate

Command (Node 22): `node tests/platform/run.cjs`。

331 tests：**328 passed / 0 failed / 3 skipped**。3 skips 是原有 macOS 平台 flock/cache 条件；未归档、删除或新增跳过旧 release tests。新增 17 项覆盖 Schema、Runtime/API、Provider validation、跨进程 crash 与安全/失败路径。日志：diagnostics/phase6/platform-tests.log。

Phase 5 Schema tests 随最新 v3 更新预期版本，保留 valid v1 链、FK、数据、rollback/tamper、Fresh 签名断言；v2 冻结 fixture 独立验证。Task/Hook/Config/B17 全部既有断言继续执行。

## Builds / typecheck

Backend build 与 Frontend build 已通过；Frontend 原有 bundle size/Browserslist 提示不作为功能失败。Typecheck 维持既有 53 项、0 新增，原始 tsc exit 2；regression gate PASS，整体类型债务仍 PARTIAL。最终日志在 diagnostics/phase6。

## Browser and real provider

浏览器全平台脚本扩展自 Phase 5，包含初始化、Git/Worktree/Subscription、ENV/Config/四阶段 Hook、三语言 Task、重启，再增加 Runtime Provider/setup、exact install、日志、verify、metadata/reference、repair、cancel、restart/remove。

浏览器通过显式 Node --require 注入 tests/phase6/browser-provider.cjs；生产没有 fixture 环境变量或任意 provider 路径入口。Fixture 只替代上游下载/编译，实际 API、DB、operation、locks、process supervision、文件路径与 UI 使用生产实现。它不是 real CPython 成功证据。

独立 `diagnostics/phase6/real-runtime-smoke.cjs` 使用生产 PyenvProvider、官方 pinned source、CPython 3.13.15（保留 3.12.12 失败证据），保存完整各操作日志与 result.json，最后 Verify/Remove。其状态以及最终浏览器状态以根目录 PHASE6_REPORT.md 和 JSON 为准。

## Linux

当前宿主 Darwin arm64。GitHub runs 查询返回 total_count=0，无实际 Linux PASS 可引用。Validate workflow 保留平台回归/浏览器，并新增独立 Ubuntu real-python-runtime job；本次未 push/dispatch。Linux gate 为 PARTIAL。

## Static / graph

静态扫描 310 production files、0 forbidden/unclassified、63 explained references。Runtime 边界扫描与 platform-phase5 protected-file diff 通过。完整 GitNexus structured review 见 graph-review-HEAD/develop.json；CRITICAL 已报告。索引自身有 entry-point/callee tracing 上限，不能把 graph zero 当无影响，人工差异与动态测试作为补充。

浏览器最终复验 PASS：671 HTTP responses、22 WebSocket frames，未发现 Secret 泄漏。

真实 3.12.12 在 macOS make install/ensurepip 发生 SIGSEGV；保存全量日志，操作未标为 READY。3.13.15 可选预置官方源码缓存（诊断脚本第二个 argv），必须先匹配 pinned definition SHA256 1e66a7945a48390ee4c2a4268a0e4185884059a13c4aab6d148aa208deea4a76；这不是预编译二进制或 Provider fixture。CI 默认直接从 upstream 下载。

## Final real smoke

**PASS：CPython 3.13.15 / Darwin arm64 / Clang 21.0.0。** Provider Install、Runtime Install、Runtime Verify、Runtime Remove 均 SUCCESS / exit 0；安装后 READY/HEALTHY、249145866 logical bytes，删除后 remaining=0。真实构建与验证执行生产 Provider，源码 cache SHA256 已按官方 pinned definition 校验；没有模拟 interpreter。完整结果见 diagnostics/phase6/real-smoke/result.json。3.12.12 的 ensurepip SIGSEGV 记录保留为宿主兼容性限制，Linux 仍待 CI。

浏览器最后一轮同时等待 API 终态与页面可见终态，再关闭日志弹窗；PASS，671 HTTP responses / 22 WebSocket frames。

## 可选源码缓存复现

常规命令 `node diagnostics/phase6/real-runtime-smoke.cjs` 无需缓存参数。为慢网络预取缓存时，诊断工具先执行固定官方 URL 的单字节 Range 探测，再 8 个有界请求下载并核对完整 SHA256；它不属于生产 Runtime Manager，不传递用户代理配置到 build env：

```sh
mkdir -p /tmp/qinglong-phase6-source-cache
curl -q -sSfL --max-time 25 --range 0-0 -D /tmp/qinglong-phase6-source-cache/range-headers.txt https://www.python.org/ftp/python/3.13.15/Python-3.13.15.tar.xz -o /tmp/qinglong-phase6-source-cache/range-byte
python3 diagnostics/phase6/prepare-source-cache.py
node diagnostics/phase6/real-runtime-smoke.cjs /tmp/qinglong-phase6-source-cache/Python-3.13.15.complete.tar.xz
```

源码复制到 fresh fixture 的平台 cache 时仍持有 Provider lease；python-build 继续执行其定义校验。缓存不是预装 Runtime。

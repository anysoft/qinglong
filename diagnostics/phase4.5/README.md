# Phase 4.5A diagnostics

`inventory.py` 仅扫描 back/src/shell/docker/deploy/sample/test/tests/scripts 的源码文本，生成搜索命中、API声明和测试标题；不执行应用代码，不读取运行数据/Secret。API表与测试表在审计中按真实职责分类，循环路由展开，计数包含重复声明。CI Git clone另核对 `.github/workflows/build-docker-image.yml`，属于平台发行路径。

- production-before.json / verification.json：380个生产与测试文件的前后SHA-256；无变化。Docker/deploy/package等也核对git diff无生产差异。
- starting-status.txt：起始未提交Phase4状态；审计期间用户提交为e3d3f17f，文件内容指纹不变。该提交也纳入前三份早期审计快照，不是本助手执行git commit。
- required-reading.json：审计前必读文档路径和行数；后续历史banner会增加行号。
- *consumers.json / *paths.json / compatibility.json / nullable-fallback.json：原始行级匹配，可能含注释与测试；不是dead-code证明。
- api-inventory.md：全部API声明分类；test-inventory.md：78个测试文件及case标题分类。
- dependency-graph.md / dead-code-candidates.md：人工核对真实调用后的当前图与证据等级。
- GitNexus：CLI绑定qinglong，索引7,320 nodes /18,172 edges /431 flows；setCrontab impact为CRITICAL，7直接/8总影响。没有编辑生产符号，没有执行清理。

本阶段未重跑应用测试/构建/浏览器/容器；Phase4的298/0/3只作为历史证据。新fresh-install release gate写在计划中，未宣称当前产品已通过它。

# Temporary Bridges / 当前与目标之间的约束

权威清单：[TEMPORARY_BRIDGES.md](../../TEMPORARY_BRIDGES.md)。每项包含当前职责、真实consumer、替代组件、退场phase及gate。不要复制第二份相互矛盾的删除时间表。

4.5B 已去除旧 Git/URL/模式/迁移兼容，但不能整删scripts、task.sh、otask.sh、preload、deps/dep_cache、scheduler、status/token内部结果通道。ENV generator 已在 full map transport Gate 通过后删除（B05）；B07 已独立，B03 不再作为 Discovery 输入。

新代码不得对桥内部命名、路径、HTTP路由添加依赖；在service边界注入adapter。后阶段通过gate后删除bridge与纯兼容测试，并更新此登记。无调用图边不证明Shell/DI/动态router没有consumer。

## Phase 5

B06 的 Hook 部分已移除；B11 缩为内部 Settings；新增 B17 source workspace 映射和配置执行租约。完整消费者与退出条件以 [登记表](../../TEMPORARY_BRIDGES.md) 为准。

Phase 6 已复核 B02/B06/B09/B10/B17 并保留。Runtime 自身 lease/supervisor helper 的原因、消费者与退出条件见根目录 [桥登记](../../TEMPORARY_BRIDGES.md#phase-6-复核)。

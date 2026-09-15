# Temporary Bridges / 当前与目标之间的约束

权威清单：[TEMPORARY_BRIDGES.md](../../TEMPORARY_BRIDGES.md)。每项包含当前职责、真实consumer、替代组件、退场phase及gate。不要复制第二份相互矛盾的删除时间表。

4.5B能去旧Git/URL/模式/迁移兼容，但不能整删scripts、task.sh、otask.sh、preload、deps/dep_cache、scheduler、status/token内部结果通道。ENV三文件也需要先完成full map transport。

新代码不得对桥内部命名、路径、HTTP路由添加依赖；在service边界注入adapter。后阶段通过gate后删除bridge与纯兼容测试，并更新此登记。无调用图边不证明Shell/DI/动态router没有consumer。

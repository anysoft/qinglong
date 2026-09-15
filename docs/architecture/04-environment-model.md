# Unified Scoped Environment

Base Runtime ENV → Global → Repository Profile → Task Override → immutable Execution Snapshot → Child Process。

Global/RepoProfile/Task内key唯一；所有值为literal string，空字符串合法；disabled不参与、UNSET删除，删除override恢复低层值。Profile选择 Task > Subscription > Repository default；选中disabled/missing/wrong-repo明确失败。不做按名字猜Secret。

Base只携带运行需要的系统变量，和后端JWT/通知/Git认证环境分离；解析不得mutate backend process.env。Preview与执行使用同一map，Secret和SYSTEM值受控展示。Secret keep/replace/clear、clone内部复制、0600/0700临时上下文及输出脱敏保留。SQLite当前plaintext at rest，不作加密宣称。

Phase4尚未达到全量统一：transport只写overlay，另复制旧global三文件，无scope不创建快照。4.5B必须先替换所有入口（包括global-only和editor无ID）才删除env.py/js/sh生成器。语言preload剩余hooks/SDK/包查找由后阶段替换，详见[ENV计划](../refactor/phase4.5/05-env-cleanup-plan.md)。

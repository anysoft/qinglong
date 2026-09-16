# Restore journal and crash recovery

journal 位于 DATA_DIR 外，private JSON + SHA256，版本/UUID/枚举严格验证；target/candidate/quarantine 必须等于本机 resolver 结果，不能接受 journal 指定任意路径。记录 candidate/old dev+ino、源 manifest hash 和 safety snapshot ID。

状态：PENDING → PREPARING → PREPARED → OLD_ROOT_MOVED → CANDIDATE_PUBLISHED → VALIDATING → COMPLETE；另有 CANCELLED / ROLLED_BACK。每个持久转换原子写 + fsync；rename 后 fsync 父目录。

重复启动根据路径和 inode 识别已完成的 rename，继续或回滚。PREPARING 只能删除 journal 证明归属的 candidate。回滚两次 rename 之间的中断，依据 failed candidate 和 old inode 恢复旧根；终态 journal 可清理匹配的 pending marker。

七个注入点：schema migration、Git repair、candidate validated、old renamed、candidate published、startup validation 前/后。测试进程使用 SIGKILL，重新实例化服务后继续并检查 safety snapshot 与原数据保留。未知候选与 quarantine 替换必须失败关闭。

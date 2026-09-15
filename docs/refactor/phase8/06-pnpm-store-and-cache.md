# Store、Cache 与所有权

Runtime: data/runtime/node/versions/runtime-ID，由 Runtime Provider 所有。
Toolchain: data/runtime/node/package-managers/toolchain-ID，由 Package Manager Service 所有。
Environment: data/runtime/node/environments/env-ID/builds/build-ID，由 Environment Service 所有。
Ownership: data/runtime/node/ownership，sidecar 保存资源 ID、父 ID、device/inode。
Cache: data/cache/node，pnpm store 按 exact Toolchain 分隔，npm 使用共享下载 cache。
Temp: data/tmp/runtime/node，按 Operation ID 分隔私有 HOME/config/staging。

同一 pnpm Toolchain 的多个 Build 共享下载/content store，node_modules 不跨 Build 共享。配置 packageImportMethod=copy、sideEffectsCache=false，避免生命周期脚本通过 hardlink 修改共享内容进而影响旧 Build。pnpm 内部虚拟 store 位于各 Build 下。

Environment 删除不删除共享 cache/store。Cache GC 首版延后，不能在活跃 Build 中清空 Store。备份的唯一资料包括定义、Desired、锁文件/解析快照和 package-manager 选择；node_modules、store、cache 可重建但受 registry 可用性影响。Runtime binary 是否纳入备份由 Phase 14 决定。

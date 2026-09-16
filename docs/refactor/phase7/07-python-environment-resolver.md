# Resolver contract

`PythonEnvironmentResolver.resolve(environment_id)` 返回 `{snapshot, lease}`。snapshot 冻结：

```ts
{
  environment_id, revision_id, build_id,
  runtime_id, runtime_version,
  python_executable, venv_root, resolved_dependency_hash
}
```

解析期间 Provider EX → Environment SH → Build SH，验证 Current 归属、READY/HEALTHY、Runtime READY、ownership、venv config hash 和 interpreter 链接。取得 Build SH 后释放上层锁；调用方必须释放 Build lease，未来跨进程调用需继承其实际 FD。

已解析 snapshot 不随 Current promote 改变。共享 pin 可并存；删除被 pin Build 或整个 Environment 返回 BUSY。运行时删除另由 Environment/Revision/Build FK 和 RuntimeReferenceSource 保护。

当前仅用于诊断 API（序列化后立即释放）、测试和未来契约，没有 Task 消费者。列表仅读取缓存与轻量路径/配置，不运行 pip 或递归扫描；手动 Verify 才执行完整检查。缺失/损坏时 fail closed。缓存验证不能证明同 UID 外部篡改从未发生，未来安全沙箱单独设计。

# M06 — Residual Silent Failure Cleanup

**Purpose:** 在核心业务、legacy cleanup、contract 与测试体系稳定后，完成 M02 延后的剩余空 catch/隐式吞错分类，使生产代码中的静默失败只剩经过明确证明的 best-effort cleanup 或 optional probe。

**Status:** `READY`（`PENDING TO START`）；M05 `COMPLETE` 与实现/文档 clean-HEAD gate 已满足，实时可调度性仍由波次执行计划与 Git 预检决定

**Scheduling gate:** M05 `COMPLETE` 后调度；当前为维护 10.5 最后一项且尚未开始。M06 完成并通过维护 10.5 最终门禁后才允许波次 11 Ticket 25；M06 未完成前 10.5 不得标记 `COMPLETE`。

## Scope

- 全部生产 JS/TS/TSX（排除测试、生成物、vendor）；
- scripts/migration 仅在其会影响正式 operator/release/migration 结果时纳入；纯历史/一次性工具需记录但不为追求零数量机械修改。

## Rules

- **best-effort cleanup**：可吞 cleanup 自身失败，但必须确保不覆盖主错误；必要时用安全 debug diagnostic。
- **optional probe/parse**：显式返回 `null`/result/fallback，并在调用方语义中可见。
- **state/persistence/security/remote/process**：不得空 catch，必须失败关闭或映射为稳定错误/diagnostic。
- 禁止 `catch {}` 变成 `catch (e) { console.log(e) }` 这种泄密/噪声修复。

## Acceptance criteria

- [ ] 生产代码 residual catch inventory 全部有分类；无未解释空 catch。
- [ ] persistence/security/remote/process 路径没有 silent swallow。
- [ ] 保留的 cleanup/probe 都有明确语义，且不会把失败伪装成成功。
- [ ] 敏感错误不写入日志；diagnostic metadata 仍为 allowlisted/sanitized。
- [ ] 完整测试与关键故障注入通过，交接记录保留项及理由。

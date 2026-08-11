# Ticket 25 Goal Mode / combined-audit reconciliation

**记录时间：** 2026-08-12（Asia/Shanghai）
**记录时 integration HEAD：** `aff4903ebededa1c3a70feb80bb314ba722b10d4`
**分支：** `codex/article-lifecycle-submission`

## 冲突

- `EXECUTION-PROTOCOL.md` 1.3 规定 Continuous Goal 下一个工作包对应一个新执行任务；主任务持有唯一 Goal、Wave Plan 和 integration HEAD，必须逐包等待、核验 evidence、集成到新的 clean HEAD 后才创建下一包。
- Ticket 25 原合同固定为 Manual Dispatch package-by-package，并把单次 Ticket 25 / Wave 11 combined audit 延后到 `25-G` 之后；A～F 只收集 evidence，不各自开启 fresh full audit。
- 本次用户明确授权 Goal Mode、范围内 commit/merge，要求严格完成 `25-A → 25-B → 25-C → 25-D → 25-E`，在 25-E closure、集成和状态更新后停止；禁止 push，不进入 25-F/G 或 Wave 11 final closure。

## 收敛规则

1. 本次 Goal 采用 `EXECUTION-PROTOCOL.md` 1.3 的调度与 Git 规则：A～E 各创建一个新的用户可见执行任务，严格串行；主任务不预建、不并行后续任务，逐包核验实现、定向测试、evidence、handoff 和 clean integration HEAD 后才推进。
2. Ticket 25 的 combined-audit 规则保持不变：A～E 只执行各自合同的实现/公开行为验证/证据收集和退出门禁，不对自身 diff 或整体 Ticket 下 audit PASS；独立 Ticket 25 Primary Audit + Wave 11 Integration Audit 仍只能在 25-G 之后执行。
3. 本次目标终点是 `25-E` 的 package closure，而非 Ticket 25 closure：完成 E 的退出门禁、必要 commit/merge 与状态/evidence 更新后停止。不得调度 F/G、独立 combined audit、finding remediation、bounded closure re-audit 或 final clean smoke；不得把 Ticket 25 或 Wave 11 标记 `COMPLETE`。
4. 如 A～E 内产生局部实现 finding 或测试失败，当前执行任务在自身范围内修复并留下 evidence；若需要独立 audit/remediation 执行单元，必须由主任务另行通过 `create_thread` 创建，且仍受严格串行和当前 integration HEAD 约束。

## 结论

`EXECUTION-PROTOCOL.md` 1.3 负责本次 Goal 的逐包调度、任务可见性、HEAD 集成和授权 Git 操作；Ticket 25 合同继续负责包级 evidence 与 combined-audit 时序。两者不存在需要改变产品语义的冲突。当前 Ticket 25 仍为 `READY`，25-A 是下一包；本次 Goal 的明确停止点为 25-E package closure。

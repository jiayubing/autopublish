# F-002 Bounded Remediation Handoff — Paid Batch Start/Pause Controls

## Baseline

```text
finding: F-002
severity: P2 BLOCKING
classification: INTRODUCED_BY_CHANGE
start HEAD: 9ee4e08fd0d165a4a0f8911c07cdc2187473b6dd
start status: dirty Phase 3A–Phase 6 source/tests/handoffs and existing user deletion/plan state; preserved without reset, stash, checkout, rebase, stage, commit, merge, or push
thread/subagents: one thread / none
```

## Owner

```text
primary owner: auto—publish/media-workbench/src/components/content/PaidSubmissionStagingPanel.tsx
bounded collaborators:
- auto—publish/media-workbench/src/components/ContentWorkbench.tsx
- auto—publish/tests/renderer-content-client-switch.test.js
- this handoff
```

## Root cause

旧 UI 删除了 Start/Pause controls；已有 start/pause capability 仍存在；新
`PaidSubmissionStagingPanel` 未重新承接这些 controls；因此 confirmed paused
batch 成为 UI dead end。

## Changed files

```text
file: auto—publish/media-workbench/src/components/content/PaidSubmissionStagingPanel.tsx
reason: 按 authoritative paid batch status/runState 补充 Start/Pause action；复用现有 command busy/error state，失败不做乐观状态变更，并明确屏蔽 needs_attention 与 terminal 状态。

file: auto—publish/media-workbench/src/components/ContentWorkbench.tsx
reason: 将现有 startPaidMediaBatch/pausePaidMediaBatch command snapshot 与 command callback 以最小 props wiring 传给 Panel。

file: auto—publish/tests/renderer-content-client-switch.test.js
reason: 在真实 Renderer public interaction 中覆盖 confirm 保持 paused、Start/Pause exact-once、pending 防重复、attention/terminal 安全边界与 client scope。

file: .scratch/article-lifecycle-and-submission/handoffs/bounded-remediation-f-002-paid-batch-controls.md
reason: 记录 F-002 bounded remediation、验证证据与停止点。
```

未修改 `OperationalStore`、paid-media-preflight-service、typed IPC/preload/bridge、paid order orchestrator、media resource service 或 supplier adapter。

## Behavior

```text
paused queued batch → 显示“开始创建订单” → 用户点击后调用现有 startPaidMediaBatch({ batchId })
running/in_flight queued batch → 显示“暂停后续订单” → 用户点击后调用现有 pausePaidMediaBatch({ batchId })
needs_attention → 显示人工处理提示，不显示 Start/Pause
completed/非 queued terminal batch → 不显示 active execution control
confirm → 仍只确认并创建 paused batch，不自动调用 startPaidMediaBatch
```

## Tests

```text
command: node --test --test-concurrency=1 tests/renderer-content-client-switch.test.js
result: PASS
count: 1/1
evidence: 真实 Renderer render → locate → click；确认后 orderCalls 为 0 且 paused batch 显示 Start；Start/Pause 分别 exact-once 传入 batchId；pending 时按钮 disabled，重复 click 不增加 command；needs_attention/completed 无 active control；客户切换只显示当前客户 batch。

command: node --test --test-concurrency=1 tests/phase-03-paid-media-staging-renderer.test.mjs tests/content-workbench-regression.test.js tests/content-submission-ipc.test.js tests/ticket-25-d-paid-media-acceptance.test.js
result: PASS
count: 21/21
evidence: staging renderer/feature、Content Workbench command owner、paid start/pause IPC boundary 与 Ticket 25-D paid execution direct regression。

command: npm --prefix media-workbench run typecheck:strict
result: PASS
count: strict renderer typecheck passed

command: npm run build:renderer
result: PASS
count: renderer tsc + Vite build passed; existing Vite chunk-size advisory only

command: npx prettier --check --end-of-line auto media-workbench/src/components/content/PaidSubmissionStagingPanel.tsx media-workbench/src/components/ContentWorkbench.tsx tests/renderer-content-client-switch.test.js
result: PASS
count: 3/3 files formatted

command: node --check tests/renderer-content-client-switch.test.js
result: PASS
count: syntax check passed

command: git diff --check
result: PASS
count: no whitespace errors; existing LF→CRLF normalization warnings only
```

## Local self-audit

```text
Did confirm remain separate from Start? yes; confirm path was not changed, the Renderer asserts confirmed paused batch with zero start/order calls before the explicit Start click.
Did this reuse existing commands? yes; Panel receives existing command snapshot/callbacks and calls content.commands.startPaidMediaBatch/pausePaidMediaBatch with only { batchId }.
Did this modify any backend/order owner? no.
Can attention state bypass manual resolution? no; Start/Pause predicates require status === queued, so needs_attention exposes no active execution control.
Is client scope preserved? yes; existing current-client batch projection/filter remains the sole visibility gate and the Renderer regression covers client A/B isolation.
```

## External side effects

```text
supplier writes: none
real order creation: none
real charging: none
credentials collected: none
```

## Worktree and evidence boundary

HEAD remains `9ee4e08fd0d165a4a0f8911c07cdc2187473b6dd`. Existing dirty/untracked
Phase 3A–Phase 6 state and user deletion were preserved. No commit, merge, push,
real login, production workspace, supplier, order, charging, or credential
operation was performed.

This thread does not perform the bounded re-audit. The next independent thread
should check only the F-002 scope: Start/Pause UI, existing command wiring,
confirm remains paused, attention safety, client scope, and direct Renderer
regression.

```text
F002_REMEDIATION_PASS
BOUNDED_REAUDIT_REQUIRED
```

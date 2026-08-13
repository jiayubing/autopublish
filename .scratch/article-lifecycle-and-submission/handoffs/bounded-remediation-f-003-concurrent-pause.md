# F-003 Bounded Remediation Handoff — Concurrent Pause

## Baseline

```text
finding: F-003
severity: P2 BLOCKING
classification: INTRODUCED_BY_CHANGE
base integration HEAD: 6516607f002fd6e780290756feec30bf8f91e7df
start status: dirty; preserved the existing deleted M05-J8 plan and untracked PAID-SUBMISSION-ACCEPTANCE-REMEDIATION-R1-R4.md
thread: 019ff8d3-3af2-7a50-86fe-4d01204bdff9
worktree: C:\Users\violet\.codex\worktrees\4d74\官媒投稿-refactor
branch: detached HEAD
subagents: none
implementation commit: 1ed1836e43d3b529d810cb54dbad65706503e278
```

## Scope and owner

```text
primary owner: auto—publish/media-workbench/src/components/content/PaidSubmissionStagingPanel.tsx
bounded collaborator: auto—publish/tests/renderer-content-client-switch.test.js
```

No `ContentWorkbench` wiring or application/backend owner changed.

## Root cause and implementation

The panel merged `startCommand.busy` and `pauseCommand.busy` into one `commandBusy` value used by both execution controls. A pending Start therefore disabled Pause even after the authoritative batch snapshot refreshed to `running`.

The panel now keeps `nonExecutionBusy` for staging/preflight controls. Start's handler and button are guarded only by `startCommand.busy`; Pause's handler and button are guarded only by `pauseCommand.busy`. Existing authoritative `canStartPaidBatch` and `canPausePaidBatch` predicates remain the visibility/state gate, so `needs_attention` and terminal batches expose neither execution action.

The direct Renderer fixture now holds both commands independently. The regression drives: confirmed paused batch → unresolved Start → exactly-once Start/double-Start guard → authoritative refresh to running → enabled Pause → exactly-once Pause/double-Pause guard → Start resolve, while retaining confirm-no-auto-start and client/attention/terminal coverage.

## Changed files

```text
file: auto—publish/media-workbench/src/components/content/PaidSubmissionStagingPanel.tsx
reason: split non-execution busy from Start/Pause command busy and give each execution action its own guard.

file: auto—publish/tests/renderer-content-client-switch.test.js
reason: add the real Renderer concurrent Start/Pause timing regression and independent Pause pending fixture.

file: .scratch/article-lifecycle-and-submission/handoffs/bounded-remediation-f-003-concurrent-pause.md
reason: record R1 implementation, evidence, bounded self-audit, and stop point.
```

## Tests and evidence

The worktree had no dependencies. Tests reused existing dependencies from
`F:\官媒投稿-refactor\auto—publish\node_modules` via a per-process
`NODE_PATH`. The Renderer harness also needed the existing
`F:\官媒投稿-refactor\auto—publish\media-workbench\node_modules`; a temporary
worktree junction was created only while running Renderer/typecheck/build
commands and removed after each run. No `npm install`, package, or lockfile
change was made.

```text
command: node --test --test-concurrency=1 tests/renderer-content-client-switch.test.js
result: PASS (1/1)
evidence: real Renderer flow covered paused confirmation with zero start calls, unresolved Start and start busy/double-Start, authoritative refresh to running, enabled Pause while Start remained pending, pause busy/double-Pause, Start resolve, client isolation, needs_attention/terminal exclusion, and confirm not auto-starting.

command: node --test --test-concurrency=1 tests/phase-03-paid-media-staging-renderer.test.mjs tests/content-workbench-regression.test.js tests/content-submission-ipc.test.js tests/ticket-25-d-paid-media-acceptance.test.js
result: PASS (21/21)
evidence: direct paid staging feature, Content Workbench, IPC, and Ticket 25-D paid execution/pause regressions.

command: npm --prefix media-workbench run typecheck:strict
result: PASS

command: npm --prefix media-workbench run build
result: PASS; existing Vite chunk-size advisory only

command: node --check tests/renderer-content-client-switch.test.js
result: PASS

command: prettier --check --end-of-line auto media-workbench/src/components/content/PaidSubmissionStagingPanel.tsx tests/renderer-content-client-switch.test.js
result: PASS

command: git diff --check
result: PASS; only existing LF/CRLF normalization warnings
```

Before the implementation change, the new Renderer regression went red at
the target assertion: `Start pending 时 authoritative running snapshot 仍应允许 Pause`,
with `true !== false`. This is the reproduced F-003 symptom, not an unrelated
test failure.

## Bounded local self-audit

```text
scope: F-003 only; component diff, direct props/caller boundary, affected execution invariants, and direct regressions

checked: Start cannot be duplicated while startCommand.busy; Pause remains enabled from an authoritative queued/running snapshot while Start is busy; Pause cannot be duplicated while pauseCommand.busy; needs_attention and terminal batches expose no execution action; client scope remains filtered by the existing snapshot; confirm still only confirms a paused batch; Pause does not cancel or interrupt the in-flight supplier request path.

findings: none
blocking: none
deferred: no in-scope deferred finding
escalation: none; no public contract, schema, state owner, transaction, or remote side-effect boundary changed
```

## Unrun gates and remaining risk

```text
unrun: full npm test, desktop/auth/package/alpha smoke gates, real supplier/order/charging operations
reason: R1 contract requires targeted/direct regression and local self-audit only; real external side effects are prohibited in automated remediation.
remaining risk: final combined R1–R4 bounded re-audit must verify this renderer behavior against the integrated R2–R4 HEAD. The existing build chunk-size advisory is unrelated to F-003.
```

```text
R1_PASS
```

# M04-C — Combined Contract Closure Audit

状态：`COMPLETE`

## Scope / provenance

- Scope：对 M04-A submission contract consolidation 与 M04-B content-core contract consolidation 的最终组合执行一次 combined audit；不新增第三个 contract owner。
- Base integration HEAD：`b864a6617b5faa2a2130d93e3b9cd2c35b8ffe9`。
- Base tree：`7410ba3699e7be48fbe182dd637178dc665f06a3`。
- Worktree：`C:\Users\violet\.codex\worktrees\ac4a\官媒投稿-refactor`，开始时 detached HEAD、clean。
- Runtime：Windows，PowerShell，Node `v24.16.0`；root 与 `media-workbench` 依赖均由 lockfile `npm ci --ignore-scripts` 安装。
- A implementation evidence：`e7db055147034c1edd887328e5a8cfa6bc564430`；A handoff 记录 before/after contract digest `06ec5b952119436c3bdaca2bb772914c5c7906e1ad145514b46c5e09fc986749`、fixture digest `16ff564535e3318c5a2889fb23aa757072541abde2e47d4c7db7b63ed96807b4`，均相等。
- B implementation evidence：`b53cb722d17e286c262498a0d12be321926b9751`；B handoff 记录 before/after public comparison digest `9314491bc3052dbb660317c8067589a513e1e02585e2f16ec6c4b7ca609163bd`、`differenceCount: 0`，以及 17 个 projector 的 `mismatchCount: 0`。
- Current production tree equality：`git diff --name-only b53cb722d17e286c262498a0d12be321926b9751 HEAD -- auto—publish` 输出 `0`；当前 HEAD 相对 B implementation 只包含 handoff 证据修正。
- M04-C closure commit：`5ece9ac83bd1f490e107d17767bc68aa81cfe8db`，commit tree `95fb4f81a4bcca2079c64affef9aa39f4231c418`；最终 clean-HEAD gate 在该 sourceState 上完成，`git status --porcelain=v1 --branch` 仅输出 `## HEAD (no branch)`。

## Checked invariants

1. Submission 与 content-core capability 均由稳定领域 owner 声明；旧 `submission-contracts.js`、`content-core-contracts.js`、`content-core-projections.js` 均不存在，production 无旧路径引用。
2. 当前 content-core 组合为 19 条、submission 组合为 17 条；所有 `schemaVersion` 为 1，capability/channel 各自唯一；production registry 共 129 条且无重复。
3. `production-registry.js` 仅 assembly；submission 顺序为 platform → batch → maintenance → regular → paid-media → Doubao，content-core 顺序与 M04-B before manifest 相同。公开 capability/channel/kind/schemaVersion 顺序未变。
4. preload、bridge、Renderer typed capability mapping 与公开 channel 没有 M04 diff；current production IPC matrix 以 TypeChecker symbol identity 收闭全部 129 capability。
5. DTO/validator 的 recursively closed extra-field、version、null、union 规则、argument mapping、projector output、安全 error code/category/retryability/userMessage 均由唯一 shared/domain owner 继续提供。A/B handoff 的 exact machine comparison、当前 schema/descriptor probe、direct projector/IPC tests 共同核验其相等性。
6. 直接消费者只导入真实 owner：submission IPC 按 platform/batch/maintenance/regular/paid-media 导入 named projector；content IPC/composition/attention/management consumers 按 library/editor/removal/attention/management owner 导入 named projector。没有 compatibility re-export、alias、第二 validator/DTO/error owner 或纯 forwarding contract module。既有 `content-operations-contracts.js` 仅保留 registry assembly 职责，不是兼容路径。
7. 生命周期、持久事实、错误安全和外部副作用边界没有改变；M04 source diff 限于 contract owner、registry assembly、直接 mapping/test 与 module-size baseline。未执行真实登录、发布、付费、取消、远端上传、生产数据库或其他生产外部操作。

## Combined manifest / absence evidence

本次在 C base sourceState 现场 probe（递归 schema、error descriptor 与 argument function 做稳定序列化）得到；最终 clean HEAD 重跑得到相同摘要：

| Surface | Count | Version | Order digest | Current probe manifest digest | Result |
| --- | ---: | --- | --- | --- | --- |
| production registry | 129 | 1 | `8c167825f361673784cb63181ff862c1721dfb65fb6b947df0f98d10cd4dc0a5` | `9cf27c3e9aa3be877d3ab2e54125cddea835a66bf8414acfe3d17efa2c464a2d` | PASS; duplicate channel/capability 0 |
| content-core | 19 | 1 | `67285ec0773472602b627e6610cf52a476b53d6c53ffb28b12829e8c715b2a27` | `63e4f8e2ff5746e1e2e1fa1d89e755fa0e8d3269a20ebdbda598c5a37159c323` | PASS; event 1、invoke error-code list 1 |
| submission | 17 | 1 | `a64c94fcc5992b379af9abb31f7bb12bc073a6fe07602767f2e0c4803769ccb5` | `99f5428ef96ffe01f2f1c46180b15fd5c7287bf92f49c4d05468a9e08dec0260` | PASS; 88 error codes/contract、12 fixtures |

Legacy absence probe：三个旧文件均 `exists=False`、未 tracked；production `rg` old path matches `0`。`npm run test:ticket-24-e` 与 `npm run test:legacy-absence` 也分别 PASS（public source matches 0、forbidden runtime statuses 0；legacy publish-log source/archive matches 0）。

## Findings

| Severity / classification | Finding | Disposition |
| --- | --- | --- |
| None | Combined audit 未确认当前 M04 引入的行为、合同、owner、依赖方向、安全或 evidence blocking finding。 | No remediation required. |
| P3 / `INTRODUCED_BY_CHANGE` | 当前主 integration HEAD 的 targeted Prettier check 报告 M04-A 新增的 `submission-batch-contracts.js`、`submission-maintenance-contracts.js`、`submission-paid-media-contracts.js`；仅为格式提示，不改变行为或合同。 | Deferred nonblocking debt；不在 C 中重开已闭合 A owner 或扩大实现。 |
| P3 / `EXPOSED_PREEXISTING` | 全量 `npm run format:check` 报告 `media-workbench/src/types/generation.ts`；该文件相对 M04 base 未变。 | Deferred nonblocking debt；不属于 M04 owner 范围，未修改。 |

A handoff 中曾记录的 fixture-count wording `PROCESS_EVIDENCE_GAP` 已在 A closure 内更正为 12，并由 exact fixture digest 与当前 fixture probe 重新核验；不属于 C 的 reopened finding。未发现 `EXPOSED_PREEXISTING`、`CROSS_COMPONENT_INTERACTION` 或需要退回 A/B owner 的结构性修改。

## Blocking / deferred

- Blocking findings：0。
- Deferred：上述两个 P3 format-only finding；未运行 unscoped full `npm test` 与 packaging/release build。M04 acceptance 所需的定向合同、registry/absence、Phase 8、lint、typecheck 与 M04 contract evidence 已通过；format-only debt 不阻塞当前 closure。full integration/package gate 留给主任务在最终 clean integration HEAD 的阶段性复验。
- Real external operations：按授权边界不运行；这不是 M04 contract evidence 的缺口。

## Commands / environment / results

- `node --test tests/content-submission-ipc.test.js tests/phase-06-submission-typed-ipc.test.js tests/phase-06-content-operations-typed-ipc.test.js` — PASS, 25/25。
- `node --test tests/phase-06-content-core-typed-ipc.test.js tests/phase-03-six-stage-article-lifecycle.test.js tests/article-mutation-coordinator.test.js tests/article-lifecycle-ticket-22.test.js tests/submission-preparation-lifecycle.test.js tests/ai-content-ipc.test.js tests/article-management-snapshot.test.js` — PASS, 82/82。
- `npm run test:production-ipc-matrix` — PASS, 35/35; all 129 production capabilities closed by TypeChecker symbol identity。
- `npm run test:ticket-24-e` — PASS；`npm run test:legacy-absence` — PASS。
- `npm run test:phase-08:gates` — PASS, 5/5。
- `npm run lint` — PASS。
- `npm run typecheck:main` — PASS；`npm run typecheck:bridge` — PASS；`npm run typecheck:renderer` — PASS。
- M04-scoped targeted formatting reports the three P3 A-module findings listed above；`git diff --check` — PASS。主 integration HEAD 的全量 `npm run format:check` 复验报告基线已有的 `media-workbench/src/types/generation.ts`；该文件相对 M04 base 未变，未在 C 中扩大范围修改。
- Static owner/consumer/absence probes — PASS：无旧 production import、无 forwarding export shape、owner capability/channel 无重复；preload/bridge/Renderer 相对 M04 base diff 为 0。

Final clean-HEAD rerun at `5ece9ac83bd1f490e107d17767bc68aa81cfe8db` repeated the targeted 25/25 and 82/82 suites, `test:ticket-24-e`, `test:legacy-absence`, `test:phase-08:gates` (5/5), `test:production-ipc-matrix` (35/35), lint, all three typechecks and `git diff --check`; all behavior/contract M04 gates passed. The targeted/full format-only findings are recorded above and are nonblocking.

The first parallel invocation hit the orchestrator's 120-second timeout while long-running child tests were still active; those identified test-runner processes were explicitly stopped, then each gate was rerun independently with sufficient timeout. The independent runs above are the evidence; the parallel timeout is not counted as a code failure.

## Bounded re-audit

Bounded re-audit scope：只复核本 combined audit 的 owner/registry/absence/typed mapping invariants、A/B exact manifest evidence、当前 final production source equality、direct contract regressions、required absence and type/lint/format gates；不重新开启全仓 fresh review，也不进入 M05/M06。结果：`PASS`；blocking findings 为 0，未触发 escalation。

## Closure

- M04-A、M04-B、M04-C 均 `COMPLETE`；Wave 10.5 更新为 `PARTIAL`；M05/M06 保持未启动。
- 本线程不 merge、不 push，不创建 Goal/子线程/后续任务。
- Final production sourceState：closure commit `5ece9ac83bd1f490e107d17767bc68aa81cfe8db`、`TREE=95fb4f81a4bcca2079c64affef9aa39f4231c418`；其后仅提交本 handoff 的 evidence-only 修订，`git diff --name-only 5ece9ac83bd1f490e107d17767bc68aa81cfe8db HEAD -- auto—publish` 为 `0`，最终 worktree clean。Final bounded re-audit 已在该 clean production sourceState 上 PASS，所有 blocking finding 已关闭，未触发 escalation。

## Main integration closure record

- Main task verified the C worktree clean at evidence commit `2461f050a428bed53f4be005839bee6316ed1bb2` and merged it into `codex/article-lifecycle-submission` with merge commit `60ca6e535a8ebf120dc43d05582316af82594c78`.
- Main applied only docs/evidence corrections afterward (`09d23c5` and `fd52826`); the production subtree remains exactly `f061993a8d5cceabf948b87ecdcb03018cc31bf3`, equal to the M04-B base production subtree and to the C production sourceState.
- Final main-branch verification: clean worktree, no Node process residue, submission 25/25, content/lifecycle/IPC 82/82, production matrix 35/35, Phase 8 5/5, Ticket 24-E absence, legacy absence, lint and all three typechecks PASS. Full format check retains only the two documented nonblocking P3 format findings; `git diff --check` PASS.

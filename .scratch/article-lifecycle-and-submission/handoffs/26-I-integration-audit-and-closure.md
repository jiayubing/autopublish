# Ticket 26-I — Integration、审计与 closure handoff

## 结论

- 本 handoff 记录的是 Ticket 26-I 的本地组合 closure；所有最终自动化 gate 均绑定到 clean implementation HEAD `510f9130fb0b50baf09f668a0dd4300a380b2947`。随后只回填本 handoff/Wave Plan 的文档状态；最终 closure commit 的权威 hash 以 `git rev-parse HEAD` 为准。
- 当前源树的 26-A～H 组合、26-I blocking remediation、bounded re-audit、迁移/故障/并发/幂等/性能、Renderer、architecture/absence、package/smoke gate 均已完成。
- 真实登录、真实投稿、真实付费、真实取消、真实订单核对、生产迁移/删除没有执行；这些是本次明确禁止/未授权的外部验收，不被标记为失败。
- 按 Wave Plan 的状态规则，Ticket 26 / Wave 11.5 仍为 `PARTIAL`：本地 closure 已闭合，但真实外部验收仍是独立授权项；不进入图片 Wave。

## 1. 真实 Git 基线与 commit chain

26-I worktree 从 integration HEAD `07e4a6f924063da932a6f6f0a8bcc16699facadf` 开始，开始时 detached、clean；没有把旧 handoff 文字当作当前 HEAD 证据。当前组合前的 A～H chain 为：

`fb7c141 → 77a9851 → 436a9a1 → f76bbf1 → e208932 → 53a15ca → 4efadc4 → 40113cb → a7ea09a → 73b66b1 → f4f2541 → 4626b98 → f3ded39 → 7cc5a13 → 10ee5b7 → 07e4a6f`

对应的组合 baseline 为 190 个文件、`+8282/-12993`，baseline `npm test` 为 255 个文件、1864 pass、14 fail、1 skip；失败来自组合后的旧 public surface/fixture/直接回归以及缺少 packaged evidence。26-I 修复后没有使用 reset/checkout 覆盖用户改动。

## 2. Combined Primary Audit scope

按 26-I 合同和 SPEC §11，审计覆盖：

- 15 项生命周期/投稿/删除/Renderer/性能矩阵；
- 生成只产生文章，普通/付费确认的唯一入口，付费 staging production surface/schema writer absence 与 crash-safe migration；
- 普通未开始项移出、付费取消剩余项、文章删除边界；明确失败与 uncertain result 的冻结、人工收口和禁止 retry；首次成功永久只读；订单/发布证据保留；
- Renderer 新信息架构、旧入口 absence、生产 capability reachability、owner/capability/dependency direction、第二 writer、完整 store 泄漏、浅 wrapper；
- 批量 query/scan、migration/restart/fault/concurrency/idempotency、package/smoke 合同。

## 3. SPEC §11 状态矩阵

| # | 验收项 | 状态 | 证据摘要 |
|---:|---|---|---|
| 1 | 生成成功只创建文章，不创建投稿事实 | PASS | Ticket 26-B / 26-C unified intake tests |
| 2 | 批次完成后导航并筛选本批次文章 | PASS | generation batch navigation regression |
| 3 | 普通确认前可编辑，确认后立即冻结 | PASS | Ticket 25-C / 26-D state matrix |
| 4 | 付费预检前后不冻结，费用确认成功才冻结 | PASS | Ticket 25-D / 26-E state matrix |
| 5 | 旧付费暂存不制造可投稿/命令隐藏冲突 | PASS | Ticket 25-E migration + 26-C absence/paid intake |
| 6 | 普通未开始项移出后恢复待投稿，不进回收站 | PASS | 26-D / removal acceptance |
| 7 | 有队列文章删除预检阻止且不改队列 | PASS | 26-G removal transaction tests |
| 8 | 明确失败可编辑，不确定结果继续冻结 | PASS | regular/paid outcome and attention tests |
| 9 | 普通 uncertain 仅两种确认；付费仅补录订单/确认无订单 | PASS | attention policy/query/action tests |
| 10 | 已确认付费批次不可追加/单独移除；取消剩余项不影响订单/在途 | PASS | paid batch execution and cancellation tests |
| 11 | 已发布优先于退稿、售后、退款和迟到 observation | PASS | order observation/publication precedence tests |
| 12 | 回收、恢复、永久删除不删除订单或发布证据 | PASS | archive/deletion/removal transaction tests |
| 13 | admission、删除、取消、保存覆盖反序集合/并发/重复/崩溃/stale | PASS | 112/112 combined lifecycle and fault matrix |
| 14 | Renderer 空态/加载/错误/禁用/确认/窄屏/跨页导航 | PASS | responsive/interaction suites；Electron focus opt-in 1/1 |
| 15 | 批量读取，不按文章逐项查询运行事实 | PASS | capacity/performance 12/12；batch 5000、publication 10000、bounded renderer pages |

## 4. Primary Audit findings 与 remediation

| Finding | 严重度/来源 | 直接 owner | 处理 |
|---|---|---|---|
| F-26I-01：付费订单四个 direct resolver public channels 仍可从 IPC/preload/bridge/feature 进入，和 attention resolution 竞争 | P1 / `CROSS_TICKET_INTERACTION` | attention + paid intake transport | 删除 direct contracts/handlers/preload/bridge/feature route；保留内部 attention port；absence 与 paid state tests 通过 |
| F-26I-02：普通 publication outcome direct public route 仍在，未满足普通确认唯一入口 | P1 / `CROSS_TICKET_INTERACTION` | attention + publication transport | 删除 publication IPC/contracts/registry/bridge/direct commands；通过 attention-owned route 收口 |
| F-26I-03：旧 `content.cancelSubmissionBatch` public route 残留 | P2 / `EXPOSED_PREEXISTING` | submission transport | 删除 public contract/handler/preload/bridge；内部 service API 仅供 owner 测试/编排使用 |
| F-26I-04：generic platform pause/stop/state/event public surface 与新具名 commands 并存 | P1 / `CROSS_TICKET_INTERACTION` | platform transport/feature | 删除旧 public capabilities/event module；保留内部 task worker/queue/profile contracts |
| F-26I-05：production fixture 的 attention action、source owner 和 paid command symbol identity 落后于实际 Renderer wiring，导致 reachability false negative | P2 / `PROCESS_EVIDENCE_GAP` | production IPC fixture inventory | 按实际 `PlatformWorkbench`/`attentionSnapshot.items`/`commands` receiver 修正 inventory；113/113 reachability 通过 |
| F-26I-06：Ticket 14/25/phase fixtures 仍断言已退役 public surface，遮蔽真实组合回归 | P2 / `PROCESS_EVIDENCE_GAP` | affected acceptance fixtures | 只更新公开行为 fixture 与 absence tests；无 compatibility alias |
| F-26I-07：合成 Lieju adapter profile 缺少 `stateFile` 时无法完成受控 evidence | P2 / `EXPOSED_PREEXISTING` | Lieju adapter boundary | 增加显式、受控的 session stateFile fallback；phase-04 synthetic evidence 通过 |
| F-26I-08：运行时 active status/comment 仍含 Ticket 24 退役的 `submitting` 残影 | P2 / `EXPOSED_PREEXISTING` | lifecycle projection/removal coordinator | 删除运行时残影，保留历史 migration/schema allowlist；Ticket 24 absence/boundary tests 通过 |

所有阻塞 finding 均已关闭；没有新增旁路 writer、万能 coordinator、compatibility alias、生产数据操作或远端自动 retry。非阻塞项登记如下：

- 标准 `npm test` runner 默认不启用 Electron focus test；显式 `RUN_ELECTRON_FOCUS_TESTS=1` 后该 test 1/1 通过，属于 runner invocation evidence gap，不是行为失败。
- Vite 仍报告单个 renderer chunk 大于 500 kB；不影响当前合同，后续由 Renderer packaging/performance owner 处理。
- 当前依赖审计仍报告 root 5 个漏洞（1 moderate、4 high）、media-workbench 2 个 high；未在 26-I 扩大依赖升级范围。

## 5. Bounded Closure Re-audit

复审范围严格限于 F-26I-01～08 的修复 diff、直接 callers、受影响状态矩阵和最终 gate：

- Ticket 26/25/attention/removal 定向组合：112/112 PASS；
- production capability/lifecycle/event/registry matrix：33/33 PASS；
- absence、typed IPC、phase-08 cleanup gates：69/69 PASS；
- `verify:phase-08`：dependency direction、OperationalStore boundary、unique owners/writers、113/113 capability reachability、legacy absence、tracked generated output 全部 PASS；
- typecheck、Renderer build、responsive/interaction、migration/restart/fault/concurrency/idempotency、capacity/performance、package/smoke 均按下节记录通过；
- 没有触发 Audit Protocol escalation，因此没有重开 fresh full review。

## 6. 实际命令与结果

以下最终 gate 均在 clean implementation HEAD `510f9130fb0b50baf09f668a0dd4300a380b2947` 执行；文档 hash backfill 不改变 production source、schema、关键测试或安全/build gate：

- `npm ci --ignore-scripts`（root）与 `npm --prefix media-workbench ci --ignore-scripts`：成功。
- `npm run typecheck:main`：PASS。
- `npm run typecheck:renderer`：PASS。
- `npm run typecheck:bridge`：PASS。
- `npm run build:renderer`：PASS，2164 modules；仅有 chunk-size warning。
- `npm run test:migration`：68/68 PASS。
- `npm run test:capacity`：12/12 PASS；5000 batch claimUpdate、10000 publication baseline、1000/10000/13000/20000 renderer bounded page 均有 evidence。
- Ticket 26/25/attention/removal 组合 state/fault/concurrency/idempotency command：112/112 PASS。
- production IPC/capability/lifecycle/event/registry command：33/33 PASS。
- absence/typed IPC/phase-08 targeted command：69/69 PASS。
- `node --test --test-concurrency=1 tests/article-lifecycle-ticket-14.test.js tests/article-lifecycle-ticket-14-renderer.test.mjs tests/renderer-lieju-publication-profile.test.js tests/renderer-history-editor-flow.test.js tests/phase-06-production-bridge-fail-closed.test.js tests/renderer-platform-queue-refresh-lifecycle.test.js tests/renderer-residue-cleanup-flow.test.js`：34/34 PASS。
- `npm run test:desktop-core -- --serial`：1765 PASS、0 fail、1 skip；runner 由于 no-skipped policy exit 1。显式 `RUN_ELECTRON_FOCUS_TESTS=1 node --test --test-concurrency=1 tests/renderer-settings-window-focus.electron.test.js`：1/1 PASS。
- `npm run test:legacy-absence`：PASS，sourceMatches 0、archiveMatches 0。
- `npm run verify:phase-08`：PASS，capabilityCount 113、reachableCount 113。
- `npm run test:packaging`：48/48 PASS。
- `npm run pack:smoke`：真实完成 runtime-tools、renderer/preload build、Electron alpha unpacked package 和 verifier；`Alpha package contents OK`。
- `npm test`（默认 runner，前一轮 evidence）：255 files，1868 PASS、0 fail、1 skip；exit 1 仅因 `noSkippedTodo=false`。最终 clean implementation HEAD 使用 `$env:RUN_ELECTRON_FOCUS_TESTS='1'; npm test`：255 files，1869/1869 PASS、0 fail、0 skip、exit 0、`noSkippedTodo=true`，wall clock 581161 ms。
- clean implementation HEAD 上的 `npm run pack:smoke` provenance：commit `510f9130fb0b50baf09f668a0dd4300a380b2947`、`dirty:false`，最终输出 `Alpha package contents OK`。
- `git diff --check`：PASS（仅 Git 提示工作区 LF/CRLF 转换 warning，无 whitespace error）。

## 7. 未执行的外部验收

以下均为 `NOT RUN / PROCESS_EVIDENCE_GAP`，原因是 26-I 合同和本次用户授权明确禁止真实外部副作用：真实登录、真实平台投稿、真实付费、真实取消、真实订单核对、生产数据库迁移/删除、release/push。所有自动化证据均使用合成数据、内存 store、假 transport 或本地离线 alpha package；没有把这些未执行项伪记为 PASS/FAIL，也没有把生成的 `dist`、alpha package、runtime cache 或 node_modules 纳入提交。

## 8. Final closure 状态

- final clean implementation/evidence HEAD：`510f9130fb0b50baf09f668a0dd4300a380b2947`；最终 closure commit 是本 handoff 所在的唯一 closure commit，最终 Git object id 以 `git rev-parse HEAD` 为权威值。
- final clean status：文档-only hash backfill/amend 后由 `git status --porcelain=v2 -b` 证明无文件 entry；detached HEAD 是本 worktree 的既有集成方式，不代表 dirty。
- 本 Ticket 完成后停止在 26-I；不调度、不修改图片 Wave 18/19/20/21。
- 后续若要把 Wave 11.5/Ticket 26 从 `PARTIAL` 推到 `COMPLETE`，需要另行获得真实外部验收授权并生成对应 provenance；本 closure 不扩大权限。

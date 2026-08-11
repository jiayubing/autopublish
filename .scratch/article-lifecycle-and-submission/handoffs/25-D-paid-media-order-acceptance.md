# Ticket 25-D — Paid Media / Order Acceptance Handoff

**状态：** `PACKAGE_COMPLETE`（仅 25-D package closure；不代表 Ticket 25 / Wave 11 `COMPLETE`）
**记录时间：** 2026-08-12（Asia/Shanghai）

## 调度预检与 provenance

- Base integration commit：`96cd6c8a0633878b546f2de7e7ddb9140ae1d7c8`，基线分支为 `codex/article-lifecycle-submission`，由主任务 worktree `F:\官媒投稿-refactor` 持有。
- 本执行 worktree：`C:\Users\violet\.codex\worktrees\53de\官媒投稿-refactor`；执行期间保持 detached HEAD；source thread reference：`019ff1af-f015-7111-8af5-7fcb7003ad3c`。没有创建新线程、没有使用 spawn/subagent。
- 工具 worktree 初始实际为 clean detached `814ad92d6576ccd8c66208b1b813da438e0cb9d1`，不是合同基线；切换前已确认无 staged/untracked change、nested Git repository 或 submodule。`814ad92..96cd6c8` 的记录差异为 `664 files changed, 93592 insertions(+), 21089 deletions(-)`，随后在本 worktree 安全切换到精确基线，没有夺取主任务分支或丢弃用户改动。
- `25-A`、`25-B`、`25-C` implementation/integration ancestor 与 25-D 基线关系已核验；没有发现重复 25-D task/worktree。未执行真实登录、发布、付费、订单创建/刷新/取消、申诉、生产数据库或平台操作。

## Implementation and docs commits

- Implementation commit：`45244e5d0e967db1e48f2220762d5dc99042a07e` — `test: cover Ticket 25-D paid media acceptance`。
- Matrix/evidence docs commit：`f2a49c9` — `docs: record Ticket 25-D acceptance evidence`。
- Handoff-only docs commit：本文件所在的最终 handoff commit；其 hash 由最终 Git 状态返回并由主任务集成核验。
- 受影响真实 owner：`auto—publish/src/content/article-lifecycle-projection.js`。新增测试只通过 media application、订单服务、OperationalStore transition contract ports、article management snapshot 和假 supplier 观察行为，没有创建 acceptance-owned service/store/state machine、第二 order writer 或第二 state matrix。

## 变更与 finding

新增 `auto—publish/tests/ticket-25-d-paid-media-acceptance.test.js`，使用合成文章、假 supplier/transport 和公开应用 seam 覆盖：

- 费用确认快照的文章数、媒体、备注、最新价格、预计费用、全局系统投稿标识、手机号/网址风险同屏展示且正文不改写；确认后不立即创建订单；新文章建立独立批次，不追加到已确认批次。
- 多个付费批次的全局串行执行、当前请求完成后暂停后续订单、订单成功后离队和文章管理 `paid_processing` 投影。
- 订单列表初始状态、供应商状态刷新和传输失败保留原事实；媒体/资源/价格/金额/标识/标题历史快照保持不变。
- 待安排取消成功后文章恢复可编辑待投稿且订单历史保留；发布成功后售后 observation 不撤销全局 published 或冻结；文本路径不引入图片事实。

该回归暴露一个 `EXPOSED_PREEXISTING`、当前 package 阻塞级的生命周期 projection 缺陷：取消成功后的真实事实组合是 `publication=failed + submission=cancelled + order=cancelled`，projection 把本地 `cancelled` 当成未知供应商状态并继续投影为“需处理”。最小修复在唯一 projection owner 中识别本地取消终态、允许取消订单状态，并忽略同一已取消目标上的陈旧失败事实；未知订单、活动订单、uncertain 和 published 优先级仍保持 fail-closed/immutable。修复由 D regression 与直接生命周期/订单/取消回归验证。

## Matrix / evidence / sourceState

- 沿用唯一 `.scratch/article-lifecycle-and-submission/acceptance/25-a-story-matrix.json`：95 rows、85 stories、10 image rows 仍为 `DEFERRED_IMAGE_EXTENSION`。本包只更新 D workPackage 的 37 rows（stories 40–63、65–75、79 text-only、85 text-only）的 evidence refs、`observedResult` 和 `observedSourceState=45244e5d0e967db1e48f2220762d5dc99042a07e`；story 64 仍为 `USER_CONTROLLED_REQUIRED`，A/B/C、E、所有 user-control 和 image rows 的真实状态未改。
- 沿用唯一 `.scratch/article-lifecycle-and-submission/acceptance/25-a-state-matrix.json`：21 cases 未拆分；只为 8 个 paid/order/cancel cases 写入 `25-D` package evidence，sourceState 均为 implementation commit。其余 A/B/C cases 保留原 evidence。
- 沿用 `.scratch/article-lifecycle-and-submission/acceptance/25-a-query-scan-budget.json`，没有改预算、fixture、计数边界或 wall-clock 规则；25-F benchmark 不属于本包。
- `.scratch/article-lifecycle-and-submission/acceptance/25-a-evidence-manifest.json` 只新增 `ticket-25-d-paid-media-acceptance` tracked test artifact，tracked artifact count 为 14。没有创建第二 evidence manifest。

## Actual verification

环境：Windows `win32/x64`，Node `v24.16.0`，npm `11.13.0`；依赖安装使用 `npm ci --ignore-scripts --no-audit --no-fund`；未启动外部服务。

| 命令 | 实际结果 |
| --- | --- |
| `node --test --test-concurrency=1 tests/ticket-25-d-paid-media-acceptance.test.js` | `6/6 PASS` |
| D 相关候选 preflight/order/cancellation/refresh/uncertain/history/immutable tests | `81/81 PASS` |
| Ticket 13/14 paid execution/order-resolution/typed IPC tests | `37/37 PASS` |
| Ticket 15 observation/history tests与 Phase 06 media feature tests | `26/26 PASS` |
| 最终 D 组合命令（D、12、media workflow/evidence/projection、observation/list、supplier canonical、13/14/15/16、six-stage、25-B、media typed IPC/feature） | `143/143 PASS` |
| `npm run lint` | `PASS` |
| `npm run format:check` | `PASS` |
| `npm run test:discover` | `PASS`；253 个 `.test.js/.test.mjs` 文件 |
| `git diff --check` | `PASS` |
| `npm run test:ticket-25-a -- --output build/evidence/ticket-25-a-contract.json` | `PASS`；85 stories、95 rows、21 cases、10 deferred image rows、14 tracked artifacts；报告绑定 implementation commit，运行时因 3 个 tracked docs 尚未提交而为 docs-only `DIRTY` sourceState；generated 文件 ignored 且未提交 |

最终 D 组合命令的实际文件集合为：

```text
tests/ticket-25-d-paid-media-acceptance.test.js
tests/phase-12-paid-media-preflight.test.js
tests/phase-03-media-publication-workflow.test.js
tests/phase-03-media-order-evidence.test.js
tests/phase-03-media-order-projection.test.js
tests/order-observation-contract.test.js
tests/order-list-projection.test.mjs
tests/phase-03-supplier-canonical-behavior.test.js
tests/article-lifecycle-ticket-13.test.js
tests/article-lifecycle-ticket-14.test.js
tests/article-lifecycle-ticket-15.test.js
tests/article-lifecycle-ticket-16.test.js
tests/phase-03-six-stage-article-lifecycle.test.js
tests/ticket-25-b-lifecycle-acceptance.test.js
tests/phase-06-media-typed-ipc.test.js
tests/phase-06-media-feature.test.mjs
```

未运行：完整 `npm test`、25-F benchmark/performance gate、25-G full gate、Renderer/Preload build、production smoke、独立 combined audit、bounded closure re-audit、真实外部验收。以上不是本包失败；其中真实 supplier order status refresh 仍固定为 `USER_EXTERNAL_ACCEPTANCE_REQUIRED`。

## Residual risk and next package

- 自动化 evidence 全部为合成/假 transport；没有真实订单号、真实媒体资源、真实余额、真实账号或真实发布链接，因此不能替代用户控制的真实网站媒体订单状态刷新。
- image extension rows 继续为 `DEFERRED_IMAGE_EXTENSION`；没有实现或验收网站媒体/普通平台图片传输，也没有把空图片清单伪称图片通过。
- 25-A query/scan budget 保持冻结但未在 D 执行 benchmark；wall-clock 没有批准 baseline，不作耗时 PASS/FAIL 结论。
- 下一包入口是 `25-E — Migration / Recovery Acceptance`，必须由主任务在核验本包 implementation/docs/handoff commits、clean HEAD 和 package gate 后另行调度；本任务不分析、实现或预建 25-E/F/G，不执行 Ticket 25/Wave 11 COMPLETE、combined audit、final clean smoke 或 push。

## USER_EXTERNAL_ACCEPTANCE_REQUIRED / forbidden external operations

`USER_EXTERNAL_ACCEPTANCE_REQUIRED`：`user-control:website-media-order-status-refresh` 仍未执行；真实服务商订单刷新需要用户另行明确授权，并记录安全账号/资源身份、订单号、状态、金额/链接、结果和停止条件。

禁止并未执行：真实登录、真实平台发布、真实付费或订单创建、真实订单刷新/取消/申诉、真实余额/账号操作、生产数据库修改、公开页面轮询、图片上传、外部供应商写操作以及 `git push`。

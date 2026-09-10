# 普通平台批量入队与逐篇投稿资源检查

## 修复进展（2026-09-10）

### Finding 1：队列标题不再读取文章文件

本轮按用户要求修复 Finding 1：队列标题现在从 `submission_items.payload_json.publicationSnapshot.title` 的已有冻结快照读取。SQLite 只投影标题到队列运行快照，应用服务继续产出原有 `articleSummary`。移除了队列查询对 ContentStore 的依赖和全客户文章读取路径，不新增 schema、缓存或 writer。

以下为最终源码的同一测量脚本复测（ms）：

| 新文章 / 客户 / 每客户历史文章 | 修复前队列查询 | 修复后队列查询 | 修复后文章文件读写 |
| --- | --- | --- | --- |
| 50 / 1 / 0 | 186.67 | 10.18 | 0 |
| 100 / 1 / 0 | 347.97 | 32.88 | 0 |
| 50 / 50 / 0 | 207.23 | 8.60 | 0 |
| 100 / 100 / 0 | 461.21 | 33.80 | 0 |
| 50 / 1 / 450 | 1651.88 | 8.15 | 0 |
| 50 / 50 / 20 | 3414.72 | 8.08 | 0 |

所有组均为 2 次 SQLite `all` 查询；第一篇、中途、全部完成后的队列刷新均断言文章文件读取和写入为 0。上述耗时是本机合成数据，不含真实浏览器、网络、图片或真实客户资料 resolver 的读取成本。

验证与范围复审：

- `node --test tests/phase-07-regular-queue.test.js tests/regular-platform-outcomes.test.js tests/regular-publication-evidence-contract.test.js tests/submission-center-snapshot.test.js tests/regular-queue-submission-interval.test.js`：73/73 通过。
- `node --test tests/regular-submission-stage1-regression.test.js tests/regular-platform-acceptance.test.js tests/cross-client-regular-queue-application.test.js tests/phase-08-platform-media-settings-workspace-renderer-slice.test.mjs`：通过。
- `npm run typecheck:main`、`npm run typecheck:bridge`、`git diff --check`：通过。
- `node --test scripts/benchmarks/submission-queue-resource-cost.test.js`：2/2 通过，约 36.8 秒；[最终本机 evidence](../auto—publish/build/evidence/submission-queue-resource-cost-fixed-2026-09-10.txt)。
- 新增行为回归证明：文章读取不可用时仍显示待处理/已 claim 文章的冻结标题；客户过滤正确；重启后标题仍可读取；对外不包含正文。
- Primary Review / bounded closure：已检查标题真源、运行与待处理分支、直接队列消费者、客户隔离、持久恢复和正文安全边界；Finding 1 关闭，无本轮新增 blocking finding。没有改变 admission/claim/remote outcome writer 和事务合同。

### Finding 2：同一 scope 的重叠刷新合并

接管时刷新合并代码已经基本写入工作树，本轮按当前源码和测试完成范围复审。`workspace-coordinator` 现在为每个 workspace scope 只保留一个在途刷新；同一 runtime 的后续 invalidation/revision-gap 不再并发启动相同 scope 的读取，而是只保留最新 revision 的一次待补刷。当前刷新结束后再执行该补刷；补刷执行期间如果继续收到通知，仍只保留最新一次。

为让协调器准确知道读取何时结束，当前高频队列相关消费者把实际 Promise 返回给协调器：`platformQueue` 等待平台队列、账号档案和普通队列分组三项读取完成，`submissionCenter`、`articleManagement`、无共享 snapshot 时的 `articleAttention` 返回各自读取 Promise。原有 query identity 的 stale response 防护继续保留。

边界语义保持不变：workspace runtime 切换立即建立新 runtime 的刷新，旧 runtime 的完成回调不能回放其 pending；页面注销、stop、dispose 会丢弃对应 pending；读取失败本身不会自动重试，但失败期间如果确实发生了新的 revision，仍会执行那一次最新补刷。不同 reasonCode 在同一 pending 窗口内合并时使用保守的 `WORKSPACE_DATA_CHANGED`，避免 reason-specific skip 吞掉另一类变更。

合成测量对 50 个连续、重叠的 `platformQueue + submissionCenter` invalidation：修复前平台目录、账号、普通队列分组、投稿中心各触发 50 次；当前实现各触发 2 次（首个在途读取 + 最新 revision 的一次补刷），且投稿中心最终 revision 为 50。该测量只验证 renderer 本地刷新调度，不代表 IPC/磁盘/真实网络耗时。

新增 `phase-06-workspace-coordinator.test.mjs` 回归覆盖：50 次连续通知保留最新 revision、补刷期间继续到来的 revision、刷新失败时不自重试但不丢 pending、runtime switch 使旧完成失效、stop/unregister/dispose 不回放 pending。手动 benchmark 中还直接组合了 platform/submission-center feature 验证请求数从 50 轮收敛到 2 轮。

本项只处理“同一 scope 的在途刷新合并 + 一次最新补刷”，没有新增缓存、revision writer 或跨 scope 共享状态，也没有改变入队、claim、投稿结果写入和不确定结果语义。报告原建议中“两个不同队列消费者复用同 revision 的同一只读结果”不属于这次最小收口，若后续实测仍有必要再单独评估；不把它与本轮同-scope 合并混为一项。

当前 WIP 已通过代码范围复审并进入 PR CI；CI 最终结果以 PR #50 的最新 head 为准。Finding 3（候选权限轻量读取）仍留待独立任务，不在本轮扩大实施范围。

## 范围与证据

- 日期：2026-09-10；Windows；Node v24.16.0。
- Git base：`a90b4cc6322fce9e7aa4367fa6bcc18214570cae`，加当前未提交的批次完成修复、候选文章过滤改动。本次检查未修改 production source。
- 真实 ArticleStore、ContentStore、SQLite OperationalStore、跨客户入队应用服务、文章管理 snapshot、队列分组查询和投稿结果服务。
- 合成文章每篇正文 4096 bytes；一个普通平台账号；图片数为 0。临时目录在测试结束后清理。
- 不触发真实账号检查、浏览器投稿、图片上传、付费或远端请求。因此下方不是用户正在运行的 Electron 进程的完整性能采样。
- 最终命令：`node --test scripts/benchmarks/submission-queue-resource-cost.test.js`，从 `auto—publish/` 执行。2/2 通过，约 53 秒（含 fixture 建立）。
- 可重跑脚本：[submission-queue-resource-cost.test.js](../auto—publish/scripts/benchmarks/submission-queue-resource-cost.test.js)。本机原始输出：[测量结果](../auto—publish/build/evidence/submission-queue-resource-cost-2026-09-10.txt)，属于 ignored build evidence，不提交。
- 计数为逻辑文件调用、SQLite statement 调用，不是物理磁盘读写；计时含观测开销。heap delta 受 GC 影响，不作为峰值内存或泄漏证据。

## 实测

单位为毫秒。入队列仅含后台正式入队调用（包括它自己的再次预检），不含前端刷新；单篇本地完成含 claim、remote-start 记录及 accepted 结果事务，远端步骤以合成事实替代。

| 新文章数 | 客户数 | 每客户额外历史文章 | 打开候选所需 snapshot | 预检 | 正式入队 | 一次完整队列查询 | 单篇本地完成中位数 / P95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 50 | 1 | 0 | 189 | 346 | 685 | 187 | 2.90 / 5.42 |
| 100 | 1 | 0 | 336 | 668 | 1345 | 348 | 2.98 / 3.72 |
| 50 | 50 | 0 | 241 | 348 | 746 | 207 | 2.71 / 3.83 |
| 100 | 100 | 0 | 482 | 699 | 1453 | 461 | 2.89 / 4.97 |
| 50 | 1 | 450 | 1704 | 327 | 673 | 1652 | 2.72 / 4.64 |
| 50 | 50 | 20 | 3478 | 356 | 745 | 3415 | 2.72 / 4.51 |

重要计数：

- 50 篇入队调用读取 400 次文件，写 100 次文件；这些文件写入包含文章读取锁的 owner bookkeeping，不代表改写了 100 篇正文。预检另有 200 次读、50 次锁文件写。保真复核与文章锁有必要，不能直接删掉。
- 50 篇/单客户/无历史：一次队列查询读取 100 次文件、约 420 KB；两份文章文件分别参与读取。查询只输出约 19 KB 队列摘要。
- 50 篇/单客户/450 篇历史：一次队列查询读取 1000 次文件、约 4.21 MB；投完第 26 篇后仍读取相同数量，因为客户文章库没有缩小。
- 50 客户各入队 1 篇、各有 20 篇历史：一次队列查询读取 2100 次文件、约 8.85 MB，只输出约 19.5 KB；第一篇完成后仍读 2058 次文件。
- 逐篇完成的本地事务约 16 次观测到的 SQLite `run`/篇，未发现必须重写全部文章的路径。50 篇本地完成总计约 0.14–0.16 秒，远端和 UI 刷新另计。
- 50 客户入队产生 50 次 `SUBMISSION_BATCH_CREATED`；同一客户 50 篇只产生 1 次。
- 50 个重叠刷新周期的前端 feature 测量：平台目录 50 次、账号列表 50 次、队列分组 50 次、投稿中心 50 次。查询 identity 仅丢弃过期响应，没有合并正在执行的请求。此测量不等同于实际 IPC 排队下 200 次请求全都发生磁盘 miss。

## Findings 与 owner

### 1. P2 / EXPOSED_PREEXISTING：队列标题查询扩大到客户全部文章

Owner：`desktop/services/regular-queue-group-query.js:41`，`articleFor` 调用 `contentStore.listArticles(clientId)`。单次请求对同客户有 Map 去重，但每次刷新都重建；`article-store.js:125` 会读取所有稳定文章的 JSON/Markdown 配对并校验文件状态。

因此开销随相关客户的全部文章数增长，而不是只随本批次剩余文章数增长。这是当前测量中最主要的 CPU、文件调用及临时对象分配来源。同步文件读取发生在主进程调用链上，有造成响应停顿的风险。

状态：**已修复**。队列摘要现在直接使用入队冻结快照中的标题，队列读取不再访问文章文件；修复后测量见本文开头。

### 2. P2 / CROSS_COMPONENT_INTERACTION：跨客户通知与多个全量消费者叠加

Owner：`cross-client-regular-queue-application.js:102`、`regular-queue-application.js:369`、workspace invalidation consumers。

按客户调用正式入队是现有 partial/uncertain 语义的一部分，但每组都广播；`platform-feature-context.tsx:59` 每次启动三类读取，投稿中心再发一次 snapshot，而 snapshot 又调用相同队列分组查询。`App.tsx:86`、`:87` 在顶层持有文章管理和投稿中心 feature，不是仅可见页面才订阅。

每篇远端结果确认后，`regular-queue-group-orchestrator.js:195` 广播 `PUBLICATION_RECONCILED`，同样触发这些消费者。普通平台目录查询当前仅为目录且无实体队列，成本较小，不应把它与实际队列分组全量读取混淆。

状态：**本轮目标已修复**。同一 scope 的在途刷新现在合并为“当前一次 + 最新 revision 的一次补刷”，50 个重叠周期的合成测量从每个消费者 50 次降到 2 次，并保留最终 revision。跨不同 scope/消费者复用同一 revision 只读结果未在本轮实现，保持为有实测需要时再评估的独立优化，避免为了理论去重引入新的缓存/失效合同。

### 3. P2 / CROSS_COMPONENT_INTERACTION：候选过滤借用了完整文章管理 snapshot

Owner：`BatchRegularSubmissionDialog.tsx:205`、`article-management-snapshot.js`。

上一轮为隐藏已入队文章，复用唯一文章权限投影是正确的；但当前按客户获取完整 snapshot，并行等待会将历史文章正文一并传输和短时保留。50 客户各 21 篇的组合约返回 7.05 MB（合成数据），打开弹窗耗时约 3.48 秒。

建议补充按 articleRefs 批量查询可投稿权限的轻量只读入口，仍由现有生命周期 projection owner 判断，不由 renderer 根据队列猜测状态。

## 结论与边界

50–100 篇的正式入队本身可控，后台实测约 0.7–1.5 秒；每篇本地结果事务很轻。队列标题全量文章读取已经消除；高频同-scope 失效刷新也已经合并为单个在途读取加最新一次补刷。当前仍明确保留的性能项是候选弹窗借用完整文章管理 snapshot，以及未来只有在实测仍有价值时才考虑的跨消费者同 revision 只读结果复用。

不能据此声称没有内存泄漏，或给出真实浏览器峰值 RAM；这些需要在获授权的目标平台运行中采样。现有 preparation port 按队列运行缓存初次账号检查，实际提交前仍做身份复核；图片选择有独立扫描缓存。它们未计入本次数值，不能以本地 3ms 代表真实投稿耗时。

本轮没有改变入队事务、权限复核、投稿间隔、结果不确定处理或通知协议，也没有执行真实账号登录、真实发布、付费或远端验收。性能修复使用现有冻结快照和 workspace invalidation owner 收敛，不新增业务事实 writer、缓存 schema 或第二状态机。

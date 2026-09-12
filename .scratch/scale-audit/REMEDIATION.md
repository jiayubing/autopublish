# 规模审计修复

状态：BATCH_3_COMPLETE / OVERALL_PENDING。SA-01 / SA-02 / SA-04 已修复。本批关闭 SA-03 的付费页面截断与 SA-05 的投稿中心读取放大；普通队列、全局执行/启动读取和其余 SA-06/07 仍待后续批次，不宣称整个规模目标通过。

保持唯一 OperationalStore owner、FIFO、暂停/在途/不确定结果及发布证据校验；不修改真实数据库，不执行外部投稿。

验证：迁移成功/重开/故障回滚、最新 attempt、队列在途与阻塞原因行为；复用合成 1千/1万/5万压测并对已知 finding 有界复核。

## 进展

- 已读取审计及直接 owner；原组查询会为每条队列记录执行组级 blocked 子查询，然后在 JS 去重。
- SA-03、SA-05～07：待实施，owner 与验收继续按 AUDIT.md。

## 第一批实现与有界复核

- SA-01 已关闭：schema v10 正式增加 `publication_attempts(publication_id)` 与 `submission_items(article_id)` 索引。最新 attempt 继续按 rowid 顺序选取，不改成功证据解析。同步 open、dry-run、verify、backup/restore 的结构与版本验证，保留旧迁移历史。
- SA-02 已关闭：组查询直接返回每组一行，按组定位最早在途条目和首个阻塞原因，删除 join 全队列后 JS 去重。原每条记录反复扫描本组改为每组扫描一次；当前任务即使前面保留终态记录也不会被去重隐藏。未改变 claim/FIFO 执行 writer。
- `CROSS_COMPONENT_INTERACTION`：旧库留下失效 owner 时，原恢复校验要求当前最新版，阻断升级。仅运行时接管允许支持的旧 schema，通过完整性、外键及现有 dry-run 结构验证后才进入正常迁移；默认备份/恢复校验仍要求最新版。新回归覆盖 v9 失效 owner、迁移三处中断回滚、重试/重开和索引缺失拒绝。
- v10 只执行索引 DDL 与迁移记录的同一事务，不为创建索引遍历/序列化全部业务行；旧版本 fixture 同步去掉新增索引后才模拟旧库，未放宽既有正确性断言。

## 合成复测

同原探针，Windows / Node v24.16.0；仅临时合成库。旧超时 fixture 留下 owner 的样本首次被旧版校验拒绝，已由上述接管回归闭合；长队列与 5万复测重新生成同分布 fixture。

| 场景 | 原测量 | 本批复测 |
| --- | --- | --- |
| 1000任务/10组 | 无插桩中位474ms | 插桩15.6ms，2 SQL / 1010行 |
| 10000任务/100组 | 无插桩中位8926ms | 插桩207ms，2 SQL / 10100行 |
| 单组10000任务 | >45秒 | 136ms，完整返回10000任务 |
| 50000任务/500组 | >55秒 | 1040ms，**仍只返回20000任务，SA-03未修** |
| 50000库查询5000篇 lifecycle | 约14061ms | 189ms；其中 publication SQL 42ms |

原始记录：`r1-queue-*.jsonl`、`r1-article-50000.jsonl`；5万样本与单长队列种子记录 `r1-seed-*.jsonl`。耗时是本机单次诊断，插桩/并行测试/缓存均可能影响结果，不作为 SLA。文章样本不含真实 ArticleStore 文件 IO；未重新测完整 Electron 启动。5万队列总数仍错误，不以此宣称整体容量通过。

## 最终验证与证据

- `npm run test:desktop-core`：1773 项，1772通过、1失败、0跳过；失败是 `phase-04-operational-store-lifecycle` 的 dry-run 当前版本旧断言9，已修正10。此运行覆盖较早源状态，不宣称最终源码全量绿灯。见 `r1-desktop-tests.log`。
- 最终有界回归：`node --test` 运行 phase-02-operational-store、phase-03-operational-store-v3、phase-04-operational-store-lifecycle、regular-queue-submission-interval、ticket-18-a-queue-image-count-persistence、article-lifecycle-ticket-23-c、ticket-26-c-unified-submission-intake、phase-07-regular-queue、article-management-snapshot、submission-center-snapshot：97/97，0跳过。见 `r1-final-targeted.log`。
- `node --test tests/phase-02-migration.test.js tests/phase-02-runtime-capacity.test.js`：18/18，含500/5000批次和10000发布事实容量、恢复guard与故障场景。见 `r1-maintenance-tests.log`。
- `npm run typecheck:main`、`npm run lint`、`npm run format:check`、`git diff --check` 通过。未改 renderer / IPC，不重复 Electron 打包与外部发布验收。
- 最终修改文件 SHA256：`r1-source-state.json`。基线HEAD `1e74583cf0ee2be02125c65298bf3b5579a8bca5`；修改尚未提交/推送，用户 `pelican-bicycle.html` 未触碰。不是 clean HEAD 发布验收。
- 复核限定本批 SQL、schema迁移及直接恢复/队列调用，不开启新一轮全仓审计。本批阻塞 finding 已关闭；整体 SA-03 容量正确性仍阻塞，后续顺序为 SA-03/04 → SA-05 → SA-06/07。

## 第二批：SA-04 文章身份分批读取

本批先闭合可独立实施的 SA-04。调查确认 SA-03 必须连同队列/付费分页合同处理：直接取消上限会把更多完整付费正文搬入内存；普通队列单组 remaining 的 typed IPC 仍限制20000项。因此没有通过删除 LIMIT 或提高常量宣称修好了截断，SA-03仍为下一批阻塞项。

- 实现：`desktop/services/article-management-snapshot.js` 将活动/回收文章身份合并去重，按每批最多5000个身份读取发布档案及生命周期事实。保留底层查询输入上限，不改 schema / writer / 发布证据校验。
- 多批之间让出事件循环；沿用既有 snapshot generation / read revision 校验。任一批失败不写缓存；读取期间版本变化时丢弃整次构建，并沿用最多两次重试的边界。只合并文章库实际消费的 publications / submissionItems / orders。
- `tests/article-management-capacity.test.js` 使用真实临时 OperationalStore 验证10000篇、查询边界两侧及最后一篇的生命周期事实，并通过真实 typed IPC 校验；另测第三批身份、后批失败不缓存、版本变化重建和缓存命中。
- 文章库 typed IPC 的现有10000条上限保留；本批关闭“超过5000导致现有万篇合同失效”，不承诺单客户无限容量或5万篇传输。服务分批能力不等于IPC上限提升。
- 合成单客户10000篇实测：冷快照约501ms、16次SQL；typed IPC约299ms；热读取约32ms。载荷约14.46MB，说明大列表传输仍有成本，不把分批读取说成完成列表分页。探针 `r2-article-10000-client.jsonl` 中直接将10000身份传入底层 fact API 仍按预期返回 `OPERATIONAL_FACT_ARTICLES_INVALID`；服务和typed IPC均成功。样本仅内存摘要+真实SQLite，不包含文件枚举IO。
- 最终定向命令：`node --test tests/article-management-capacity.test.js tests/article-management-snapshot.test.js tests/phase-07-regular-queue.test.js tests/article-summary-read-model.test.js`：52/52，0跳过，见 `r2-final-targeted.log`；`npm run typecheck:main`、`npm run lint`、`git diff --check`通过。未重复完整桌面测试/打包；本批没有改IPC/schema/renderer，采用直接调用链的有界复核。
- 本批源码/测试SHA256见 `r2-source-state.json`；未提交/推送，保留第一批修改与用户 `pelican-bicycle.html`。原始测量在最后一次仅删去未消费事实集合之前执行；最终52项测试绑定最终实现。

## 第三批：付费批次查询端分页与轻量摘要

范围：投稿中心付费列表的可访问性、真实总数、客户/状态筛选和SQL载荷。普通队列需要额外处理单组内条目分页；全局执行/启动仍有无分页消费者，本批不声称全部 SA-03 / SA-07 已关闭。

- 在既有 `listPaidSubmissionBatchSnapshots` owner 内增加显式 page/pageSize 查询。先筛选客户与工作台可操作批次，计算完整总数，按 created_at/batch_id 稳定排序选择当前页，单次批量取回本页条目。参数化SQL，页大小1～500，拒绝不安全offset。
- 本页读取在SQL中只构造标题、身份、价格、阶段和暂停原因等需要的字段，不把item/intent中的完整publicationSnapshot正文传入JS。订单ID按attempt定位最小order_id，不再为每批次反复聚合全部订单。
- `paid-media-batch-orchestrator` → `media-workbench-application` → `submission-center-snapshot` 传递页请求和总数，页面不再对已分页结果二次slice。保持计数、hasMore和空页一致；既有无页调用仍返回原数组，执行/单批次完整快照仍保留正文。
- 正常分页每次固定3次付费SQL（总数、当前页header、当前页items），不随全库批次数增加SQL调用数。计数/深页offset仍需遍历匹配索引项，未宣称常数时间。
- 新增真实合成SQLite回归：20003批次、越过20000末页/空页/客户页、typed IPC、固定SQL调用数及SQL结果无正文；24种状态/暂停组合比对原完整快照的可操作性、阶段、暂停原因和计数。补齐分页元数据异常拒绝，保证不误报完整结果。

| 付费批次总数（每页10） | 首页耗时 | 含空普通队列/attention的SQL调用 | SQL返回行/字节 | 页面服务字节 |
| --- | --- | --- | --- | --- |
| 1000 | 4.7ms | 7 | 21 / 14209 | 7714 |
| 10000 | 18.5ms | 7 | 21 / 14268 | 7747 |
| 50000 | 90.2ms | 7 | 21 / 14321 | 7774 |

5万样本第2001页返回内容、hasMore=true；第5000页仍有10批次、hasMore=false；第5001页为空、总数仍50000。原首屏约1789ms / 20005 SQL / SQL结果123.12MB，本批对应约90ms / 7 SQL / 14.3KB。后页约132～171ms，反映count/offset成本。原探针保留，新适配探针为 `r3-probe.cjs`，记录为 `r3-center-*-paid.jsonl`；均为合成临时库，不涉及真实账号或订单。

本批剩余边界：无页全局付费运行/启动扫描仍保留旧20000上限，必须在后续修复；普通队列全量读/条目截断仍待处理。SA-05 的投稿中心读取链已修复，其他无页执行读取成本归入 SA-07。未新增持久投影或缓存。

最终验证：

- `node --test tests/paid-batch-pagination.test.js tests/paid-media-batch-client-scope.test.js tests/article-lifecycle-ticket-13.test.js tests/submission-center-snapshot.test.js tests/phase-06-media-typed-ipc.test.js`：42/42，0跳过，见 `r3-final-targeted.log`。
- `npm run test:desktop-core`：289文件、1778/1778通过、0失败/跳过/todo，约175秒。此结果覆盖第一～第三批的最终累计代码，见 `r3-desktop-tests.log`。
- `npm run typecheck:main`、`npm run lint`、`npm run format:check`、`git diff --check`通过。
- 有界复核：仅检查本批查询diff、读取/执行消费者分离、分页计数、SQL载荷、客户和状态组合、错误页元数据与直接回归。结论为本批范围PASS；整体SA-03仍部分未闭合。没有新增writer、持久缓存或schema变更。
- 未重复Electron打包/真实外部验收：本批未修改renderer或IPC外形；已通过真实typed IPC校验与现有桌面回归，不把此结果称为发布验收。
- 最终累计源码/测试SHA256及本批探针hash：`r3-source-state.json`，基线HEAD仍为 `1e74583cf0ee2be02125c65298bf3b5579a8bca5`，代码未提交/推送。所有改动保留在工作树，用户 `pelican-bicycle.html` 未触碰。

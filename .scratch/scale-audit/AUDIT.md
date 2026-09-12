# 规模化架构与性能审计：数据访问与读模型

后续状态：SA-01/02/04 已修复；SA-03/05 的付费页面分页与摘要读取已完成，普通队列和无分页执行/启动等剩余问题见 [REMEDIATION.md](REMEDIATION.md)。下文保留原始审计基线。

结论：**审计完成；当前实现未通过1万/5万规模目标。** 共7项发现，3项P1、4项P2；没有发现P0。本轮不修改生产代码，不改变业务行为。P1表示本次规模目标的阻塞，不等于已经观察到真实用户事故。

基线：`1e74583cf0ee2be02125c65298bf3b5579a8bca5`，Windows、Node v24.16.0。该提交远端CI已通过：[运行34695978929](https://github.com/jiayubing/autopublish/actions/runs/34695978929)。用户修改中的 `pelican-bicycle.html` 未触碰。

## 范围与前提校准

用户提出的顺序合理，但文件名单有历史残留：当前仓库没有 `dashboard-aggregation.js`、`queue-order-aggregation.js`、`tab-guidance-aggregation.js`、`root-operations.js`、`recovery-summary.js`。没有独立首页/dashboard页面：`App.tsx:40` 默认文章库，也可恢复上次页面。

当前实际读取链如下：

| 入口 | 查询与组装 owner | 关键成本 |
| --- | --- | --- |
| 文章库 | ArticleStore摘要 → archive summary + lifecycle facts → lifecycle projection → management snapshot → typed IPC | 整客户身份集合、最新attempt查询、快照序列化 |
| 投稿中心普通队列 | regular queue SQL → regular-queue-group-query → submission-center-snapshot | 全库组/条目读取，客户过滤后置，按组分页 |
| 投稿中心付费批次 | paid batch snapshots → paid orchestrator snapshot → submission-center-snapshot | 每批次一次item查询，完整payload进入JS，后置裁剪 |
| 待办 | operational attention + 事务/订单读者 → article-attention-query | 本轮空候选样本无正文读取；非空异常分布未压测 |
| workspace启动 | store schema检查/历史接受恢复 → regular/paid initializePaused → recovery | 暂停后同步返回全量队列/批次快照 |
| 默认页面装载 | App同时安装content/media/submissionCenter feature | 非当前页的投稿中心也订阅workspace刷新 |

文章搜索、已发布正文查看已按用户要求删除，本轮不以它们为优化目标。生命周期完整发布证据校验仍存在，本轮不降低校验。

## 方法与可信边界

- 1千、1万、5万任务；真实SQLite和当前生产查询代码。普通队列基础分布为10个客户、1个平台、每组100项（10/100/500组）。额外测单长队列、100客户/2平台/100组，以及5万组各1项的极端分布，用于隔离组长度与上限问题。
- 付费样本为每批次1项，分别1千/1万/5万批次，每项4KB合成正文。此分布用于暴露批次数N+1，不能推算成相同文章数但只有10个批次的成本。
- 每种样本先通过正式准入生成1条合法记录并验证查询，再复制身份一致的合成表行；外键检查均0违规。复制是隔离性能读测试的fixture准备，不证明5万次业务写入吞吐、完整生产恢复或历史迁移正确性。
- 文章库测量注入内存摘要，运行真实OperationalStore、projection和IPC；**不包含ArticleStore文件枚举/路径/stat/I/O**。客户名称解析采用无I/O解析器，客户验证为合成空操作；因此是读侧数据库与组装成本，不是端到端文章库总耗时。单客户超5000的失败发生在archive查询前置校验，不需要文件I/O即可复现。
- 首轮插桩观察SQLite公开prepare/all/get/run调用、返回行数/字节与耗时；SQL内部扫描由EXPLAIN补充。exec内事务/DDL不计入SQL调用数；不是磁盘物理读次数。SQL参数及数据全部合成。
- 无插桩普通队列单独重复3次取中位。单次原生同步查询超过45/55秒时由子进程超时终止，记作下界而非精确耗时。发生超时后的store-open可能触发遗留owner校验，因此不使用其耗时作正常冷启动基准。
- `center`测量隔离队列和付费，注入空attention，SQL数是下界；`center-full`使用真实OperationalStore attention读者，事务/订单候选为空，与当前无异常样本匹配。没有接触真实账户、网络发布、供应商订单或客户数据。
- 事件循环探针记录定时器最大间隔，仅说明主进程JS/SQLite同步占用，不是Electron UI帧率。耗时受机器/缓存影响，不承诺SLA。

## 主要测量

### 普通队列

| 总任务/组数 | SQL数 | 结果 | 时间 |
| --- | --- | --- | --- |
| 1千/10 | 2 | 返回1000条 | 无插桩3次中位474ms |
| 1万/100 | 2 | 返回10000条 | 无插桩3次中位8926ms |
| 5万/500 | 查询未完成 | 全库和单客户查询均超时 | 各>55秒 |
| 1千/1 | 2 | 返回1000条 | 插桩5915ms，定时器最大间隔约5915ms |
| 1万/1 | 查询未完成 | 长队列查询超时 | >45秒 |
| 1千/100，100客户/2平台 | 2 | 全库1000条；单客户10条 | 66/61ms |
| 5万/5万，每组1项 | 2 | 5万组但只返回2万条待执行项 | 727ms，组快照约26.90MB |

基础分布任务增加10倍，耗时增加18.8倍；即使每组长度不变也明显放大。单队列长度增长更危险。按客户查询仍读取相同的全库SQL行：1千样本返回某客户100条，但SQL仍读取2000行，约469ms。

### 文章与付费读取

| 场景 | 观察 |
| --- | --- |
| 5万任务库中查询一个客户5000篇 | lifecycle7条SQL；management8条SQL，约15.96秒；服务快照7,129,752字节；经过typed IPC的JSON envelope 7,254,785字节 |
| 单客户1万篇 | `PUBLICATION_ARCHIVE_ARTICLES_INVALID`，没有分批；直接lifecycle为`OPERATIONAL_FACT_ARTICLES_INVALID` |
| 1千付费批次 | 1001次SQL、2000行；完整批次结果约10.15MB，90ms |
| 1万付费批次 | 10001次SQL、20000行；完整批次结果约101.66MB，851ms |
| 5万付费批次 | 只返回20000批次；20001次SQL、40000行；完整结果约203.67MB，1737ms |
| 5万付费批次，投稿中心首页10批次 | 20005次SQL（含真实空attention），读取SQL结果约123.12MB，最终服务结果7774字节，1789ms |
| 5万付费批次，第2001页、每页10批次 | 空页，total=20000、hasMore=false，后面3万条无法通过分页到达 |

小载荷不意味着查询轻量：普通1千任务投稿中心首页的实际typed IPC envelope约265,547字节，但pageSize=10指组数，页内包含1000条任务。

### 启动与失效

- 普通store-open（干净退出后的逻辑重新打开）约16–19ms，309次schema/metadata SQL观察、864行，1千至5万正常样本没有显示数量级增长；尚不能据此认为整个workspace启动很快。
- regular `pauseRegularQueueGroupsOnStartup()` 在1千队列任务时约482ms，在5万/500组时>55秒；即使本来已经暂停、需要更新0组，也返回完整快照，仍执行昂贵查询。
- paid `pausePaidSubmissionBatchesOnStartup()` 在1万批次约779ms，在5万批次约1624ms（已被2万批次上限截断），返回约203.67MB对象。干净启动重复组装无必要的完整正文载荷。
- 无待恢复条目的recovery首个256页查询为1条SQL、0结果、约0–1ms；空候选只证明空态，不证明大量uncertain/后处理任务的恢复安全与吞吐。
- 投稿中心1千任务：同页热命中约2ms/0 SQL；下一页（空页）仍487ms/3 SQL，返回第一页475ms/3 SQL；一次`ARTICLE_SAVED`后再次读取499ms/5 SQL。attention有自己的缓存，因此翻页时SQL数从5降至3，队列全量读取仍重复。
- 文章management同客户同版本缓存/并发合并正常；但全局articleReadRevision变化会让无关客户下次重新读取。5万库的样本再次读取该5000篇客户约16.1秒。

## Findings

所有发现为 `EXPOSED_PREEXISTING`，相对当前基线，没有在本次只读审计中引入。

### SA-01 · P1：最新attempt查询缺索引，文章库成本随总历史与客户文章数相乘

Owner：OperationalStore fact reader + 正式schema migration。

位置：[fact-reader.js:55](../../auto—publish/src/infrastructure/operational-store/internal/operational-store-fact-reader.js:55)。每个publication的相关子查询按publication_id找最新rowid。`article-plans.json` 显示 `SCAN latest`，另有submission_items按article_id扫描。

证据：5万任务库的5000篇客户，该条SQL约15.34秒，占本次management主要成本。在独立5万任务数据库副本执行同一SQL：原查询11,921.9ms；仅增加`publication_attempts(publication_id)`实验索引后3次约80.1/79.9/81.8ms；5000行完整结果SHA-256完全一致。时间顺序存在缓存影响，但执行计划由逐项全扫描变为索引定位，足以支持优先修复方向。

修复方向：通过正式migration增加经计划验证的索引，验证最新attempt选择、取消/失败/成功和历史恢复语义。再评估submission_items(article_id)；不绕过成功证据校验、不引入并行事实表。当前库和生产代码没有添加实验索引。

### SA-02 · P1：普通队列组查询按条目重复扫描本组，且处于同步启动/刷新路径

Owner：regular queue runtime；直接调用者为regular-queue-group-query、startup initializePaused。

位置：[regular-queue-runtime.js:107](../../auto—publish/src/infrastructure/operational-store/internal/operational-store-regular-queue-runtime.js:107)。外层先join组内全部条目；每条外层记录执行lastGroupBlockedCode相关子查询；取回后才JS去重为每组1行。最坏扫描量与各组长度平方和相关，反复json_extract大payload进一步增加成本。

证据：`queue-plans.json`、`queue-1000-long.jsonl`、`queue-10000-long.jsonl`、三个无插桩重复及5万超时。单组1000条即连续阻塞约5.9秒，启动暂停调用相同查询。

修复方向：先得到每组唯一current/blocked fact，再联接组；blocked reason按组一次聚合或有界读取。保留FIFO位置、当前claim、pauseIntent及不确定结果，单条动作不要返回全库快照。仅分页不修该SQL，仍会承担本组重复扫描。

### SA-03 · P1：LIMIT 20000静默截断被当成完整事实，计数和后续分页错误

Owner：regular queue runtime、paid execution aggregate、submission center query合同。

位置：[regular-queue-runtime.js:136](../../auto—publish/src/infrastructure/operational-store/internal/operational-store-regular-queue-runtime.js:136)、[paid-execution-aggregate.js:255](../../auto—publish/src/infrastructure/operational-store/internal/operational-store-paid-execution-aggregate.js:255)。

证据：5万付费批次查询只返回2万；第2001页空且hasMore=false。5万组各1项普通队列真实存在5万待执行项，但快照只有2万项，后面的组变为空组；这是正确性/可操作性问题，不只是慢。极端组数样本用于迅速隔离截断，非典型客户分布。

修复方向：查询端cursor/稳定排序、真实总数或明确hasMore；达到产品容量时明确拒绝或提示，不能把截断当完整。不能简单把常量改成50000，因为会放大SA-02/05。

### SA-04 · P2：单客户超过5000个活动/回收身份，文章库整体读取失败

Owner：article-management-snapshot + archive/fact query合同。

位置：[publication-success.js:181](../../auto—publish/src/infrastructure/operational-store/internal/operational-store-publication-success.js:181)、[fact-reader.js:21](../../auto—publish/src/infrastructure/operational-store/internal/operational-store-fact-reader.js:21)。management把客户文章/回收身份一次传入，没有分批或页级请求。

证据：`article-dense-10000-regular-all.jsonl`。这是明确上限，不是数据量增长后“再慢一些”。不需要发布历史也会先被archive的输入长度限制拒绝。

修复方向：统一定义页级读取或有界批次，保持同一snapshot revision和跨查询一致性；同步保留筛选/计数/跨页操作语义。不把5000直接改成无限。

### SA-05 · P2：付费批次N+1和完整payload组装，页面越小越显得浪费

Owner：paid execution aggregate 的查询侧、paid orchestrator snapshot、submission center。

位置：[paid-execution-aggregate.js:240](../../auto—publish/src/infrastructure/operational-store/internal/operational-store-paid-execution-aggregate.js:240)、[paid-execution-aggregate.js:264](../../auto—publish/src/infrastructure/operational-store/internal/operational-store-paid-execution-aggregate.js:264)。每批次itemRows一次SQL，读取item_payload/intent_payload并构造publicationSnapshot；currentItem又引用首个item，序列化时再次携带内容。展示入口复用了执行所需的完整快照。

证据：1万批次10001次SQL和101.66MB完整结果；5万样本第一页最终只有7774字节，但SQL结果123.12MB。数据已经被20000上限截断，不能把1万→5万耗时仅约2倍误读成扩展性良好。

修复方向：在同一OperationalStore owner内批量读取选中页的summary，执行claim仍读取单项完整快照；标题、状态、数量不需要正文。避免为UI再建独立持久缓存。批次的数据库级分页和items级范围都要有界。

### SA-06 · P2：投稿中心先全量后分页，单页缓存与宽失效重复支付全量成本

Owner：submission-center-snapshot、regular-queue-group-query、workspace invalidation。

位置：[submission-center-snapshot.js:266](../../auto—publish/desktop/services/submission-center-snapshot.js:266)、[submission-center-snapshot.js:299](../../auto—publish/desktop/services/submission-center-snapshot.js:299)、[submission-center-snapshot.js:342](../../auto—publish/desktop/services/submission-center-snapshot.js:342)。客户过滤在regular组读取后；每页cache key不同但写入先clear全缓存；articleReadRevision是跨客户共享版本。

证据：1千任务第一页→第二页→第一页，第二次第一页仍重跑全库；空页也是约0.48秒。单客户查询SQL行数与全库相同；无关ARTICLE_SAVED事件后重读。此项与SA-02/05放大叠加，不能独立累加为三份节省。

修复方向：客户/页范围下推；对现有读侧定义清晰的失效依赖，沿用一个版本体系；相同范围并发请求可合并。先消除全量查询，再判断保留几页缓存是否有实测收益。不要靠增加每页缓存隐藏根因。

### SA-07 · P2：启动和默认页面被非当前页的全量快照绑在一起

Owner：workspace composition、regular/paid initializePaused、App feature加载策略。

位置：[regular-queue-group-composition.js:24](../../auto—publish/desktop/composition/regular-queue-group-composition.js:24)、[paid-media-batch-composition.js:18](../../auto—publish/desktop/composition/paid-media-batch-composition.js:18)、[App.tsx:85](../../auto—publish/media-workbench/src/App.tsx:85)。startup暂停实际只需修改运行意图并检查在途任务，却构造全部组/批次。App无论当前页都安装投稿中心feature，workspace事件触发全局读取。

证据：1千普通任务暂停快照482ms；5万/500组>55秒；5万付费启动快照约203MB。页面装载依赖由源码直接调用链确认，**未运行完整5万数据的Electron启动计时**，因此不声称总启动耗时恰为这些时间之和。

修复方向：安全暂停/孤儿恢复仍在启动前完成，读取范围聚焦活动事实；可见页面内容和后台徽标查询分开，按需加载重列表。不能简单跳过恢复、去掉同步锁或自动重试不确定投稿。

## 建议实施顺序与停止条件

1. 先修SA-01正式索引，以及SA-02队列SQL。两项都是有实测证据的根因，且不需要新业务状态或缓存。
2. 修SA-03/04容量合同：页范围、真实计数、无静默截断；以跨页选择/取消、客户过滤和revision稳定为验收。
3. 在已有owner内收窄付费展示读取（SA-05），再处理失效和启动重读取（SA-06/07）。

建议冻结为后续门禁：1千/1万/5万、1/多组、活动/完成/异常混合分布；数量完整、每页载荷有界、SQL次数不随批次数线性增加；最新attempt结果一致；长队列不出现平方级增长。具体耗时预算需以目标硬件和实际业务规模确定，不在审计中任意写死“全部<100ms”。

当前没有执行修复；SA-01/02/03为规模目标阻塞，SA-04亦需在承诺万篇单客户之前关闭。后四轮（执行资源生命周期、新平台成本、依赖方向、历史减法）仍未实施，不把本轮报告冒充五轮完成。

## 验证、证据与未测项

- `node --test tests/article-management-snapshot.test.js tests/submission-center-snapshot.test.js tests/phase-07-regular-queue.test.js`：48/48通过，见 `baseline-tests.log`。常规回归通过与本次规模失败并不冲突。
- 原始测量：各 `*.jsonl`；归一化索引：[MEASUREMENTS.json](MEASUREMENTS.json)；SQL计划：[article-plans.json](article-plans.json)、[queue-plans.json](queue-plans.json)；索引实验：[index-experiment.jsonl](index-experiment.jsonl)。
- 复现脚本：[probe.cjs](probe.cjs)、[run.py](run.py)、[index-experiment.cjs](index-experiment.cjs)。先`node .scratch/scale-audit/probe.cjs seed 10000 100 regular > .scratch/scale-audit/seed-10000-regular.jsonl`，再`python .scratch/scale-audit/run.py regular 10000`。seed输出明确的合成workspace；不接受任意生产路径。构造临时fixture不是原始数据迁移。
- 主进程源码/探针SHA清单：[source-state.json](source-state.json)。既有测试、生产源码、schema没有改动；本轮变更只有审计资料与工作索引。未运行与只读审计无关的完整build/全量门禁，未提交/推送。
- 未测：完整Electron启动/帧率、5万ArticleStore真实文件冷盘I/O、真实供应商延迟、非空恢复重启状态矩阵、真实客户文章长度分布、第三平台接入成本、旧版本用户升级分布。后两者属于后续轮次，不能据此退役migration或平台代码。
- 有界复核只检查测量可复现性、SQL执行计划、阈值/分页反例、索引结果等价和事实owner，未开启新的全仓审计。结论为 **AUDIT_COMPLETE / SCALE_TARGET_BLOCKED**。

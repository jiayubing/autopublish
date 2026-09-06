# AutoPublish 可靠性与批量能力改进计划

> 执行版 v1.0 · 2026-09-06
> 执行更新：R1 已由 PR #31 合并并完成前序主线验证；本线程仅执行 R2。下文和 §10 中“从 R1 开始”是历史启动说明，不重新开启 R1。  
> 先复现并修复并发恢复，再按实测减少批量开销。不重建架构，不重做历史阶段。

## 1. 这份文档怎么用

本计划面向 `jiayubing/autopublish`，将上一轮审计的下一步工作拆成 **5 个串行工作包，每个工作包一个执行线程** 。把本文件上传到新线程，使用第 10 节的启动指令，从 **R1** 开始；前一包完成、经你确认合并并核验主线结果后，再开下一包。

本计划由 R2 获授权执行线程入库，沿用附件正文，不另建计划。仓库维护路径为：

```text
.scratch/reliability-batch-follow-up/RELIABILITY-BATCH-FOLLOW-UP-PLAN.md
```

Markdown 是后续执行和更新进度的唯一计划文本；Word 是同版阅读副本。不要在两个版本中分别维护状态。本文件被明确指定为当前任务后，只在 `docs/WORK-INDEX.md` 添加或切换导航，不新建第二套调度规则。

### 1.1 基线与证据边界

编写时重新核验的 `master` 为：

```text
4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d
```

这只是审计参考点。**每个执行线程都必须重新读取 GitHub 最新 master，并以开始工作时的实际提交为真源，不能回到这个旧提交实施。** [S01]

旧优化计划已记录 A/B/C/L 合并；D 的 CI 去重 PR #27 也已核实合并。旧计划与工作索引仍有部分进度描述未同步，不能据其旧状态重做工作。旧 E 行即使记录了真实验收，也不能视为本轮真实登录、发布、付费或图片上传的授权。 [S02]

上一轮的并发问题有源码控制流和抽取式模拟探针支持，但探针没有直接运行完整生产调用链。性能问题中，有源码可定位的重复加工，也有尚待实测的规模影响。本计划要求先把这些线索变成当前版本的真实模块回归或可复现测量，不能把推断写成生产事故。

### 1.2 推荐路线

| 工作包 | 本线程只解决什么 | 当前状态 | 推进条件 |
| --- | --- | --- | --- |
| R1 | 生成配置暂停被并发任务覆盖 | COMPLETE | PR #31 已合并；仅作为 R2 现有回归，不追溯扩大验收 |
| R2 | 生成标题重复查询与整批事件加工 | PARTIAL | 本线程唯一实施范围；前后测量与恢复回归见 §11.3 |
| R3 | 文章管理快照的低风险读取优化 | PENDING | R2 合并；只改证实的热点 |
| R4 | 测试与 CI 剩余维护成本减法 | PENDING | R3 结项；不重做旧 D，不减少有效保障 |
| R5 | 本轮集成验证与交接 | PENDING | R1–R4 结项；最终提交的验证闭合 |

R2–R4 允许“经验证无需代码修改”结项，但必须说明测量或覆盖证据。不得为了让每一包都有提交而制造改动。第 9 节的条件事项不属于上述必做路线，不自动进入。

<!-- pagebreak -->

## 2. 全程边界与执行方式

### 2.1 不得改变的业务规则

一篇文章同时最多一个活动发布目标；入队后冻结；首次明确发布成功后永久只读，不再入队、改投或回收。完整生成结果直接待投稿，不恢复审核流程。普通投稿与付费订单继续分别执行，共享文章身份与成功事实；需处理事项不成为第二套文章状态。 [S03]

发布、下单等不可逆远端操作的 `uncertain` 不能自动重试。AI 生成的既有限次重试属于另一条链路，本轮既不扩大其重试次数，也不把它当成重投远端文章的依据。旧 B 的发布时间及来源、排序和筛选规则保持不变。 [S02][S03]

保留已有生命周期投影、活动目标约束、成功归并、内容身份索引、存储恢复与跨进程边界。不得引入新的插件框架、消息总线、通用状态机、分布式队列、全仓 TypeScript 改造或整库迁移。不得重写列举网、蓝色河畔适配器或推进多账号并行。

### 2.2 每包开始前的最小预检

先读根 `AGENTS.md`、`auto—publish/AGENTS.md`、`README.md`、`docs/AI-ENTRY.md`、`docs/WORK-INDEX.md` 和本包内容；按需读取相关 `CONTEXT.md`、SPEC 小节，以及执行和审计协议。随后只扩展到本包 owner、直接调用方、消费者和行为测试，不批量读取历史 `.scratch/`。 [S03]

记录实际 base SHA、分支、工作树与暂存区状态；检查同 owner 是否已有活动 PR/worktree。已有修复则核验并复用，不重复实施；存在重叠在途工作则先协调，不把另一线程改动覆盖掉。目录内存在用户改动时保留它们，不使用破坏性 reset 或 `git add .`。

### 2.3 一个线程的结束点

一个线程只推进被点名的工作包。默认采用“实施 → 定向测试 → 一次范围内审查 → 修复阻塞问题 → 必要的有界复审 → 交接”。不会因为本计划列出下一包就自动进入下一包。普通实现选择、可局部修复的测试失败，不需要反复询问。 [S03]

**提交、push、创建 PR、合并和真实外部操作，按该线程当次明确授权执行。** 第 10 节的启动指令授权提交、push 与 PR，但明确不授权合并；需要合并时另行确认。最终 CI 结果必须对应当前提交，不能用前一个提交的绿灯替代。

发现新的产品决策、公开协议或 schema 的实质变化、数据迁移/删除、不可逆副作用边界变化，或必须使用真实账号才能继续时，停止相应变更并交接。不得通过新增兼容路线、吞错、提高超时或削弱校验来换取表面通过。

### 2.4 控制验证负担

先跑定向回归，再跑直接调用链与适用的类型、构建检查；完整必需验证放在当前 CI 和 R5 收口。每次修复只先复测受影响范围，不重新做全仓审计。本计划不要求新增自制 gate、测试数量指标、覆盖率门槛或大型 evidence 框架。证据复用现有机制，短结论写在本计划或 PR 中即可。

<!-- pagebreak -->

## 3. R1：修复批量生成的并发暂停语义

**目标：** 配置错误导致的批次暂停，不被其他并发任务的失败、中断或完成回写覆盖；修复配置后可正常继续，已保存结果不重复生成。

### 3.1 证据与职责

参考入口：`src/content/generation-batch-runner.js` 的 `runTask / worker / finishStatus`，`generation-batch-store.js` 的任务转换，以及 `desktop/services/content-generation-batch-service.js` 的运行和恢复入口。上述路径均相对 `auto—publish/`。 [S04][S05]

既有可疑交错为：任务 A 写入 `paused_configuration`，任务 B 被终止后写入 `interrupted`，最后汇总可能得到 `failed`。批次停止原因由现有 runner/service 的实际职责归属决定，持久化仍归 batch store；Renderer 不增加补偿状态机。

### 3.2 实施步骤与范围

先用**真实 runner + 临时目录中的真实 batch store + 可控假 AI transport** 复现；通过可控 Promise/屏障安排先后顺序，不靠固定 sleep 碰概率。至少一条测试在修复前暴露错误、修复后通过。不能把抽取探针复制进测试后只验证抽取代码。

在既有停止与汇总逻辑中明确优先级，并验证新一轮运行会重置本轮停止原因。允许修改 runner、batch store、batch service 及直接测试；只有公开展示确实无法表达结果时，才触及对应 feature/DTO。不要新增状态名称、通用状态框架或改生成模型配置体系。

### 3.3 验收矩阵

| 场景 | 必须观察到的结果 |
| --- | --- |
| 并发 1、2、4；配置错误与其他任务中断交错 | 批次停止原因正确；停止生效后不再领取新任务；无残留 running |
| 配置错误与已成功任务完成交错 | 成功任务和文章保留；成功回写不抹去本次配置暂停 |
| 普通单任务失败，没有配置错误 | 仍按既有规则继续其他任务，不误变成配置暂停 |
| 手动暂停、dispose、配置错误相邻发生 | 结果可解释、可恢复；不永久保留已经过时的停止原因 |
| 修复配置后继续；关闭并重建服务后继续 | 仅执行允许恢复的任务；已保存文章不重复调用 AI |
| 文章已保存，任务成功状态尚未落下 | 继续时通过已有身份查找恢复；不新建第二篇结果 |

同时核对服务层能力字段与最终批次一致，不能仅断言一个内部 status 字符串。测试不访问真实 AI、发布平台或用户工作区。

**定向测试起点：** `generation-batch-runner.test.js`、`generation-batch-store.test.js`、`content-generation-batch-service.test.js`；必要时增加现有文件内的组合场景。

**完成条件：** 当前版本复现及修复证据齐全；矩阵通过；没有新增竞争 owner；记录实际命令与结果。若当前 master 已修复，则提供覆盖同一交错的实际回归结果，无需再次改实现。

<!-- pagebreak -->

## 4. R2：减少生成进度的重复读取和加工

**目标：** 批次越大，不再仅为了显示标题而反复读取已经成功的所有文章；减少没有展示价值的整批复制，不牺牲重连与恢复可靠性。

### 4.1 先测量，不直接切换事件协议

`enrichBatch()` 遍历成功任务读取标题，执行器在任务处理后发送包含批次的事件，服务又进行安全投影和复制。这是本包的主要调查点。它与旧 C 已优化的“逐任务重建全库身份索引”不是同一个问题。**旧 C 的身份索引不得重做或撤回。** [S05][S06]

在相同环境、相同合成输入下记录修复前后：标题查询次数、实际文章文件读取次数、事件数量与总字节量、批次文件读写次数、总耗时。能够低成本获得时再记录 Main 阻塞与内存，不新建监控系统。区分缓存命中、真实磁盘读取与逻辑调用次数。

最低使用 10、100 个任务，并发 1 和 2；1000 任务属于扩展观察，必须先确认当前任务上限并使用合法客户端/模板输入，超过上限不得为跑基准提高产品限制。计数可采用合成运行，磁盘耗时使用临时目录。至少区分首次加载与热运行，不把推算值标为实测。

### 4.2 优先采用最小改动

首先考虑本轮运行内的标题复用、从任务成功结果携带已有标题、减少重复 `clone/serialize` 或合并同一状态的重复通知。缓存若存在，必须有明确的批次/工作区边界、容量或清理时机，并能在文章发生合法修改后重新取得正确标题。

**默认保留已有完整快照协议。** 不要一开始就引入增量事件、补洞、重放和第二套订阅状态。只有实测表明最小优化仍不足，才登记单独方案；公开协议变化不得顺手夹入本包。

不要将 task running/succeeded 等恢复关键写入改成“最后整批再保存”，也不要把批次存储迁移为新数据库。若整批持久化仍是主要热点，记录到第 9 节的后续观察项。

### 4.3 验收条件

在“标题未变化、无人工刷新”的受控运行中，成功文章标题查询的累计增长应为线性，而不是随每个完成事件反复遍历全部成功文章；交接写清所选实现的具体次数，不预设统一毫秒门槛。

完整批次的首次进入、离开重进、重启恢复、订阅晚到、事件重复/乱序仍能收敛；沿用已有 runtimeId/sequence 防陈旧机制。暂停、失败和最终完成通知不能因节流而丢失。合法标题修改后主动刷新可见，跨客户、跨批次和跨工作区不能串缓存。

执行 R1 的关键并发回归，并验证“文章已保存但任务未标成功”仍可恢复。以同样数据说明哪些指标改善、哪些没有改善，不能只报告理论复杂度或只计 IPC 次数。

**定向测试起点：** `content-generation-batch-title-projection.test.js`、`generation-snapshot-event.test.js`、`generation-read-amplification.test.js`、`content-generation-batch-service.test.js`、相关 IPC 测试。

**完成条件：** 消除已复现的标题查询放大，或用实际数据证实当前版本不存在该问题；给出前后对照，协议、幂等和恢复不退化。本包不要求同时解决所有 O(N²) 路径。

<!-- pagebreak -->

## 5. R3：优化文章管理快照的已证实热点

**目标：** 降低文章与发布记录增长后列表刷新成本，保持分类、发布事实、权限与发布时间规则一致。

### 5.1 调查入口与测量

主要 owner 为 `desktop/services/article-management-snapshot.js` 及其直接只读查询、生命周期投影和 feature。已知线索包括档案匹配使用 `articleIds.includes()`、多份列表复制、完整内容聚合及较粗的缓存失效能力。先检查真实调用方：不能仅因为存在 `invalidate()` 就断言它在生产中频繁触发。 [S07]

使用 100、1000 篇合成文章，分别覆盖无发布历史、包含失败尝试和已发布档案的情况。测量首次读取、缓存命中、相关数据变更后刷新以及客户切换；分开记录查询次数、读取内容量、返回体字节数和耗时。10000 篇属于手动容量观察，不新增为每次 PR 的硬门禁。

### 5.2 本包允许的改动

优先修正已证实的重复关联，例如用已有或局部 `Set/Map` 取代重复线性查找；减少同一请求内重复读取和复制；在现有事件确实携带足够身份时，才做定向失效。信息不足时保留正确的全局失效，不凭推测让其他客户数据长时间陈旧。

缓存只保存可重建读模型，不成为生命周期权限的真源。所有实际写入仍由既有 owner 重新判断。共享队列变化可能影响多个客户，不能因为做了客户级优化而遗漏它们。

**默认不改公开返回协议，不做列表/正文/档案详情的全链路重构，不迁移文章存储。** 若现有返回体和全量正文确实成为瓶颈，将分页或摘要/详情拆分列为条件工作，不与本包混在一起。

### 5.3 验收条件

| 行为 | 不允许退化的结果 |
| --- | --- |
| 待投稿、待完善、投稿中、已发布、回收站 | 分类与计数一致，权限仍由同一生命周期 owner 决定 |
| 普通成功、付费发布、人工确认、历史缺失时间 | 保持旧 B 的时间来源、排序、分组与筛选语义 |
| 保存、入队、移出、结果归并、回收与恢复 | 下一次合法刷新可见，不依赖重启纠正缓存 |
| 同 ID 的不同客户/不同工作区；迟到查询 | 不串数据、不覆盖新范围，不用旧缓存开放操作 |
| 发布、订单或身份事实读取异常 | 不伪装成未发布或空数据，不开放重投、删除 |

**定向测试起点：** `article-management-snapshot.test.js`、`article-management-snapshot-benchmark.test.js`、`article-trash-management-refresh.test.js`、`b-published-time-behavior.test.mjs` 及对应 renderer 测试。

**完成条件：** 提交经实测有收益的局部优化，或者明确记录“当前规模无需进一步修改”。调用次数恒定不等于处理成本恒定；报告必须包含数据量或返回体。单条异常档案的隔离需求按第 9 节 Q1 判断，不直接改为吞错跳过。

<!-- pagebreak -->

## 6. R4：测试与 CI 的剩余维护成本减法

**目标：** 减少重复配置、过时的实现形状断言和没有额外验证价值的重复执行，保留真正保护业务的测试。

### 6.1 不重做旧 D

PR #27 已完成一轮迁移、诊断、媒体 transport 测试执行去重和 renderer typecheck 去重。本包从当前 workflow 与 scripts 的实际执行情况出发，不再按旧名单重复排除测试，也不撤回独立的安全或生产包验证。 [S02][S09]

建立一张小表即可：测试组/命令、当前执行 job、触发场景、重复执行是否增加环境覆盖、保留或调整原因。范围仅覆盖本次候选，不要求建设全仓测试资产管理系统。

### 6.2 选择少量高收益候选

首先检查 `test:desktop-core` 的长排除清单、`format:check` 的维护方式，以及只绑定私有名称、固定 import 位置或业务源码字符串的断言。已经承担依赖方向、能力缺席、安全或打包职责的静态检查不能按“用了正则”一概删除。 [S03][S09][S10]

对候选测试记录“保护什么行为”；已有等价公开行为测试时才删除重复形状断言，没有时先补最低必要行为测试。先整理本轮涉及范围，不统一重命名全仓文件，不做整库格式化。

测试串并行分类也只改已证实会误分类或显著增加成本的点。保留真实共享资源所需的串行策略，不因代码中出现 process.env 就臆测所有测试必须同进程串行，也不为追求速度直接全部并行。

跨 job 重复运行可能用于不同环境或 strict link-capability 保障，必须核实后再合并。Auth 的 paths 过滤与 required checks、共享依赖可能联动；本包默认不改认证产品或分支保护，无清晰等价方案则保留。

### 6.3 验收条件

删减前后可解释每一个测试或命令的去向；新增的 R1–R3 回归在当前 CI 中有明确执行位置。动态覆盖与相关静态边界仍在，不能仅凭测试数量减少宣称优化。

PR 不要求执行仅在 master push 才允许的任务，但必须把它们记为待主线验证，不能将 skipped 当通过。对比相同类型运行的实际 job/步骤耗时，不把缓存、机器或网络差异直接归因为代码改进。总时长不必达到固定降幅；没有安全收益的候选可以无修改结项。

保留事务、幂等、重启恢复、远端 uncertain、客户隔离、生产 preload/包启动验证。**不提高超时掩盖测试卡死，不禁用失败测试，不让“可跳过”悄悄变成默认漏跑。**

**完成条件：** 小范围减法和实际执行映射清楚，当前最终提交的相关检查通过。适用命令从当前 `package.json` 与 CI 读取，不能把 `npm test`、`test:all` 和 `test:desktop-core` 当作同一覆盖范围。 [S09]

<!-- pagebreak -->

## 7. R5：集成验证与本轮收口

**目标：** 证明 R1–R4 组合后可靠，不重新审计整个产品，也不新增架构工作。

### 7.1 有限集成矩阵

| 场景 | 预期结果 |
| --- | --- |
| 采集结果/手工来源 → 生成 → 文章库 → 普通投稿 | 合成端到端链路闭合；生成与投稿 owner 不混合 |
| 并发生成配置暂停 → 修复配置 → 继续 | 未完成项可恢复，成功文章不重复生成，进度正常收敛 |
| 保存成功后任务状态未完成 → 重建服务 | 通过既有身份恢复，不生成重复文章 |
| 跨客户批量入队部分失败 → 关闭后重进 | 仍可处理失败部分，不重投已入队或已发布文章 |
| 投稿 accepted / article_rejected / uncertain | 成功事实保留；明确失败按既有入口处理；不确定不自动重投 |
| 远端调用开始后重启、结果落库异常、迟到成功 | 不重放远端调用；生命周期和操作权限保持正确 |
| 客户/工作区切换、旧事件晚到、快照缓存刷新 | 不串数据；页面与最新事实一致 |
| 旧 B 的发布时间与文章库分类 | 不借生成时间兜底，保持已确认的展示和排序规则 |

优先复用已有公开行为和集成测试，只补本轮改动的组合缺口。普通、付费和不确定结果全部使用假 transport 与临时存储，不执行真实发文或收费操作。

### 7.2 最终验证

在所有修复进入最终集成提交后，核验该提交所需的完整 CI 与本轮矩阵。与已有 CI 完全重合的命令不要求再人为运行一套重复全量测试；存在 CI 未覆盖的必要新增回归，单独执行并注明位置。

生产目录 smoke、preload 和安装包按当前 workflow 执行；用户实测使用的产物必须能追溯到该最终提交。代码或测试在最终验证后再次变化，则受影响的验证按协议在新提交重新取得。不能用旧 SHA 的安装包证明新 SHA 可用。 [S03][S09]

自动验证通过与真实平台验收分开记录。未进行本轮真实平台验收不伪装为失败，也不能声称已验证远端全链路。历史无图验收不证明图片、付费订单或新版本已经验收。

### 7.3 交付与停止

交付最终 SHA、各包结果与变更范围、实际运行命令/CI 链接、前后性能数据、未运行项及原因、剩余条件事项。修复只闭合发现的组合回归，复审限于它们的直接影响范围。

达到完成条件后，把本计划状态更新为 COMPLETE 并停止。不因为“还可以更简洁”自动进入 Q1–Q4，不重新启动旧 Wave、A/B/C/D/L/E，不增加新一轮全仓审计。

**本轮完成不等于承诺万篇规模或长期无人值守运行。** 容量结论只覆盖已测的文章/任务数量、存储环境和场景。

<!-- pagebreak -->

## 8. 命令起点、数据与回退

以下只是编写时已存在的定向测试入口示例。执行前确认当前文件仍在、scripts 未变化，并使用当前 CI 的运行环境；桌面基线在编写时为 Node 24。新增组合测试也必须实际运行，不能仅执行下列旧文件。 [S09]

在 `auto—publish/` 中，R1 的命令起点：

```text
node --test tests/generation-batch-runner.test.js tests/generation-batch-store.test.js tests/content-generation-batch-service.test.js
```

R2 的命令起点：

```text
node --test tests/content-generation-batch-title-projection.test.js tests/generation-snapshot-event.test.js tests/generation-read-amplification.test.js
```

R3 的命令起点：

```text
node --test tests/article-management-snapshot.test.js tests/article-management-snapshot-benchmark.test.js tests/article-trash-management-refresh.test.js tests/b-published-time-behavior.test.mjs
```

涉及 bridge、Renderer 或主进程类型边界时，按实际改动选择当前的 `typecheck:bridge`、`typecheck:main`、`build:renderer`、`build:preload` 和 lint/format 检查。`build:renderer` 已包含 renderer 类型检查时，不额外重复同一命令。最终以真实 workflow 归属为准，不用本节代替 CI。

### 8.1 数据与测量记录

所有写入测试使用合成客户、临时内容库和假远端调用。性能记录最低包含：base/修改后 SHA、Node/系统、任务/文章数、并发、是否冷启动、实际调用/读写/字节计数与测量命令。耗时有波动时进行少量重复并报中位数或范围；不凭一次数字下结论。

不在日志里保存真实客户正文、凭据、Cookie、绝对敏感路径或供应商原始异常。不要为基准引入常驻埋点或专用生产调试接口。

### 8.2 回退与停止条件

本轮默认不改 schema，不做生产数据迁移。代码回退应通过经授权的正常版本控制流程进行；不能通过还原旧数据库来抹掉已经发生的远端投稿或订单事实，也不能靠修改任务 JSON 把成功文章变成可重试。

发现必须改 schema、公开协议、远端副作用或既有产品规则才能实现“优化”时，记录原因、最小替代方案和风险，停止这一扩展。新发现若属于本包直接回归或 P0/P1，先在本包闭合；无关的非阻塞债务记入第 9 节，不追加一串强制工作包。

<!-- pagebreak -->

## 9. 条件事项：有证据再启动

这些不是本轮默认实施范围。每项先核实当前版本，再单独定义范围、验收和授权；不能因本表存在而自动新增服务或状态对象。

### Q1. 单条异常档案的读取隔离

**触发条件：** 用真实只读查询和合成坏档案复现“一条异常阻断其他可验证内容浏览”，且当前错误呈现确实影响日常使用。线索在 `safePublishedArchive()` 的整批映射抛错，不等于本次已发现生产数据损坏。 [S07]

优先在已有页面状态中呈现不可用项或只读降级；未知身份、缺失生命周期事实时仍禁止重投和危险操作。不得 catch 后返回空档案并当作未发布。若需要新增跨层协议，另开边界明确的工作包；本轮不预设新错误框架。

### Q2. 采集重启后的原批次恢复与进度优化

**触发条件：** 实际频繁使用长批次，重启后仅靠“补采缺失”无法恢复原选择，或每秒全任务快照在测量中造成明显开销。当前队列为内存状态，已有回答可由 missing 模式跳过，两者不能混称完整断点恢复。 [S08]

先改善操作说明、默认入口或倒计时通知；确有必要才保存最少的原任务选择与执行记录。已经保存的回答不能丢失，重采失败不能覆盖好结果。不要照搬付费投稿事务链或建设通用采集引擎。

### Q3. 内部 exact-key 校验与机械转发

**触发条件：** 修改某个实际业务能力时，证实多处方法清单或空转发是主要负担，并且有等价的依赖方向/行为保护。保持对象能力隔离，不将完整 OperationalStore 暴露给所有服务。 [S11]

只在本来就要修改的调用链做减法；不全仓扫描后批量删除 guard。IPC、持久文件、远端结果与危险操作边界的校验保留。没有实际变更需求时不启动专门重构。

### Q4. 更大规模的分页、摘要拆分或批次存储优化

**触发条件：** R2/R3 的小范围优化完成后，代表性数据仍显示返回体、正文读取、Main 阻塞或整批写入是主要瓶颈。

先给出最小分页/按需详情或存储写入方案，明确选择、排序、全量计数、重启与旧数据处理。只有证据表明现有结构无法满足需求时才讨论更换存储。本轮不先造增量事件协议、双读模型或同步框架。

**不作为任务：** 代码行数仍多、文件名带 contract/evidence、某个目录“不够优雅”，本身都不足以触发重构。

<!-- pagebreak -->

## 10. 新线程启动指令与交接格式

### 10.1 首先复制这段，附上本 Markdown 文件

```text
@GitHub 连接 jiayubing/autopublish。

以本次开始时 GitHub 最新 master 为真源，执行附件
《AutoPublish 可靠性与批量能力改进计划》中的 R1。
本线程只处理 R1，不进入 R2，不重做旧 A/B/C/D/L/E。

先读取根与 auto—publish/AGENTS.md、README.md、
docs/AI-ENTRY.md、docs/WORK-INDEX.md、本计划，
以及执行/审计协议中当前范围所需规则。
核对实际 HEAD、工作树和重叠 PR，再读取 R1 的直接调用链。

先前探针只是控制流模拟；请用真实 runner、真实临时目录
batch store 和假 AI 调用建立回归，然后按证据最小修复。
若最新 master 已修复，验证后报告，无需重复修改。

授权本线程实施、定向测试、一次范围内审查、阻塞修复、
必要的有界复审、提交到独立分支、push、创建 PR，
以及查询并修复本分支相关 CI。不要修改其他分支。
不授权自动合并、真实账号登录、发文、图片上传、付费下单、
取消订单、生产迁移或删除，也不授权持续执行整个计划。

保持唯一 owner；不新增通用框架、第二状态源或重型门禁。
完成后交付修改与证据、实际测试结果、未运行项、
最终 SHA、PR/CI 状态和剩余风险，在 R1 边界停止。
不要承诺后台监控；CI 尚未结束时如实报告当前状态。
```

后续线程复用同一指令，替换为当前工作包编号，并带上前一包的最终合并 SHA 与交接。R5 仍不自动获得真实发文或生产操作授权。你确认合并时，也应明确“只合并当前 PR，并核验对应主线 CI”。

### 10.2 每包只需一份短交接

```text
工作包：R_    状态：PENDING / READY / RUNNING / PARTIAL /
                  BLOCKED / COMPLETE（选一个）
base SHA：    最终分支 SHA：    合并 SHA（尚未合并则注明）：
本次实际问题与证据：
修改文件、唯一 owner 与未触及边界：
实际测试命令、环境、结果与 CI 链接：
性能前后数据（适用时）：
审查与有界复审结论：
未运行的重要验收、原因与残余风险：
本包是否已合并并完成主线验证：
条件事项及触发依据（没有则写无）：
```

尚未合并、主线待验证或有必需验收未完成时，不标 COMPLETE。状态沿用仓库协议，不再创建另一套 READY_FOR_xxx 名称。没有代码修改的工作包，可在基线验证和结论明确后结项，并注明无需 PR。

<!-- pagebreak -->

## 11. 证据索引与执行记录

下列源码链接固定在编写时的参考提交；它们是定位入口，不是永远有效的状态说明。正式实施必须回到当前 HEAD 核对。文中没有链接的要求是本计划提出的执行建议，不代表已经实现或测量通过。

### 11.1 参考来源

- **[S01] 基线：** [编写时提交 4973be3b](https://github.com/jiayubing/autopublish/commit/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d)。编写时由 master 分支接口重新核验。
- **[S02] 历史优化与进度：** [旧优化计划](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/.scratch/generation-publication-optimization/GENERATION-PUBLICATION-OPTIMIZATION-PLAN.md)、[WORK-INDEX](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/docs/WORK-INDEX.md)、[已合并 PR #27](https://github.com/jiayubing/autopublish/pull/27)。PR #27 的 merged 元数据为 true；不要只读其旧正文判断是否已合并。
- **[S03] 规则：** [根 AGENTS](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/AGENTS.md)、[应用 AGENTS](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/auto%E2%80%94publish/AGENTS.md)、[执行协议](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/.scratch/article-lifecycle-and-submission/EXECUTION-PROTOCOL.md)、[审计协议](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/.scratch/article-lifecycle-and-submission/AUDIT-PROTOCOL.md)。
- **[S04] 并发生成控制流：** [generation-batch-runner.js](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/auto%E2%80%94publish/src/content/generation-batch-runner.js)、[generation-batch-store.js](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/auto%E2%80%94publish/src/content/generation-batch-store.js)。定位 runTask、finishStatus 与任务状态回写。
- **[S05] 生成事件与标题：** [content-generation-batch-service.js](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/auto%E2%80%94publish/desktop/services/content-generation-batch-service.js)。定位 enrichBatch、emit、safeEvent 与 runBatch。
- **[S06] 既有身份索引：** [content-store.js](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/auto%E2%80%94publish/src/content/content-store.js)。定位 getIdentityIndex 与 mutation session 中的索引维护。
- **[S07] 文章管理读取：** [article-management-snapshot.js](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/auto%E2%80%94publish/desktop/services/article-management-snapshot.js)。定位 get、safePublishedArchive、cache 与 invalidate。
- **[S08] 采集恢复能力：** [doubao-collection-queue.js](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/auto%E2%80%94publish/src/content/doubao-collection-queue.js)、[doubao-collection-service.js](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/auto%E2%80%94publish/src/content/doubao-collection-service.js)。定位内存 tasks、countdown 与 missing/recollect。
- **[S09] 验证入口：** [package.json](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/auto%E2%80%94publish/package.json)、[CI workflow](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/.github/workflows/ci.yml)。定位测试集合、类型检查、PR 与 push 任务差异。
- **[S10] 形状断言与串并行分类：** [architecture-seams.test.js](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/auto%E2%80%94publish/tests/architecture-seams.test.js)、[test-runner-policy.js](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/auto%E2%80%94publish/scripts/test-runner-policy.js)。定位方法集合验证、transition ports 与门面装配。
- **[S11] 内部能力清单：** [regular-platform-outcome-service.js](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/auto%E2%80%94publish/desktop/services/regular-platform-outcome-service.js)、[operational-store.js](https://github.com/jiayubing/autopublish/blob/4973be3bcfacc45f446c3c0c4dd1510ad77f9d7d/auto%E2%80%94publish/src/infrastructure/operational-store/operational-store.js)。定位方法集合验证、transition ports 与门面装配。

### 11.2 执行时追加，不在此复制长日志

| 工作包 | 结论/状态 | base → 最终 SHA | PR / 验证位置 | 待办 |
| --- | --- | --- | --- | --- |
| R1 | COMPLETE | 修复 `c448c32bd6b968d3f9c5b6a51f491d1857d6d48a`；合并 `9b8bdc70dbbd3a99d01f51c5efa1da9793ffdb88` | PR #31 已核验 merged 及包含关系；前序主线 CI/Windows Installer 成功由本次任务交接确认 | 不重新实施或扩大验收 |
| R2 | PARTIAL | base `9b8bdc70dbbd3a99d01f51c5efa1da9793ffdb88` → `perf/r2-generation-progress` | PR #32；测量与验证记录见 §11.3 | 尚未合并，不标 COMPLETE |
| R3 | PENDING | 未执行 | 未执行 | 读取热点验证 |
| R4 | PENDING | 未执行 | 未执行 | 候选与覆盖映射 |
| R5 | PENDING | 未执行 | 未执行 | 最终集成验证 |

重大新证据或范围调整，只追加日期、决定、理由和影响的工作包。已完成历史记录作为证据保留，不再充当另一套实时调度入口。

### 11.3 R2 执行记录 · 2026-09-06

**状态：PARTIAL（实现和对应 CI 通过；未合并，主线验证尚未发生）。** 本线程在 R2 停止；R3–R5、Q1–Q4 未执行。

- 实际 base：`9b8bdc70dbbd3a99d01f51c5efa1da9793ffdb88`。开工核验 PR #31 merged=true，master 为该合并提交，父提交包含 `c448c32bd6b968d3f9c5b6a51f491d1857d6d48a`。R1 只执行已有回归，不按本附件补开验收。
- 独立分支：`perf/r2-generation-progress`；[PR #32](https://github.com/jiayubing/autopublish/pull/32)。基线测量提交 `4dbf71db3ff5b519b54d90738757283fb533fdca` 没有生产代码改动；实现及全部直接回归提交 `ea7ee08a01f562314ebd7d453483600f2dd042c9`。后续收口提交只加入本计划和 WORK-INDEX 导航，最终 HEAD 以 PR 元数据为准，不用本文件自引用 SHA。
- GitHub 连接器读取、独立分支 Git Data 提交与非强制 fast-forward；本地网络无法完整 clone，因此没有声称存在完整本地 Git worktree/暂存区或完成全仓本地测试。未覆盖用户改动，未修改其他分支。

#### 确认的问题和改动

真实调用链为 Runner 事件 → batch service `emit` → `safeEvent` → 生成 IPC 安全投影 → feature。原 `enrichBatch` 在每个完成事件查询所有成功文章，ArticleStore 每次读取 JSON 和 Markdown；`emit` 在 enrichBatch 之后又由 safeEvent 克隆批次，终止处理还 enrich 了不会被展示的内部返回值。原版 100 任务、并发 2 的实际标题查询为 5400 次，文章文件读取为 10800 次，不是旧 C 身份索引的问题。

唯一生产文件：`auto—publish/desktop/services/content-generation-batch-service.js`。事件在 safeEvent 已拥有的副本上投影标题，保留各订阅者独立副本；内部已丢弃的终止结果不再 enrich。完整任务快照、所有通知、IPC 白名单、runtimeId/sequence 均保留，Renderer 无需每事件补查询。Runner、BatchStore、ContentStore/旧 C 身份索引和恢复关键写入均未修改。

缓存仅属于当前 service/工作区的一次活动批次，键为 `[clientId, articleId]`，值仅为已净化标题或 null。容量受当前合法批次任务数约束（当前上限 1000），无跨批次常驻缓存。完成、失败、暂停退出、启动异常、dispose 时清理；下一次运行重新建立。`getBatch`、`listBatches`、`getRuntimeSnapshot` 每次均重读标题，并更新运行内缓存。因此主动刷新能看到合法标题修改；空标题/读取失败只省略可选标题，不改变成功事实，主动刷新会重试。

新增测试仅两个文件：`content-generation-batch-title-cache.test.js`、`generation-progress-cost.test.js`。前者控制事件与运行边界，后者使用真实临时存储、真实服务/Runner/IPC，并用 Promise 屏障验证运行中合法 saveArticle 编辑、刷新、终态和服务重建。没有新增生产埋点、框架、CI 配置或依赖。

#### 可复现测量和口径

基线：[CI 34034565237 / desktop job 101490167684](https://github.com/jiayubing/autopublish/actions/runs/34034565237/job/101490167684)。修改后：[CI 34035608857 / desktop job 101492994825](https://github.com/jiayubing/autopublish/actions/runs/34035608857/job/101492994825)。两边均 Node v24.19.0、Windows x64，相同合法合成客户/模板/正文，10/100 任务 × 并发 1/2，各三次。实际使用 CI 的 `npm run test:desktop-core` 执行并输出 `GENERATION_PROGRESS_COST`；单独复现入口是 `node --test tests/generation-progress-cost.test.js`，不将此入口表述为另一次实际执行。

每次重复新建临时工作区。真实 service、Runner、ArticleStore、ContentStore、batch file store、IPC 均参与；AI 和输入资料为合成可控替身，不访问真实模型或账号。运行阶段不轮询公开读取接口。读取计数是实际文件 API 调用，不是操作系统物理磁盘未命中次数；批次写入包括事务临时文件写入；字节量为真实 IPC 投影的 UTF-8 JSON 表示，不是 Electron 原生线缆流量。batchSerializations 计数包含运行中整批对象及持有 batch 的对象的 JSON.stringify，测量输出自身的编码不计入。

| 任务 / 并发 | 标题查询 前→后 | 文章文件读取 前→后 | 整批序列化 前→后 | 事件数（前后相同） | 事件总字节（前后相同） | 批次文件读 / 写（前后相同） |
| --- | --- | --- | --- | --- | --- | --- |
| 10 / 1 | 85→10 | 170→20 | 152→137 | 14 | 54091 | 44 / 40 |
| 10 / 2 | 90→10 | 180→20 | 152→137 | 14 | 54426 | 44 / 40 |
| 100 / 1 | 5350→100 | 10700→200 | 1322→1217 | 104 | 3335895 | 404 / 400 |
| 100 / 2 | 5400→100 | 10800→200 | 1322→1217 | 104 | 3339202 | 404 / 400 |

以上调用计数及事件字节量在各组三次中一致；AI 调用前后均为 N。标题未变化且没有主动刷新的运行累计查询现在恰为 N，而非完成事件反复重读历史成功文章。

运行耗时（毫秒；中位数 [最小, 最大]）：

| 任务 / 并发 | 基线 | 修改后 |
| --- | --- | --- |
| 10 / 1 | 1315.90 [1142.66, 1361.02] | 551.78 [418.24, 574.19] |
| 10 / 2 | 1185.51 [1171.60, 1229.17] | 503.19 [479.07, 558.40] |
| 100 / 1 | 34548.97 [27091.69, 51895.59] | 5000.46 [4729.91, 5627.07] |
| 100 / 2 | 27310.27 [27286.30, 29757.35] | 5552.94 [5539.56, 5727.99] |

首次加载与热读取分开测量：新建 pending 批次首次加载，前后均标题/文章读取 0、批次读取 1、写入/事件 0、整批序列化 2。完成后主动刷新、服务重建后首次读取、随后重复读取，三种阶段前后均标题 N / 文章文件 2N / 批次读取 1 / 写入与事件 0 / 整批序列化 2。快照字节也未变：10 任务首次/完成刷新/重建读取为 4340/5105/5005；100 任务为 36562/43271/43167。服务重建不等于清空操作系统缓存。

这些读取阶段没有优化，并不能宣称所有耗时都下降。各组三次的读取耗时中位数（毫秒，前→后；完整范围保留在以上 CI 日志）：

| 任务 / 并发 | pending 首次加载 | 完成主动刷新 | 重建首次读取 | 随后重复读取 |
| --- | --- | --- | --- | --- |
| 10 / 1 | 9.97→2.37 | 16.81→98.45 | 16.84→89.09 | 14.83→82.56 |
| 10 / 2 | 10.12→1.99 | 17.49→88.61 | 18.39→105.94 | 15.32→92.77 |
| 100 / 1 | 137.76→3.42 | 202.60→834.73 | 187.41→852.20 | 170.02→823.54 |
| 100 / 2 | 98.54→3.41 | 178.21→927.94 | 180.59→929.92 | 172.54→937.71 |

前后是相同 CI 环境类别，不是同一台物理机器，操作系统缓存与同时运行测试的负载未固定。尤其刷新阶段计数不变但耗时上升，因此时间只作为这些运行的观测，不将倍数全归因于代码；线性标题查询和相应文件读取减少由确定性计数证明。1000 任务、Main 阻塞和内存未测，不新增硬门槛。

#### 实际验证、审查和停止点

实现提交 ea7ee08 的 CI 34035608857 已 completed/success。`required/desktop-node24` 的 root-tests、migration-roundtrip、toolchain、packaging-contracts 成功；Auth、Auth verification、desktop security、link security jobs 成功。production-directory-smoke 在这次运行为 skipped；desktop-capacity、desktop-artifact、Auth container、dependency-audit、release-evidence 亦为 skipped，不算通过，不用基线成功替代修改后证据。未另行触发安装包。

现有 `generation-batch-runner` 的 persisted generation configuration recovery 三条均通过：并发 abort 后保留配置暂停/第三任务不领取；服务显式继续、配置确认且成功或已落盘文章不重生成；迟到结果及重启恢复保留配置原因。`content-generation-batch-service`、`generation-batch-store`、标题投影、snapshot event、旧 read-amplification、IPC 及 generation feature/导航回归均在 root-tests 中实际执行。新增缓存隔离、主动刷新、负缓存重试、合法标题 save/restart 与四组性能计数全部通过。具体 test:desktop-core 汇总为 1832 pass / 0 fail；独立 packaging-contracts 49 pass / 0 fail，不混计其他 job 的测试数。

本地仅进行了三个变更 JS 文件的 `node --check`，以及隔离加载真实 service 的投影测试（旧代码失败、新代码通过）；完整恢复和文件 I/O 结论来自 Windows CI，不用本地替身测试冒充完整生产调用链。

一次范围内审查已完成：只改唯一生成 service owner；缓存不变成状态真源；复制隔离、可选标题清理、启动/终止释放、主动查询同 sequence 可被 feature 接受、R1 路径均核对。未发现阻塞性直接回归。收口文档提交后的 CI 需以该最终 SHA 的 PR checks 为准，不能借实现提交绿灯声称未结束的最终 checks 已通过。

**剩余边界：** 完整事件仍遍历/序列化全批次，批次事务读写和公开刷新仍未优化；这不影响本次线性标题读取目标，不据此擅自启动 Q4。无真实平台/付费模型/人工桌面验收、无 1000 任务容量结论；R2 未合并，不宣称主线或新安装包验证完成。

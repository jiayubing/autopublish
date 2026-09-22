# AutoPublish GEO 内容生产闭环实施方案 v1.4

**状态**：IN PROGRESS / CP-0 Closure；CP-1 待开始

**产品依据**：`AutoPublish-GEO-Content-Production-Product-Design-v1.0.md`

**计划基线**：`codex/geo-knowledge-base` @ `10bdf284ee7f47bffb292c028c75b5e3e7a6eff1`

**制定日期**：2026-09-21

**执行方式**：串行工作包；每包 Implementation → Primary Review → Blocking Remediation → Bounded Re-review → Closure

---

## 1. 审阅结论

产品设计可以进入实施，没有必须退回用户重新决策的产品冲突。

实施前需要把以下关键边界写成明确合同，否则容易在开发中形成第二 owner、丢失文章质量，或只完成页面表象：

1. **GEO Question 身份必须唯一**：`geo-knowledge-store` 中的 `geoQuestions[]` 拥有“内容生产问题资产”身份；现有采集问题 owner 只拥有采集执行身份和启停状态。两者通过 `questionId` 关联，不互相复制事实或反向改写。
2. **Research 身份以 Collection Question 为键**：GEO Question 的 `geoQuestionId` 是知识库问题资产身份；`collectionQuestionId` 才是采集执行身份，也是现有 `research-store` 记录 ID。Article Brief 必须校验 `targetQuestion.collectionQuestionId === research.id`、client 一致且规范化问题文本一致，不能把 `geoQuestionId` 与 Research ID 混用。
3. **新生成任务必须从“客户 × 模板”改为“问题 × 模板”**：每个新任务只绑定一个 GEO Question、一个匹配的 Research 和一个 Article Brief。旧批次只能按版本化历史合同读取/收尾，不能继续创建同客户多回答混合输入的新任务。
4. **Article Brief 不是新 store**：继续由 `geo-generation-context` 实时派生；文章成功时把实际输入固化到现有 Article source snapshot 体系，批次和 UI 不成为事实 owner。
5. **Research 洞察必须保守派生，但不能因此丢失现有写作能力**：第一版不新增隐藏的 AI 分析请求。`clientMentioned`、`mentionedEntities` 等只做可验证的字面/关系投影；`decisionDimensions`、`answerGaps` 无可靠结构化结果时允许为空。若 `decisionDimensions` 为空，文章 Prompt 仍可读取 `currentResearch.answer` 并在本次写作内部观察当前回答采用的判断维度，但该判断不得持久化、不得回写 Research/Knowledge。
6. **Confirmation 只负责重组，不负责“凭空变丰富”**：客户确认稿必须比当前 section 直出更适合阅读和确认，但不得调用 AI、联网或补造客户事实。若真实客户 Knowledge 本身过薄，应回到 Knowledge research/synthesis 补足，而不是在 Confirmation 层扩写。
7. **AI 请求结果不确定必须进入持久状态**：Generation v2 不能把“请求可能已被 provider 接收但本地无法确认结果”折叠为普通 `failed/interrupted`。task 必须有 terminal `uncertain` 状态；uncertain 不进入 resume/retry。只有发现同 `generationTaskId` 的本地 Article 时可确定性恢复为 `succeeded`；否则用户显式选择重新生成时，必须经过新预检并创建新 batch/task，原 uncertain task 保留不改写。
8. **批次创建必须幂等**：v2 create command 必填调用方生成的 `requestId`。batch 持久化 `requestId + requestFingerprint`；同 requestId、同 canonical create input 返回原批次，同 requestId、不同输入返回稳定 conflict。create 重放只返回已存在 batch，绝不能再次启动 AI。
9. **Research 完整性使用内容 fingerprint，不使用时间戳充当证明**：Research 时间字段只适合作为展示信息，不能证明回答未变化。question source 必须保存 `researchFingerprint`；执行前重新读取 Research 并按同一 canonical 规则计算比较。Knowledge 继续使用 revision，不引入细粒度 Knowledge hash。
10. **`requestFingerprint` 必须包含客户身份**：GEO Question ID 不是跨客户全局唯一。canonical create selection 必须使用稳定排序的 `(clientId, geoQuestionId)`，不能只 hash `geoQuestionId`；模板选择继续使用 `(platform, templateId)`。
11. **create 幂等必须由 batch store 原子拥有**：禁止 application/service 采用“先查 requestId，不存在再写”的 check-then-write。Generation batch store 必须提供单一 `createOrGetV2()` 原子入口；可采用 requestId 派生确定性 batchId + exclusive reservation/create，或等价机制，但必须保证并发双击只能产生一个 batch。整个 create → start → task execution 生命周期共覆盖四个 crash windows：前两个 create / persist 窗口由 `createOrGetV2` owner 负责，后两个 start / task execution 窗口由 start / task execution owner 负责；不得把全部四个窗口归给 `createOrGetV2`。
12. **v2 重启恢复不得把已发送请求降级为可恢复 `interrupted`**：启动时遗留 `running` task 必须先做 Article identity recovery；唯一找到 Article 则 `succeeded`，找不到 Article 则保守转为 terminal `uncertain`，多个 Article 则记录 identity conflict 并保持不可重试。v2 `running` 不得直接进入 resumable `interrupted`。
13. **历史 v1 不能继续执行不安全自动重试；GEO Knowledge V1 不迁移**：CP-0 先盘点真实 v1 generation batch。若没有非终态 v1 batch，删除/关闭 v1 AI 执行路径，仅保留历史 reader；若存在，先做本地 Article identity recovery，未确定任务不得再次调用 AI，只允许用户明确结束旧批次并重新建立 v2。用户已在本轮产品决策中明确要求 GEO Knowledge V1 不保留、不迁移并退出兼容；该决定只覆盖 GEO Knowledge V1，不覆盖历史 Article、发布记录或 generation batch 证据。现行 V2 Knowledge 合同保留原历史记录，并已追加由本计划 supersede 的说明。V2 完成切换后，必须删除 V1 Knowledge reader、migration/compat 分支，以及位于既有 path owner 管辖路径下、成功解析并明确满足 `schemaVersion === 1` 的 legacy 文件。JSON 损坏、无法解析、schemaVersion 缺失/未知/大于 1 或文件来源/owner 不明确时禁止猜测删除，必须显式报错或进入已有异常处理路径；本计划文本不扩大为其他数据的删除授权。
14. **create 与 start 必须形成可恢复闭环**：v2 的原子 create 只负责得到唯一持久 pending batch；另设显式、幂等 `startBatchV2` 命令/IPC。正常 UI 可以保持“一次点击生成”，但内部必须按 create → start 两个命令执行。若在 batch 持久化后、start 前崩溃，恢复后用户可以从 pending batch 显式开始，或同一次 UI 意图重放到显式 start；pending batch 不得成为永久孤儿。

以上是对现有实现边界的收口，不改变产品文档的核心链路和阶段顺序。

---

## 2. 当前事实与主要差距

### 2.1 已有能力

- `geo-knowledge-store` 已是 Customer Knowledge 的唯一 writer，具备 schema v2、revision、原子写入、人工锁定、来源确认和冲突裁决。
- `geoQuestions[]` 已能关联现有采集问题；问题文本变化或采集问题删除时会得到 `stale`，旧回答不会冒充当前回答。
- `research-store` 已保存一次真实采集的 `question / answerText / references / collectedAt`。
- `geo-generation-context` 已能按问题关系选择相关知识、全部 restrictions、有限竞对与来源，并保存不可变 `knowledgeSnapshot`。
- 文章已保存 Research、模板、客户资料和知识输入快照；文章摘要已投影 `geoQuestionIds`。
- GEO 知识页面已有“客户知识 / GEO 问题 / 来源 / 待确认”以及 Markdown 导出。

### 2.2 必须闭合的差距

| 产品目标 | 当前实现 | 实施要求 |
| --- | --- | --- |
| 客户确认稿 | 当前 Markdown 是 section 直出 | 建立唯一 Confirmation Model，页面预览与 Markdown 共用 |
| 问题成为工作单元 | 当前仅逐项查看关联，生成入口仍以客户为单位 | 建立批量 Question Workflow read model 与问题驱动入口 |
| 每篇一个 Brief | 当前一次文章可混入 1–50 条 Research | 新任务强制一个 question / research / brief |
| 问题 × 模板 | 当前批次是客户 × 模板 | generation batch schema v2 与 task identity 改造 |
| AI uncertain | 当前 timeout/network/5xx 等可进入自动 retry 或普通 failed/interrupted | v2 task 增加 terminal `uncertain`，禁止自动 retry/resume；重新生成创建新 task |
| create 幂等 | 当前普通批次随机生成 batch ID | create command 增加 `requestId` 与 canonical `requestFingerprint`；batch store 原子 `createOrGetV2` |
| create 跨客户身份 | GEO Question ID 不含 clientId | fingerprint 使用稳定排序 `(clientId, geoQuestionId)` |
| restart recovery | 当前遗留 running 会转 interrupted 并可 resume | v2 先 Article identity recovery；无 Article → uncertain，不进入 interrupted |
| create/start 崩溃窗口 | 当前 IPC 只有 create-and-start，持久 pending 后缺少独立启动闭环 | 新增显式幂等 `startBatchV2` + IPC/UI capability；create 和 start 分离但 UI 可一键编排 |
| legacy v1 执行 | 当前 v1 runner 仍可能自动 retry timeout/network/5xx | CP-0 盘点并关闭旧 AI 执行；未确定任务只允许结束旧批次并重建 v2 |
| GEO Knowledge V1 | 历史兼容不再有产品价值 | V2 完成切换后必须删除确认满足 `schemaVersion === 1` 的 legacy 文件并退出 V1 兼容 |
| Research stale 证明 | 当前可见 `updatedAt` 不是内容完整性证明 | question source 保存并复核 `researchFingerprint` |
| Prompt 只负责写作 | 当前仍发送完整客户资料，并让模型处理多条回答 | 新路径只发送 Article Brief + template + 写作约束 |
| 历史快照不变 | 已有 v1 snapshot | 增加 v2 validator；旧文章和旧批次保持可读 |
| 来源页说明“支持哪些知识” | 当前主要展示来源本身 | 从现有 `sourceIds` 反向派生支持项，不新增索引 owner |

### 2.3 与现行长期文档的同步点

`CONTEXT.md` 仍把生成定义为“客户资料 + 多条调研回答”和“客户 × 模板”。实施工作包 CP-0 必须先更新以下术语：

- 知识库 GEO 问题；
- 生成来源集；
- 可生成问题；
- 生成任务；
- 文章来源快照；
- 生成批次。

`ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md` 中内容失败重新生成仍按客户 × 模板计数。CP-0 必须把它改为问题 × 模板，并规定旧文章无法唯一映射问题时必须由用户显式选择问题，不能猜测或继续混合多条回答。

计划索引同步规则：规范命名的 `AutoPublish-GEO-Content-Production-Implementation-Plan-v1.4.md` 已登记到 `docs/WORK-INDEX.md`，并作为本任务唯一 `READY` 入口。若仓库中已经存在 v1.0/v1.1/v1.2/v1.3 实施计划，则标记 `SUPERSEDED by v1.4` 并从 READY/当前入口移除。若旧版本从未进入仓库，则不要为了归档先新增旧版本；本地下载产生的 `(1)` 等重复文件名不得进入仓库。

---

## 3. 目标 owner 与数据流

```text
Customer materials / public research
                ↓
      Customer Knowledge (canonical)
          ├──────────────→ Confirmation Model (derived)
          │                         ↓
          │                preview / Markdown export
          │
          ↓
    GEO Question asset (canonical for question identity)
          ↓ link
    Collection Question (collection execution owner)
          ↓
    GEO Research (canonical for captured answer)
          ↓
    Article Brief (derived, no store)
          ↓
    Generation Task (question × template)
          ↓
    Article source snapshot (canonical historical input)
          ↓
    Article / publication flow
```

| 对象 | 唯一 owner | 写入规则 |
| --- | --- | --- |
| Customer Knowledge | `geo-knowledge-store` | 只有现有 store command 可写 |
| Confirmation Model | `geo-confirmation-model` 纯派生模块 | 不持久化，不接受反向写入 |
| GEO Question asset | Knowledge `geoQuestions[]` | 研究 merge / 人工编辑经 knowledge revision 写入 |
| Collection Question | 现有 question service | 只拥有采集文本、启停和采集执行身份 |
| GEO Research | `research-store` | 成功采集或人工录入写入；失败不覆盖旧成功回答 |
| Question Workflow | application query/read model | 只聚合，不持久化 |
| Article Brief | `geo-generation-context` | 每次预检/执行派生，不建立 store |
| Generation Batch / Task | `generation-batch-store` | schema v2，任务只引用一个问题来源 |
| Article input history | Article JSON | 成功生成时一次固化，后续知识变化不改写 |

禁止新增 Confirmation store、Article Brief store、第二个 Research store、Renderer 业务 store 或由文章反向写 Knowledge 的路径。

---

## 4. 公开合同

### 4.1 Confirmation Model v1

`buildCustomerConfirmationModel(knowledge)` 是纯函数。页面预览和 Markdown exporter 必须消费同一个返回值。

```text
version: 1
clientId
knowledgeRevision
generatedAt
sections[]:
  id
  title
  entries[]:
    kind: fact | research | derived | gap | caution
    title
    body
    sourceIds[]
    attributionRequired
    relatedKnowledgeIds[]
confirmationRequests[]:
  topic
  reason
  relatedKnowledgeIds[]
```

固定 15 个 section 与产品设计一致。规则：

- `fact/research` 只能来自当前 Knowledge 中允许展示的 claim/item；
- `derived` 只允许来自 `recommendationAngles` 或明确标记的场景推导，并显示“推荐角度/场景分析”；
- 15 个 section 是逻辑结构，不要求导出时把 15 个空标题全部展示。无内容章节可以在 model 中产生 `gap` 供页面提示，但 Markdown 默认隐藏空章节，并把重要资料缺口集中汇总到最后的“请客户确认 / 补充”区域，避免生成一份充满重复“资料不足”的模板报告；
- conflict、candidate、forbidden、internal-only 和强声明进入 caution/confirmation request，不作为正向事实；
- 每个正向 entry 保存对应 `sourceIds/relatedKnowledgeIds`，支持 UI 回看来源；
- 模型不得调用 AI、联网、补齐资料或写回 Knowledge；
- Markdown 只负责渲染 model，不另写一套 section 选择逻辑。

### 4.2 Question Workflow read model

新增一次性批量 query，替代页面对每行分别读取回答和文章计数：

```text
clientId
knowledgeRevision
items[]:
  geoQuestionId
  text
  intent
  relatedOfferingIds[]
  relatedScenarioIds[]
  knowledgeCoverage: enough | partial | insufficient
  linkStatus: unlinked | linked | stale
  collectionQuestionId?
  collectionEnabled?
  latestResearch:
    status: missing | available | stale
    capturedAt?
  generatedArticleCount
  publishedArticleCount
  generationReadiness:
    ready: boolean
    codes[]
```

聚合规则：

- Knowledge 提供问题身份、intent、relation 和 coverage；
- question service 提供采集身份与 enabled；
- Research metadata 提供最近采集时间，正文只在打开详情或真正进入生成预检时读取；列表批量 query 不为了 `clientMentioned` 逐条读取 Research 正文；
- Article summaries 提供文章数量和发布数量，不读取文章正文；
- `clientMentioned` 属于详情级派生字段：打开问题详情时，再用 accepted 客户名与 aliases 对当前 Research 正文做规范化字面匹配；没有可靠名称时为 `null`。第一版不为该标签新增持久索引或 cache；
- stale link/research 不得标记为 ready；
- `knowledgeCoverage` 是可解释提示，不单独充当生成授权；列表中的 `generationReadiness` 只是“能否进入生成预检”的轻量 precheck。最终是否可生成必须在 preview/create 时读取当前 Research 并成功构造 Article Brief 后决定；列表层不批量构造 500 个 Brief；
- collection question 的 `enabled` 只控制是否可进入采集。已有当前匹配 Research 时，停用不应反向禁止文章生成；
- query 不写入、不自动创建采集问题、不启动浏览器、不调用 AI。

页面动作：

- `加入问题采集`：复用现有幂等 link command，不联网；
- `采集 / 重新采集`：导航到现有问题采集用例并预选对应 collection question；真正启动仍使用既有显式确认；
- `生成文章`：打开问题驱动生成向导，预选当前 GEO Question；
- 批量生成只允许选择 `generationReadiness.ready=true` 的问题进入生成预检，其他问题显示稳定原因码；进入预检后仍必须经过 Article Brief 的最终一致性/内容校验。

### 4.3 Article Brief v2

`geo-generation-context` 接收且只接收一个有效 GEO Question 与一个匹配 Research，返回结构化对象；不再以 JSON 字符串作为核心合同。

```text
version: 2
clientId
knowledgeRevision
targetQuestion:
  geoQuestionId
  collectionQuestionId
  text
  intent
client:
  primaryName
  aliases[]
  location?
selectedKnowledge:
  profileFacts[]
  offerings[]
  capabilities[]
  scenarios[]
  cases[]
  recommendationAngles[]
  onlinePresence[]
  history[]
competitors[]
restrictions[]
evidence:
  sources[]
  attributionRequiredIds[]
currentResearch:
  question
  answer
  references[]
  capturedAt
  clientMentioned
  mentionedEntities[]
  decisionDimensions[]
  answerGaps[]
```

选择规则沿用现有 v2 知识合同，并新增：

- 只允许 `targetQuestion.collectionQuestionId === research.id`、Research `clientId === Article Brief.clientId`，且 `targetQuestion.text / collection question / research.question` 规范化文本一致；`geoQuestionId` 只用于标识 Knowledge 中的 GEO Question 资产，不与 Research ID 比较；
- 只选择与当前问题 relation 匹配的客户知识；profile 和 restrictions 继续遵守现有全局规则；
- `mentionedEntities` 只来自客户 aliases、已知 competitors 与 reference titles 的确定字面匹配；
- `decisionDimensions` 只接收可从回答明确标题/枚举结构中确定性提取的文本，不做语义猜测；第一版它是 optional enhancement，不是文章生成前置门槛；
- `answerGaps` 只记录“与本问题相关但回答中未出现”的现有知识项身份，不生成新事实；第一版同样允许为空；
- 派生信号不可靠时返回空数组；空数组不是“没有该维度”的事实。若 `decisionDimensions` 为空，文章 Prompt 可以临时阅读 `currentResearch.answer` 并理解当前回答的选择逻辑，但该临时语义判断只服务本次写作，不写回 Brief snapshot 中的结构化 Research facts；
- 最终序列化上限继续为 100000 字符，restrictions 不得静默截断；
- 选择失败、过大或 stale 时生成任务明确失败，不回退到整库或完整客户资料。

### 4.4 Generation Batch v2

新批次持久合同：

```text
version: 2
requestId
requestFingerprint
startState: not_started | starting | started
startRequestedAt?
questionSources[]:
  id
  clientId
  geoQuestionId
  collectionQuestionId
  questionText
  knowledgeRevision
  researchCapturedAt
  researchFingerprint
templates[]
tasks[]:
  id
  questionSourceId
  platform
  templateId
  status: pending | running | succeeded | failed | uncertain | interrupted | cancelled
  attempts / error / articleId / timestamps
```

规则：

- 一个 `questionSource` 对应一个客户的一个问题；不得重复；
- create command 必填调用方生成的 `requestId`；服务端对“用户本次创建意图”计算 canonical `requestFingerprint`。问题选择必须规范化为稳定排序的 `(clientId, geoQuestionId)`，模板选择规范化为稳定排序的 `(platform, templateId)`，再加并发等显式 create 输入；fingerprint 不重新读取当前 Knowledge/Research，避免一次成功持久化后的响应丢失重放因为外部状态变化而无法找回原批次；
- 幂等检查与首次持久化由 generation batch store 的单一 `createOrGetV2()` 原子拥有，service/application 不得“先 list/find requestId，再另行 create”。推荐实现为由 requestId 派生确定性 batchId，并使用 exclusive reservation/create 或等价原子机制：同 requestId + 同 fingerprint 返回原 batch；同 requestId + 不同 fingerprint 返回 `GENERATION_REQUEST_CONFLICT`。并发双击不得创建两个 batch；create 重放本身不得调用 AI、不得创建第二套 task；
- 新增显式幂等 `startBatchV2({ batchId })`。只有 start 命令可以从 `not_started/pending` 进入执行；重复 start 对同一 batch 只能继续/返回当前持久状态，不能重复 claim 同一 task 或产生第二次 AI 调用。Renderer 可以继续提供一个“一键生成”按钮，但必须由 application 层顺序执行 `createOrGetV2` → `startBatchV2`，而不是把 create 与远端 AI 调用绑成一个不可恢复原子动作；
- 任务数 = 可生成问题数 × 模板数；task identity 必须包含 batch、question source、platform、template；
- task 不重复持久化 `clientId / geoQuestionId / researchQueryId`；这些身份由同一 batch 内的 `questionSourceId` 唯一解引用。一个 `questionSource` 必须且只能指向一个 `collectionQuestionId` / Research；
- question source 保存 `knowledgeRevision`、仅供展示的 `researchCapturedAt` 和完整性证明 `researchFingerprint`。执行前再次读取 Knowledge/Research：Knowledge revision 不一致或 Research fingerprint 不一致均返回 `GENERATION_SOURCE_STALE`，不静默换用新事实。第一版 deliberately 采用 client Knowledge revision 的保守失效策略：同一客户任何 Knowledge revision 变化都会使该客户旧 question source stale，即使改动发生在无关业务；先保持简单和安全，只有真实使用证明 stale 过于频繁时再引入更细粒度 Knowledge fingerprint；
- `researchFingerprint` 采用版本化 canonical 规则计算 SHA-256，至少覆盖 `research.id`、`clientId`、规范化 question、规范化换行后的 `answerText`、规范化 references（title/url/snippet）和 `collectedAt`；`updatedAt` 不参与完整性判断。references canonicalization 必须确定性（规范化 URL，按稳定键排序），JSON 格式或文件字段顺序变化不得导致 fingerprint 变化；
- stale 任务可在新预检后创建新批次，不原地改写已持久化 task source；
- `failed` 只表示可确定失败；用户可显式 retry，并继续使用同一 question source；
- `uncertain` 表示 AI 请求可能已被 provider 接收或执行，但本地无法确认是否产生结果。v2 runner 对 uncertain 不自动 retry，`RESUMABLE_STATUSES`/retry selection 不得包含 uncertain；generic timeout/network/5xx 不得仅凭“retryable”自动重发。只有 transport 明确证明请求尚未发出或明确返回“未接受请求”的安全失败，才允许走可重试路径；
- uncertain task 的人工动作只有两类：① 如果 identity recovery 找到同 `generationTaskId` 已落地的 Article，可将原 task 确定性标记为 `succeeded`；② 否则用户显式点击重新生成，重新执行 preview/stale 校验并以新的 `requestId` 创建新 batch/task。原 uncertain task 保留为历史证据，不改写为 failed/cancelled，不在原 task 上重发 AI；
- batch 聚合状态增加 `uncertain`：当没有 running/pending、且至少一个 task 为 uncertain 时 batch 为 uncertain；counts 增加 uncertain。`canResume/canRetry` 不因 uncertain 为 true，但 UI 可提供“检查结果/重新生成”人工动作；
- pause/cancel 的业务语义沿用现有批次 owner；restart/recovery 对 v2 单独收紧：启动时不得把遗留 `running` 自动转换为 resumable `interrupted`。必须先按 `generationTaskId` 做 Article identity recovery：唯一 Article → `succeeded`；无 Article → `uncertain`；多个 Article → identity conflict + terminal uncertain/blocked，均不得自动再次调用 AI。`interrupted` 仅用于能够确定 AI 尚未进入不确定远端执行阶段的本地中断。
- v1 批次停止创建且停止新的 AI 执行。CP-0 必须先盘点真实 v1 非终态批次：若不存在，直接删除/关闭 v1 runner 的公开执行路径，只保留历史 reader；若存在，先做本地 Article identity recovery，已找到 Article 的任务收敛为成功，其余任务冻结为 legacy unresolved，不得自动 retry/resume。用户只能明确结束旧批次，再从对应 GEO Question 重新建立 v2 batch；不得为了延续 v1 再实现一套 uncertain migration。

### 4.4.1 v2 create 幂等、Research fingerprint 与 uncertain 语义

#### Create idempotency

`requestId` 由 Renderer/application caller 在一次“创建批次”用户意图开始时生成，并在因 IPC/进程/响应不确定而重放 create 时保持不变。新的用户操作必须生成新的 requestId。

canonical create input 至少包含：

```text
selectedQuestions:
  - clientId
    geoQuestionId
  # 对 (clientId, geoQuestionId) 去重并稳定排序

selectedTemplates:
  - platform
    templateId
  # 对 (platform, templateId) 去重并稳定排序

concurrency
```

`geoQuestionId` 不是跨客户全局唯一，因此 fingerprint 禁止只使用问题 ID。`collectionQuestionId`、Knowledge revision、Research fingerprint、AI config fingerprint 不进入 create intent fingerprint；它们属于 preview 后固化到 batch/questionSource 的 source snapshot / execution guard。这样即使第一次 create 已持久化但响应丢失，之后 Knowledge/Research/AI 配置发生变化，同一 requestId 的重放仍能找回原 batch，而不是偷偷创建新的 batch。

原子 create / 显式 start 合同：

- `createOrGetV2(requestId, requestFingerprint, createPayload)` 是 batch store 唯一首次创建入口；
- requestId 派生稳定 batchId，或使用等价的 store-level 唯一键；唯一性不能依赖 service 层先查后写；
- 首次占位/持久化必须使用 exclusive create/reservation；并发 loser 读取 winner 的 batch/reservation 并比较 fingerprint；
- 若进程在 reservation 后、batch 完成前崩溃，下一次同 requestId 可继续完成同一 batchId 的创建，不得创建新 batchId；
- create 成功后的 canonical batch 初始为 `pending / startState=not_started`；
- `startBatchV2({batchId})` 是独立公开命令，并具备幂等语义。它在首次真正执行前持久化 `startState=starting` / `startRequestedAt`，随后才允许 worker claim task；达到可执行 runtime 后持久化 `startState=started`；
- 重复 start 若发现 batch 已 `starting/started/running/terminal`，按当前持久状态恢复/返回，不重复 claim 已 running/succeeded/uncertain task；
- UI 的“一键生成”只是 `createOrGetV2` 后紧接一次显式 `startBatchV2` 的编排；create replay 本身不隐式启动。

#### Research fingerprint

新增单一 helper，例如 `fingerprintResearch(research)`，由 preview 和 runner 复用；不得在两个模块各写一套 hash 规则。fingerprint version 必须显式进入 hash 输入，未来规则变化时通过版本升级处理旧 batch。

`researchCapturedAt` 仅用于 UI/快照展示；stale 判定只看 `researchFingerprint`（Research）和 `knowledgeRevision`（Knowledge）。

#### Create / run 崩溃窗口

必须用测试固定以下四个窗口：

1. **持久化前崩溃**：没有 canonical batch；同 requestId 重放可以创建唯一 batch。
2. **batch 已持久化、尚未 start 时崩溃**：同 requestId 重放只返回同一 pending batch；恢复后的 UI 必须显示 `canStart=true`，用户可调用显式 `startBatchV2` 最终继续执行，不产生第二 batch。
3. **start 意图已持久化、尚未 claim task 时崩溃**：重启后依据 `startState=starting` 恢复；重复 `startBatchV2` 幂等，只 claim 仍为 pending 的 task，不重复调用已经 claim 的 task。
4. **task 已进入 AI 执行、响应返回前或本地持久化确认前崩溃**：重启后该 v2 `running` task 先做 Article identity recovery。找到唯一 Article则 succeeded；找不到则 uncertain；绝不恢复为可重试 interrupted，也不因为 create/start 重放再发一次 AI。

#### AI uncertain classification

v2 生成只接受三类执行结果：

```text
success
definite_failure
uncertain
```

- `success`：Article 已成功本地持久化并能按 generationTaskId 唯一找回；
- `definite_failure`：能够确认未产生远端生成结果或请求被明确拒绝，可进入 failed；
- `uncertain`：请求可能已经发出/被 provider 接受，但 timeout、连接中断、5xx 后无法确认是否完成，或本地在 AI 返回后到 Article 持久化确认前发生不确定中断。

v2 runner 不再用“网络错误默认 retry”推断安全性。transport/provider adapter 应尽量给出明确 disposition；没有明确安全证据时 fail closed 为 uncertain。

uncertain 不是文章内容审核“需处理”，也不是发布中心的 uncertain；它只属于 Generation Batch task 的执行结果状态。

### 4.4.2 Legacy V1 清理边界

这里区分两类完全不同的 “v1”：

- **GEO Knowledge V1**：本轮产品决策为“不迁移、必须删除并退出兼容”。`AUTOPUBLISH-GEO-KNOWLEDGE-V2-INCREMENTAL-CONTRACT-v2.1.md` 保留原有 `legacy_v1` 安全替换/失败保留的历史记录，并已追加由本计划 supersede 的说明。V2 完成切换后，必须删除 V1 Knowledge reader、migration/compat 分支，以及位于既有 path owner 管辖路径下、已成功解析并明确满足 `schemaVersion === 1` 的 legacy 文件。JSON 损坏、无法解析、schemaVersion 缺失/未知/大于 1 或文件来源/owner 不明确时禁止猜测删除，必须显式报错或进入已有异常处理路径。V2 Knowledge 是唯一真源。此范围不包含历史 Article、发布记录或 generation batch。
- **Generation Batch / Article snapshot v1**：这是历史生成执行/文章证据，不等同于知识库 V1。历史 Article snapshot 继续可读；历史 batch 继续可读，但 v1 batch 不再允许新的 AI 调用。非终态 v1 batch 按本计划的安全收尾规则处理。

不得因为“V1 Knowledge 必须删除并退出兼容”而删除历史 Article 或已发布记录。

### 4.5 Article source snapshot v2

新文章保存实际使用的：

- `knowledgeSnapshot.version = 2`：target question、client、selected knowledge、competitors、restrictions、evidence；
- 单条 `researchSnapshot`：原始问题、回答、references、capturedAt 及本次派生信号；
- `templateSnapshot`；
- `generationBatchId / generationTaskId`；
- 可选原始资料 provenance ID，但不再把完整客户资料正文发送给写作模型或复制进新文章快照。

同一事实不得同时以两个可独立变化的完整副本持久化。Research 正文由 `researchSnapshot` 保存，`knowledgeSnapshot` 只保存引用身份和派生信号。

旧文章 `knowledgeSnapshot.version === 1`、多 Research、material snapshots 继续可读，不批量改写。

### 4.6 Prompt v2

新写作请求只包含：

1. 稳定真实性与输出规则；
2. Article Brief v2；
3. 写作模板；
4. 标题、开篇、篇幅、自然表达、文章类型内部选择和输出格式要求。

删除：

- 完整客户资料正文；
- 多条 Research 拼接；
- 客户实体、名称关系、地区、事实冲突和整库筛选指令；
- 已由 Brief 明确提供的竞对识别与推荐维度整理指令；
- Brief 已完成的事实优先级判断。

保留一个有界 fallback：当 `currentResearch.decisionDimensions` 为空时，Prompt 仍允许基于 `currentResearch.answer` 在本次写作内部观察豆包当前采用的判断维度，以避免文章质量退化；这个内部判断不得持久化、不得升级为客户事实。

保留：不虚构、不伪造排名、不把客户自述冒充第三方结论、restrictions 优先、客观竞品表达、800–1200 字、只输出标题和正文。

---

## 5. 实施工作包

所有工作包串行执行。前一包未 Closure，不进入后一包；不得并行修改 generation、Article serialization 或 GeoKnowledge Renderer 共享 owner。

### CP-0：合同与基线对齐

**目标**：先让长期真源与新产品行为一致，并选定包含当前 GEO V2 与主线修复的唯一 integration HEAD。

实施：

- 对比 `codex/geo-knowledge-base`、当前 `master` 与 `codex/refresh-invalidation-owner-fixes`，选择包含已完成 GEO V2 和当前主线修复的干净基线；不在脏工作树中直接拼接分支。
- 更新 `CONTEXT.md` 的生成术语和 Question/Research/Brief 边界。
- 更新 `ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md` 中生成任务、内容失败重新生成和任务计数合同。
- 更新应用 README 的用户流程说明；保留真实 API/浏览器采集逐次授权边界。
- 盘点真实 generation v1 非终态 batch，并记录数量/状态。不存在时直接关闭 v1 AI 执行路径；存在时先做 Article identity recovery，未确定任务冻结，不再调用 AI，只允许用户明确结束旧 batch 并重建 v2。历史 v1 article snapshot/batch reader 保留。
- 以 `AUTOPUBLISH-GEO-KNOWLEDGE-V2-INCREMENTAL-CONTRACT-v2.1.md` 已追加的 supersede 说明为合同基线：V2 完成切换后必须删除 GEO Knowledge V1 reader/migration/compat 路径；legacy 文件仅在位于既有 path owner 管辖路径下、成功解析且明确满足 `schemaVersion === 1` 时删除。JSON 损坏、无法解析、schemaVersion 缺失/未知/大于 1 或文件来源/owner 不明确时禁止猜测删除，必须显式报错或进入已有异常处理路径。V2 Knowledge 保持唯一真源，且不得把该范围扩大到历史 Article/发布记录/generation batch。
- 把 v2 generation 的执行合同同步进长期文档：`(clientId, geoQuestionId)` create identity、store-level 原子 `createOrGetV2`、`researchFingerprint` stale guard、terminal `uncertain` task、v2 running 启动恢复规则；明确历史 v1 runner 不得继续执行 generic network/timeout/5xx 自动 retry。
- 保持 `docs/WORK-INDEX.md` 只登记规范命名的 `AutoPublish-GEO-Content-Production-Implementation-Plan-v1.4.md` 作为本任务 `READY` 入口；若仓库已存在 v1.0/v1.1/v1.2/v1.3，则标记 superseded 并移出 READY/当前入口。

验收：

- 长期文档不再同时声称“客户 × 模板”和“问题 × 模板”；
- 不把 Collection Question 提升为客户知识 owner；
- 不把产品设计文档当作运行状态表；
- integration HEAD、dirty files、依赖分支祖先关系写入计划 Progress；
- WORK-INDEX 不存在多个 READY 的本任务计划，且只指向规范命名 v1.4；本计划头部状态保持 `READY`；
- 长期合同已明确 uncertain 不可自动 retry/resume、store-level 原子 create、`(clientId, geoQuestionId)` create identity、Research fingerprint owner 和 v2 running restart recovery；
- GEO Knowledge V1 删除/不迁移边界与 generation/article v1 历史保留边界已明确；
- v1 generation 非终态盘点结果已记录，旧 runner 不再有任何可触发 AI 自动重试的公开路径。

### CP-1：Customer Confirmation Brief

**目标**：用一个派生模型同时提供客户可读预览和 Markdown。

Owner / 调用链：

- 新增 `src/content/geo-confirmation-model.js` 纯函数 owner；
- `desktop/services/geo-knowledge-service.js` 只负责编排 load/model/export；
- IPC contract、preload、bridge、types 增加 preview/export；
- `GeoKnowledgeView` 增加“客户确认稿”tab，替换当前顶部通用导出入口；
- 来源 tab 增加“支持哪些知识”的反向投影。

测试：

- 15 section 逻辑顺序、空章节 gap、Markdown 空章节隐藏与缺口集中汇总、来源追踪、derived 标签、强声明和 conflict 不越权；
- preview 与 Markdown 来自同一 model；
- 除 synthetic 自动化测试外，用一个现有客户 Knowledge 做本地只读产品验收（不把真实客户数据提交为 fixture，也不发往外部服务）：确认稿应能形成可读的产品/服务、能力、场景、案例、推荐定位和待补资料结构。若结果仍明显偏薄，记录为 Knowledge research/synthesis 的输入质量问题，不得通过 Confirmation AI 扩写或编造解决；
- stale revision、损坏 Knowledge、导出失败使用稳定安全错误；
- UI 加载、空态、partial、资料缺口、长文本、导出失败。

非目标：DOCX、客户修改回写、AI 扩写、联网补资料。

### CP-2：GEO Question 工作台

**目标**：让问题页完整展示采集、回答和文章生产状态，并提供不越权的用例入口。

Owner / 调用链：

- 在 application service 增加批量 Question Workflow query；
- 复用 `questionService`、`researchStore.listResearchMetadata`、Article summaries 和 lifecycle projection；
- 扩展 typed IPC / preload / bridge / renderer feature；
- 重构 `GeoKnowledgeQuestions` 为状态列表 + 详情，页面不建立第二份缓存事实；
- “采集/重新采集”只预选并导航现有采集页；“生成文章”只打开生成向导。

测试矩阵：

| Link | Research | Question text | 结果 |
| --- | --- | --- | --- |
| unlinked | 无 | 当前 | 可加入采集，不可生成 |
| linked + enabled | 无 | 当前 | 可采集，不可生成 |
| linked + disabled | 有 | 当前 | 可使用当前回答生成；再次采集前需先启用 |
| linked | 有 | 不一致 | stale，不把旧回答作为当前回答 |
| linked | 有 | 当前 | 可生成 |
| question deleted | 有 | 任意 | stale，不自动重建或重发 |

另测 0/1/多篇文章、已发布计数、500 问题上限、正文按需读取、聚合读取不形成逐行 IPC N+1；`clientMentioned` 在详情读取时覆盖多别名匹配，并证明列表 query 不为该字段逐行读取 Research 正文。

### CP-3：Article Brief v2 owner

**目标**：把单问题所需客户事实、当前 Research、竞对、限制和证据组合成可验证结构。

实施：

- 将 `geo-generation-context.js` 从多问题 context string 收敛为单问题结构化 Brief v2；
- 保留 v1 snapshot validator 供历史文章读取，新增 v2 validator；
- 实现 Research signals 的保守确定派生；
- Article serialization / summary 支持 v2 target question；
- 先以 owner 单测证明选择正确，再接 generation service；本包不改批次创建 UI。

关键测试：

- exactly-one question/research；
- 明确区分 `geoQuestionId` 与 `collectionQuestionId/research.id`，验证 `targetQuestion.collectionQuestionId === research.id`、client、规范化问题文本和 revision 一致；
- relation 选择、profile basis、client_public attribution、competitor inclusion；
- restrictions 全量、100000 字符失败、不静默截断；
- unknown/candidate/conflict/internal-only 不作为正向事实；
- 洞察可为空且不虚构；`decisionDimensions` 为空时不阻塞 Brief，且不会被伪造补齐；
- v1/v2 article snapshot 均可读取，旧文章不被重写。

### CP-4：问题驱动生成批次、create/start 可恢复性、执行确定性与 Prompt 瘦身

**目标**：新建批次完全使用 question × template 和 Article Brief v2，并闭合 create 幂等、Research stale 证明与 AI uncertain 持久语义。

实施顺序：

1. generation batch serialization/store 增加 v2：`requestId/requestFingerprint`、question source `researchFingerprint`、task/batch `uncertain`；
2. request fingerprint helper 使用稳定排序 `(clientId, geoQuestionId)` + `(platform, templateId)` + concurrency 等显式 create 输入；
3. batch store/file store 增加原子 `createOrGetV2()`：requestId 唯一性与首次持久化在 store 内完成，service 不做 check-then-write；覆盖 exclusive reservation/create 和崩溃恢复；
4. 增加独立、幂等 `startBatchV2` application/service command、typed IPC/preload/bridge 和 UI `canStart` capability；现有一键生成改为 create → start 编排，持久 pending batch 可以在重启后显式继续；
5. preview 改为解析 `questionSources`，校验 knowledge/research readiness，并通过唯一 `fingerprintResearch()` helper 固化 Research fingerprint；
6. task runner 执行前复核 Knowledge revision / Research fingerprint 并构造 Brief；v2 执行分支移除 generic timeout/network/5xx 自动 retry，按 definite failure / uncertain 分类持久化；
7. batch store 增加 `markTaskUncertain`、uncertain counts/aggregate status，并确保 resume/retry selection 排除 uncertain；v2 startup recovery 不复用“running → interrupted”的旧路径；
8. article generator 与 prompt builder 增加 v2 路径；
9. 生成向导改为客户/问题选择，显示问题数 × 模板数；uncertain task 提供“检查结果/重新生成”，后者创建新 requestId/new task，不在原 task 上 retry；
10. attention regeneration 改为预选原文章唯一问题；无法唯一映射的旧文章要求用户选择，不猜测；
11. 删除新建 v1 batch 的公开入口和旧“同客户共享多条回答”UI；v1 generation runner 的 AI 执行入口按 CP-0 盘点结论关闭。

状态矩阵：

| 场景 | 期望 |
| --- | --- |
| preview 后无变化 | 每个 question/template 创建一个任务 |
| knowledge revision 变化 | 对应任务 `GENERATION_SOURCE_STALE`，不使用新 revision |
| Research answer/reference/question/collectedAt 任一 canonical 内容变化 | `researchFingerprint` 不一致，任务 stale，不把新回答塞入旧批次 |
| Research `updatedAt` 缺失或不变，但正文变化 | 仍由 fingerprint 检出 stale |
| Question 改名/删除/重新关联 | stale，不自动选择其他 question |
| 同 requestId + 同 canonical create input 重放 | 返回原 batch；不重复首次持久化、不创建第二批次；create 本身不启动 AI |
| 两个并发 create 使用同 requestId + 同 input | store 原子 create-or-get，只产生一个 batch；两个调用得到同 batchId |
| 同 requestId + 不同 canonical create input | `GENERATION_REQUEST_CONFLICT` |
| 不同客户同名 GEO Question | `(clientId, geoQuestionId)` 使 requestFingerprint 不碰撞 |
| 新用户创建动作 | 必须使用新 requestId |
| create 已成功、start 前崩溃 | 重启后同 batch 保持 pending，`canStart=true`；显式 start 后最终可继续执行 |
| 同一 pending batch 重复 start | start 幂等，只 claim 仍 pending 的 task，不重复 AI |
| 明确 AI 失败 | 保存 `failed`，可由用户显式 retry |
| AI 请求结果不确定 | 保存 task `uncertain`；provider 调用次数保持 1，不自动 retry/resume |
| uncertain 后找到同 generationTaskId 本地 Article | identity recovery 将原 task 标为 succeeded，不再调用 AI |
| uncertain 且无本地 Article，用户选择重新生成 | 重新 preview 并以新 requestId 创建新 batch/task；原 uncertain 保留 |
| 显式 pause 且可确认 AI 未进入不确定执行 | 可使用 interrupted/paused 语义；继续时仍复核同一 source fingerprint |
| 进程重启发现 v2 running + 唯一 Article | identity recovery → succeeded，不调用 AI |
| 进程重启发现 v2 running + 无 Article | → uncertain，不转 interrupted，不自动/手动原 task retry |
| 进程重启发现 v2 running + 多 Article | identity conflict，保持 blocked/uncertain，不调用 AI |
| 同问题多个模板 | 各一任务、各一文章、同一 target question |
| v1 非终态批次不存在 | 删除/关闭 v1 AI 执行路径，只保留历史 reader |
| v1 非终态批次存在 | identity recovery 后冻结未确定任务；用户明确结束旧 batch 后重建 v2，不再执行 v1 AI retry |
| v1 历史批次 | 只读展示，不出现新建/继续 AI 入口 |

Prompt 验收：

- v2 路径不读取或发送完整 customer material content；
- Research 正文只作为 Article Brief `currentResearch.answer` 发送一次，不在同一请求中以其他字段重复拼接；
- 输出文章保存实际 Brief/Research/template snapshot；
- 生成后 Knowledge/Research 更新不改变旧文章；
- 不依赖源码字符串测试证明 Prompt 正确，使用 fake AI 捕获公开请求并断言输入合同与生成行为；
- fake provider 覆盖 safe definite failure 与 uncertain：uncertain 路径断言 AI 只调用一次、task 持久化 uncertain、restart/retry 不会再次调用；
- create/start idempotency 覆盖：跨客户同名 question 不碰撞；同 requestId/same fingerprint 并发双击只产生一个 batch；同 requestId/different fingerprint 稳定冲突；持久化前、持久化后 start 前、start intent 后 task claim 前、AI 执行中四个 crash window 均不产生重复 batch/AI，且 pending batch 最终可通过显式 start 继续；
- restart recovery 覆盖 v2 running + 0/1/多 Article：分别 uncertain/succeeded/identity-conflict，且 0 Article 路径不会落到 interrupted/resumable；
- v1 legacy 安全测试证明旧 timeout/network/5xx 路径不会再自动调用 AI；若无非终态 v1，执行入口不可达；
- Research fingerprint 覆盖时间字段缺失/不变但 answer/reference 改变、JSON 字段顺序变化、reference 顺序变化等 canonical 行为。

### CP-5：集成收口与旧路径清理

**目标**：闭合跨工作包行为，删除无真实消费者的旧入口，完成最终 evidence。

实施：

- 删除旧 generic knowledge Markdown 生成逻辑、Renderer 多回答选择和新建 batch v1 path；
- 保留历史 v1 batch/article reader；不保留可发起 AI 的 v1 runner 执行入口。GEO Knowledge V1 reader/migration/compat 路径删除，不做迁移；
- 更新 README、WORK-INDEX、计划 Progress/Decision Log；
- 执行一次 Integration Audit，只检查 Confirmation/Question/Brief/Batch/Article 的组合边界；
- 修复 blocking findings 后只做 bounded closure re-review。

集成验收链：

```text
Knowledge revision N
  → Confirmation preview/export（同一 model）
  → Question link/research
  → Question Workflow ready
  → batch v2 preview/create
  → one-question Article Brief
  → Prompt v2
  → Article source snapshot
  → Article summary geoQuestionId
  → 文章库 / 投稿保持原生命周期
```

---

## 6. 测试与验证计划

### 6.1 定向 owner / integration tests

现有测试优先扩展，不为测试暴露生产 API：

- `tests/geo-knowledge-service.test.js`
- `tests/geo-knowledge-flow.test.js`
- `tests/geo-question-links.test.js`
- `tests/geo-generation-context.test.js`
- `tests/research-store.test.js`
- `tests/generation-batch-store.test.js`
- `tests/content-generation-batch-service.test.js`
- `tests/article-generator.test.js`
- `tests/prompt-builder.test.js`
- `tests/renderer-geo-knowledge.test.js`
- `tests/renderer-generation-*.test.js`
- `tests/phase-06-production-ipc-fixture-matrix.test.js`

新增测试按公开行为命名，例如：

- `geo-confirmation-model.test.js`
- `geo-question-workflow.test.js`
- `question-driven-generation.test.js`
- `generation-v2-idempotency.test.js`
- `generation-v2-start-recovery.test.js`
- `generation-v2-uncertain.test.js`

### 6.2 每工作包 gate

按改动风险执行：

1. 当前 owner 单测；
2. 直接 service / IPC / serialization 集成测试；
3. stale、retry、restart、duplicate、partial failure、create/start idempotency、pending recovery、uncertain 状态矩阵；
4. `npm run typecheck:main`
5. `npm run typecheck:bridge`
6. `npm run typecheck:renderer`
7. `npm run lint`
8. Renderer 改动时执行 `npm run build:renderer`，preload 改动时执行 `npm run build:preload`。

### 6.3 最终 gate

在所有修复进入最终 clean integration HEAD 后运行：

```powershell
npm test
npm run test:integration
npm run lint
npm run typecheck:main
npm run typecheck:bridge
npm run typecheck:renderer
npm run build:renderer
npm run build:preload
npm run format:check
git diff --check
```

如 `format:check` 存在确认过的未修改基线失败，必须记录文件、基线 commit 和无 diff 证据，不能写成通过。

### 6.4 UI 隔离验收

使用合成 Knowledge/Research/Article 数据验证：

- Confirmation：完整、资料缺口、conflict、partial knowledge、长文本、导出失败；
- Question：unlinked、disabled、missing research、stale、ready、无文章、多文章；
- Generation：选择问题、任务计数、stale preview、运行进度、暂停/继续/失败重试、旧批次展示；
- Article：生成后问题关联计数更新，文章库和投稿权限不回归。

不使用真实客户资料、真实豆包浏览器、真实 API、真实发布或付费操作。

---

## 7. 外部能力与授权边界

本实施方案的本地完成不依赖真实 API 质量验收。

以下操作继续要求用户对本次操作明确授权：

- 把指定客户资料发送给火山方舟；
- 真实 Coding Plan / Responses / web_search 调用和费用；
- 真实豆包登录与问题采集；
- 真实投稿、付费、取消或订单核对。

自动化测试只使用 synthetic data、fake transport 和隔离页面。任何远端请求已发出但结果不确定时不得自动重试。

---

## 8. Review 范围与停止条件

每个工作包 Primary Review 只检查：

- 唯一 owner 和公开合同；
- 持久 schema / snapshot compatibility；
- stale、duplicate、create/start idempotency、pending recovery、retry、restart、uncertain；
- IPC/bridge/Renderer 是否复制业务状态；
- 是否把完整客户资料或敏感响应写入日志；
- acceptance tests 是否验证公开行为。

P0/P1 必须关闭；P2 只有直接影响当前 acceptance、事实一致性、幂等、不确定结果、安全或公开合同才阻塞。修复后只复查 finding、修复 diff、直接调用方和对应状态矩阵。

只有以下情况停止并请求用户决定：

- 产品设计与更新后的 CONTEXT/SPEC 仍有无法兼容的语义冲突；
- 必须新增付费 Article Brief AI 请求才能满足验收；
- 必须删除或不可逆迁移真实历史文章/批次；GEO Knowledge V1 的“不迁移、必须删除并退出兼容”属于本轮已确定产品范围，不构成新的产品决策，但实际删除前仍必须核对既有 path owner，并确认文件已成功解析且 `schemaVersion === 1`；
- 需要真实账号、付费、发布或生产数据操作；
- integration baseline 无法同时保留已完成 GEO V2 和主线关键修复。

普通实现选择、测试失败、stale migration、review finding 和局部重构不构成停止理由。

---

## 9. 完成定义

本方案只有在以下条件全部满足时才能标记 COMPLETE：

1. CP-0～CP-5 全部 Closure；
2. 客户确认稿预览与 Markdown 共用唯一 Confirmation Model；
3. GEO Question 页面可判断知识、采集、回答和文章状态；列表保持轻量，Research 正文与 `clientMentioned` 只按需读取；
4. 所有新生成任务为 question × template，且每篇只有一个 target question；
5. Article Brief v2 不依赖完整知识库或完整客户资料正文即可提供本篇上下文，且 Research 身份严格通过 `collectionQuestionId` 匹配；
6. Prompt v2 不重复承担已前移的客户事实整理职责；当结构化 `decisionDimensions` 缺失时，仅保留读取当前 Research answer 的本次写作语义 fallback，不产生新持久事实；
7. Article 保存实际输入快照，知识/Research 后续变化不改写旧文章；
8. v1 article/batch 历史可读；v1 AI 执行入口已关闭，非终态 v1 若存在已安全收尾/冻结并要求重建 v2；V2 Knowledge 历史合同已经追加由本计划 supersede 的说明；V2 完成切换后，V1 Knowledge reader、migration/compat 分支已删除，且位于既有 path owner 管辖路径下、成功解析并明确满足 `schemaVersion === 1` 的 legacy 文件已全部删除。JSON 损坏、无法解析、schemaVersion 缺失/未知/大于 1 或文件来源/owner 不明确的文件未被猜测删除，而是显式报错或进入已有异常处理路径；仅停止读取但保留已确认的 V1 legacy 文件不算完成；
9. v2 create 具备 store-level 原子持久幂等：fingerprint 含 `(clientId, geoQuestionId)`，并发同 requestId 只产生一个 batch，同 requestId 不同输入稳定冲突；create 后 pending batch 具备独立幂等 start 命令，重启后不会永久孤立；
10. v2 Research stale 由 `researchFingerprint` 证明，不依赖时间戳；
11. v2 uncertain task 被持久化且不可自动 retry/resume；人工重新生成创建新 task，原 uncertain 保留；
12. 重启发现 v2 running 时已经 Article identity recovery：1 Article→succeeded，0 Article→uncertain，多 Article→identity conflict；不存在 running→interrupted→resume 的不安全路径；
13. blocking findings 全部关闭，Integration Audit 与 bounded closure re-review PASS；
14. 最终 clean HEAD 的完整 gate 通过并记录真实命令、结果、commit/source state；
15. 未执行的真实 API/豆包/发布验收及原因明确记录；
16. 没有新增第二 owner、旁路 writer、临时兼容债或未登记的真实副作用。

---

## 10. Progress

- 2026-09-22：CP-0 Closure。选定 `codex/geo-knowledge-base` @ `ffafbc667cb1914eb2f1881d50deba9acee434a7` 为唯一 integration HEAD；`master` 与 `codex/refresh-invalidation-owner-fixes` 均为该 HEAD 祖先，无需合并。启动时工作树仅有未跟踪的旧 v1.3 计划；它不属于当前 Git 基线，保持用户文件原样且不纳入提交，WORK-INDEX 只登记规范 v1.4，不包含其他用户改动。
- 2026-09-22：完成长期合同对齐：`CONTEXT.md`、文章生命周期 SPEC 与应用 README 统一为问题 × 模板、单问题 Article Brief、store-level create 幂等、Research fingerprint、terminal uncertain 与 v2 running identity recovery；WORK-INDEX 只保留规范 v1.4 为当前入口。
- 2026-09-22：只读盘点两个本机已登记内容库中的 29 个 generation v1 批次：28 个 `completed`、1 个 `abandoned`、非终态 0；未修改任何真实批次文件。生产 composition 已关闭 v1 新建/启动/继续/失败重试和 attention regeneration 的 AI 执行入口，历史 batch/article reader 与明确结束能力保留；旧 runner 仅通过显式测试开关供 CP-4 删除前的历史回归使用。
- 2026-09-22：CP-0 Primary Review 发现生产装配禁用策略需要架构门禁，且 legacy runner 的测试开关应 fail closed；补充 production composition legacy-absence test、改为仅显式 `true` 才允许历史 runner 后 bounded re-review PASS。定向回归 `node --test tests/content-generation-batch-service.test.js tests/content-generation-batch-ipc.test.js tests/renderer-client-generation.test.js` 31/31 通过；核心门禁 `npm test` 597/597 通过；`npm run typecheck:main`、`npm run typecheck:bridge`、`npm run typecheck:renderer`、`npm run lint` 与 `git diff --check` 通过。
- 2026-09-21：完成产品设计、现有 owner、当前生成合同、Knowledge/Question/Research/Article snapshot 和 Renderer 调用链对照。
- 2026-09-21：结论为产品方向可实施；将问题身份、任务基数、Brief 非持久化和 Research 保守派生固化为实施合同。
- 2026-09-21：完成 v1.1 收口修订：修正 Research 身份合同、Question Workflow 轻量读取、Research 洞察 fallback、Confirmation 真实丰富度验收、Batch v2 去重持久化和保守 revision invalidation。
- 2026-09-21：完成 v1.2 blocking contract 修订：新增 v2 terminal uncertain 状态与人工重新生成语义、create `requestId/requestFingerprint` 持久幂等、Research `researchFingerprint` stale guard。
- 2026-09-21：完成 v1.3 合同收口：request fingerprint 纳入 `(clientId, geoQuestionId)`、create 幂等下沉为 batch-store 原子 `createOrGetV2`、v2 restart running 先 Article identity recovery、历史 v1 generation 停止新的 AI 执行，并记录 GEO Knowledge V1 不迁移的产品决定。
- 2026-09-22：完成 v1.4 复核修订：补齐 create 后 pending batch 的显式幂等 start 闭环；修正 D6/D22；把 V1 Knowledge 删除改为“先更新现行 V2 长期合同、再退出兼容/删除”的实施顺序；形成待登记候选，后续登记与最终状态见下一条。
- 2026-09-22：完成最终文字一致性收口：统一 V1 Knowledge 为“确认 `schemaVersion === 1` 后必须删除并退出兼容”，明确四个 crash windows 的 owner 边界，为已完成 V2 合同追加 supersede 说明，并将规范 v1.4 登记到 WORK-INDEX。计划状态更新为 `READY`，CP-0 尚未开始。

## 11. Decision Log

- **D1**：GEO Knowledge `geoQuestions[]` 是内容生产问题资产 owner；Collection Question 是采集执行 owner。
- **D2**：新任务基数为 question × template；一篇文章不再混合多条 Research。
- **D3**：Article Brief 复用 `geo-generation-context`，不新增 store。
- **D4**：新 Prompt 不发送完整客户资料正文；历史文章资料快照保持可读。
- **D5**：Research signals 第一版只做保守确定派生，不增加隐藏 AI 请求或费用；`decisionDimensions` 为空时保留文章 Prompt 对当前 answer 的本次写作语义 fallback，但不持久化该推断。
- **D6**：v1 generation batch 不迁移为 v2，只保留历史读取；存在非终态 v1 时按 D22 做 Article identity recovery 后冻结/结束，禁止继续 v1 AI 执行。
- **D7**：本计划不与当前规模审计修复并行执行；启动 CP-0 时先选择唯一干净 integration baseline。
- **D8**：Research 记录身份属于 Collection Question；Article Brief 用 `collectionQuestionId === research.id` 连接，`geoQuestionId` 不与 Research ID 混用。
- **D9**：Question Workflow 列表采用轻量 metadata 聚合；`clientMentioned` 和 Research 正文按需在详情/生成预检读取，不新增索引 owner。
- **D10**：Confirmation Model 只能重组现有 Knowledge；真实确认稿偏薄时回到 Knowledge research/synthesis 修复，不在 Confirmation 层调用 AI 扩写。
- **D11**：Generation Batch v2 的 task 只持久化 `questionSourceId + template/platform + task state`，客户/问题/Research 身份由 questionSource 解引用，避免重复真源。
- **D12**：第一版使用 client Knowledge revision 做保守 stale invalidation；不引入细粒度 fingerprint，直到真实使用证明有必要。
- **D13**：文章类型继续由现有写作 Prompt 在单篇生成内部选择，不新增持久化“本次文章类型” owner。
- **D14**：Generation v2 增加 terminal `uncertain` task/batch 状态。uncertain 不属于 resumable/retryable；仅本地 Article identity recovery 可把原 task 确定为 succeeded，否则用户重新生成必须创建新 requestId/new task，原 uncertain 永久保留。
- **D15**：Generation v2 create command 必填 `requestId`，batch 持久化 canonical `requestFingerprint`；同 requestId 同输入返回原 batch，同 requestId 不同输入冲突。create replay 不触发 AI。
- **D16**：Research 完整性由版本化 `researchFingerprint` 证明，覆盖 question/answer/references/collectedAt 等 canonical 内容；`researchUpdatedAt` 不作为 stale guard。
- **D17**：v2 runner 不继承 v1 的 generic network/timeout/5xx 自动 retry。只有 transport 明确证明安全未执行的失败才可重试；无法确认是否执行时 fail closed 为 uncertain。
- **D18**：本计划已登记到 WORK-INDEX 并处于 `READY`；WORK-INDEX 对本任务只能指向规范命名 v1.4，旧版本若已入仓则标记 superseded，不允许多个 READY 实施入口并存。
- **D19**：canonical create identity 使用稳定排序 `(clientId, geoQuestionId)`；GEO Question ID 本身不视为跨客户全局唯一。
- **D20**：batch store/file store 原子拥有 v2 `createOrGetV2`；service/application 不执行 check-then-write。整个 create → start → task execution 生命周期必须覆盖四个 crash windows：前两个 create / persist 窗口由 `createOrGetV2` owner 负责，确保并发双击和重放返回/恢复同一 requestId 对应的唯一 batch；后两个窗口由 start / task execution owner 负责，确保执行阶段恢复与状态一致性。不得把全部四个窗口归给 `createOrGetV2`，也不因此新增协调器、事务框架或恢复状态机。
- **D21**：v2 startup recovery 不把遗留 `running` 变为 resumable `interrupted`。先按 generationTaskId 做 Article identity recovery：1 Article→succeeded，0 Article→uncertain，多 Article→identity conflict；均不自动重发 AI。
- **D22**：历史 v1 generation 不再允许新的 AI 调用。不存在非终态 v1 时删除执行入口；存在时 identity recovery 后冻结未确定任务，用户结束旧批次并重建 v2。历史 reader 保留。
- **D23**：GEO Knowledge V1 的产品决定是不迁移、必须删除并退出兼容；已完成 V2 合同保留原历史记录并追加由本计划 supersede 的说明。V2 完成切换后，必须删除 V1 reader/migration/compat 路径，并且只能删除位于既有 path owner 管辖路径下、成功解析且明确满足 `schemaVersion === 1` 的 legacy 文件；禁止猜测删除损坏、无法解析、schemaVersion 缺失/未知/大于 1 或 owner 不明确的文件。范围严格排除历史 Article、发布记录与 generation v1 历史证据。
- **D24**：Generation v2 把 create 与 start 分为两个可恢复命令：`createOrGetV2` 只产生唯一 pending batch；`startBatchV2` 显式且幂等。Renderer 可一键编排二者，但持久化后/start 前崩溃必须能够从 pending batch 继续。

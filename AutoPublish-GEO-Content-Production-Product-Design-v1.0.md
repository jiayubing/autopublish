# AutoPublish GEO 内容生产闭环产品设计文档

**版本**：v1.0  
**状态**：产品方案收口稿  
**适用范围**：客户知识库 → 客户确认 → GEO 问题 → 问题采集 → Article Brief → 文章生成 → 投稿  
**设计原则**：小规模自用优先、职责清晰、事实可追溯、避免重复 owner、避免过度工程化

---

## 1. 背景

AutoPublish 当前已经具备客户资料、GEO 客户知识库、GEO 问题、豆包问题采集、文章生成、文章库和投稿能力。

现阶段真正需要解决的，不再是“有没有这些功能”，而是这些功能之间如何形成一条清晰、稳定、可长期维护的 GEO 内容生产链。

当前主要问题有四类：

1. **客户知识库和问题采集之间关系不够明确**  
   知识库知道“客户是谁”，问题采集知道“豆包怎么回答”，但产品上仍像两个独立功能。

2. **文章生成 Prompt 承担过多前置分析职责**  
   当前正式文章生成 Prompt 除了写作，还负责重新识别客户实体、判断资料优先级、筛选本篇相关事实、判断豆包推荐逻辑、识别竞品等。随着知识库和 Article Brief 完善，这些职责应该逐步前移。

3. **结构化知识库适合程序使用，但不适合直接给客户确认**  
   当前 Markdown 导出更像“内部结构化知识导出”，内容较薄，客户难以通过它完整确认品牌、业务、优势、案例、重点 GEO 方向和资料缺口。

4. **批量文章生产还需要一个明确的核心工作单元**  
   GEO 的真正工作对象不应该是“客户资料”，而应该是一个个真实的 GEO Question。每个问题都应有自己的知识覆盖、豆包当前回答、Article Brief 和文章产出。

---

# 2. 产品目标

本轮产品设计的目标是把以下链路正式收口：

```text
客户资料
   ↓
Customer Knowledge
   ├──────────────→ Customer Confirmation Brief
   │                        ↓
   │                    客户确认/补充
   │                        ↓
   │                  人工更新 Knowledge
   │
   ↓
GEO Question Pool
   ↓
GEO Research / 问题采集
   ↓
Article Brief
   ↓
文章生成 Prompt
   ↓
Article
   ↓
文章库 / 投稿中心 / 发布
```

最终要达到：

- 客户知识只维护一份长期真源；
- 客户能拿到一份完整、可读、可确认的知识文档；
- GEO Question 成为贯穿采集和文章生成的核心工作单元；
- 豆包问题采集只描述“当前 AI 回答环境”；
- Article Brief 负责把知识库和问题采集组合成“本篇文章输入”；
- 文章生成 AI 主要负责编辑写作，不再重复做上游事实整理；
- 旧文章继续保存当时使用的知识快照，不随知识库变化被改写。

---

# 3. 非目标

本轮不做：

- 向量数据库；
- 通用 RAG 平台；
- 知识图谱；
- 多 Agent；
- 自动周期研究；
- 全自动客户确认回写；
- 多人协同审批系统；
- 复杂置信度评分；
- 自动判断“最优问题”；
- 新建第二套客户事实 owner；
- 新建第二套问题采集 owner；
- 为每篇文章单独保存一套可编辑知识库；
- 让文章生成模型联网补事实。

---

# 4. 核心产品原则

## 4.1 客户知识库是唯一客户事实真源

Customer Knowledge 只负责：

> “这个客户是谁、有什么业务、有什么能力、什么可以写、什么不能写。”

它不负责某次豆包回答，也不负责某篇文章的表达方式。

## 4.2 GEO Question 是内容生产的工作单元

以后批量生产文章应围绕问题进行，而不是：

> 给一个客户随机生成 20 篇文章。

正确方式是：

```text
Question 1 → Research 1 → Brief 1 → Article 1
Question 2 → Research 2 → Brief 2 → Article 2
Question 3 → Research 3 → Brief 3 → Article 3
```

同一个问题未来可以生成多篇不同角度文章，但每篇都要知道自己服务哪个问题。

## 4.3 问题采集研究的是目标 AI，而不是客户

GEO Research / 问题采集回答的是：

> “豆包现在如何理解并回答这个问题？”

它不重新研究客户主体。

## 4.4 Article Brief 是唯一组合层

Article Brief 把：

- GEO Question；
- 本篇相关客户知识；
- 当前豆包回答；
- 相关竞对；
- 当前判断维度；
- 禁止表述；

组合成一次文章生成所需的最小上下文。

它是派生物，不是新的事实真源。

## 4.5 文章生成 Prompt 主要负责写作

文章 Prompt 保留：

- 真实性约束；
- GEO 内容目标；
- 文章类型；
- 标题差异化；
- 开篇方式；
- 客户出现方式；
- 竞品表达；
- 写作风格；
- 篇幅；
- AI 腔限制；
- 输出格式。

逐步移除：

- 重新识别客户实体；
- 重新判断名称关系；
- 重新判断客户事实和冲突；
- 重新筛选整库知识；
- 重新分析豆包回答中的竞争环境；
- 重新决定本篇应该使用哪些事实。

---

# 5. 五个核心产品对象

## 5.1 Customer Knowledge

### 定位

客户长期结构化知识真源。

### 内容

#### 客户身份

- 正式名称；
- 品牌名称；
- 门店名称；
- 别名；
- 地区；
- 地址；
- 服务区域；
- 企业/品牌/门店关系。

#### 产品与服务

- offering；
- 服务范围；
- 核心业务；
- 重点产品；
- 主要业务方向。

#### 能力与证据

- capability；
- 技术；
- 工艺；
- 设备；
- 资质；
- 授权；
- 合作关系；
- 外部公开证据。

#### 历史

- 成立；
- 搬迁；
- 扩店；
- 业务调整；
- 品牌历史；
- 重要公开事件。

#### 线上身份

- 官网；
- 地图 POI；
- 抖音；
- 视频号；
- 小红书；
- 公众号；
- 其他公开账号。

#### 案例

- 客户提供案例；
- 公开案例；
- 可外部核实案例。

#### 场景

- 用户需求；
- 使用场景；
- 地域场景；
- 特定人群；
- 特定产品或车型；
- 特定服务用途。

#### 推荐角度

客户在真实事实基础上，可以合理参与哪些推荐场景。

#### 竞对

只保存有公开资料支撑的真实竞对与客观定位差异。

#### Restrictions / Conflicts

- 禁止宣称；
- 待确认强声明；
- 冲突；
- 内部信息；
- 易过期信息。

#### Sources

所有知识的来源。

### 不存

- 某一次豆包完整回答；
- 某篇文章正文；
- 某篇文章标题；
- 写作结构；
- 临时文章角度；
- 文章随机类型。

---

## 5.2 Customer Confirmation Brief

### 定位

给客户阅读和确认的完整知识文档。

它不是第二份知识库，而是 Customer Knowledge 的可读派生视图。

### 目的

解决：

> “结构化知识对程序够用，但给客户看太薄、不像一份完整客户知识底稿。”

### 固定结构

1. 客户 / 品牌概况
2. 主要产品与服务
3. 产品 / 服务特点
4. 品牌故事与发展历史
5. 线上公开身份
6. 用户需求与典型场景
7. 核心能力与差异化
8. 团队 / 负责人
9. 资质、授权与信任背书
10. 客户案例
11. 竞对与市场位置
12. 推荐定位 / GEO 推荐角度
13. 核心 GEO 问题
14. 禁止或谨慎使用的表述
15. 请客户确认 / 补充

### 关键规则

- 只能基于 Customer Knowledge 重组，不产生新事实；
- derived 内容必须明确是场景分析或推荐角度，不冒充客户事实；
- 缺资料就写“当前资料不足，建议补充”；
- 强声明要明确区分“外部已证实 / 客户资料提供 / 客户公开自述”；
- 客户修改后的文档第一版不自动回写知识库。

### 导出

第一阶段支持：

- 页面预览；
- Markdown 导出。

后续再增加：

- DOCX 导出。

不要维护两套内容生成逻辑，应复用同一份 confirmation model。

---

## 5.3 GEO Question

### 定位

整个 GEO 内容生产流程的核心工作单元。

### 概念字段

```text
question
intent
relatedOfferingIds
relatedScenarioIds
knowledgeCoverage
latestResearchAt
clientMentioned
generatedArticleCount
```

其中后三项可由其他 owner 投影，不需要复制持久化。

### 问题类型

产品上只需要理解三类：

- 用户需求问题；
- 场景 / 选择 / 对比问题；
- 品牌问题。

用户需求问题应占主体。

### 问题生成原则

正确链路：

```text
客户事实
↓
能力 / 场景
↓
Recommendation Angle
↓
真实用户问题
```

避免：

```text
客户有一个“独家”宣传点
↓
反向制造一个只有客户能回答的问题
```

---

## 5.4 GEO Research

### 定位

描述目标 AI 当前对某个 GEO Question 的回答环境。

继续由现有问题采集 / research owner 负责。

### 原始内容

```text
question
answer
references
capturedAt
```

### 可派生信息

```text
mentionedEntities
clientMentioned
decisionDimensions
answerGaps
```

### 核心边界

GEO Research 只负责：

> 豆包当前怎么回答这个问题。

不负责：

> 重新研究客户是谁。

---

## 5.5 Article Brief

### 定位

某一篇文章生成时真正交给文章模型的业务上下文。

继续复用现有 `geo-generation-context` owner，不新增 store。

### 建议合同

```text
targetQuestion
intent

client:
  primaryName
  aliases
  location

selectedKnowledge:
  profileFacts
  offerings
  capabilities
  scenarios
  cases
  recommendationAngles
  onlinePresence
  history

evidence:
  sources
  attributionRequired

currentResearch:
  answer
  references
  mentionedEntities
  clientMentioned
  decisionDimensions
  answerGaps

competitors:
  本篇相关竞对

restrictions:
  所有本篇相关禁止/谨慎表述

knowledgeRevision
researchCapturedAt
```

### 选择原则

Article Brief 只选择与当前 Question 有关系的知识。

例如目标：

> 通许县做种植牙哪家比较靠谱？

应选：

- 客户基本身份；
- 地址；
- 种植牙 offering；
- 对应 capability；
- 种植场景；
- 种植相关案例；
- 对应 recommendation angle；
- 与当前问题有关的竞对；
- 当前豆包回答；
- 当前豆包判断维度；
- restrictions。

不要塞入无关知识或整个知识库。

---

# 6. 文章生成 Prompt 的最终职责

当前文章生成 Prompt 不推翻，只做职责瘦身。

## 保留

- 文章不是纯广告；
- 回答真实用户问题；
- 不虚构；
- 不制造虚假排名；
- 五种文章类型；
- 标题差异化；
- 开篇差异化；
- 客户自然出现；
- 每篇只使用少量相关事实；
- 不复制豆包；
- 客观使用竞品；
- GEO 语义关系；
- 自然写作；
- 800–1200 字；
- 多次生成差异化；
- AI 腔限制；
- 最终只输出标题 + 正文。

## 后续逐步移除

等 Article Brief 完善后，以下职责可以从文章 Prompt 删除或大幅缩短：

- 自己识别客户是谁；
- 自己判断企业名、品牌名、门店名关系；
- 自己判断客户所在地区；
- 自己从整库找最有价值事实；
- 自己判断事实、商家自述和冲突；
- 自己重新识别竞品；
- 自己重新分析豆包推荐维度；
- 自己决定本篇筛哪些知识。

文章模型最终应该收到：

> “系统已经给出本篇 Article Brief，请基于 Brief 写文章，不重新建立客户事实。”

---

# 7. 产品页面结构

客户知识库页面最终建议收为：

```text
[知识]
[客户确认稿]
[GEO问题]
[来源]
[待确认]
```

## 7.1 知识

定位：维护结构化客户事实。

展示：

- 紧凑列表；
- 右侧详情栏；
- 主列表不铺完整长文；
- 显示来源性质；
- 显示维护状态；
- 允许人工编辑和锁定。

## 7.2 客户确认稿

定位：给人阅读的知识文档。

操作：

- 预览；
- 导出 Markdown；
- 后续导出 DOCX；
- 提示当前资料缺口。

## 7.3 GEO 问题

这是今后最关键的操作页。

每个问题建议展示：

```text
通许县种植牙哪家比较靠谱？

知识覆盖：较充分
最近采集：2026-09-21
豆包提到客户：否
已有文章：2

[重新采集] [生成文章]
```

未采集：

```text
最近采集：尚未采集

[加入问题采集]
```

## 7.4 来源

不再只是 URL 列表。

展示：

```text
来源名
来源类型
支持哪些知识
是否已经确认归属
```

## 7.5 待确认

包含：

- Profile conflict；
- 强声明；
- 独家 / 首家；
- 疗效；
- 排名；
- 无外部证据的关键宣传；
- 重要资料缺口。

---

# 8. 新客户完整操作流程

```text
1. 创建客户
2. 上传资料
3. 生成客户知识库
4. 查看待确认
5. 生成客户确认稿
6. 给客户确认
7. 人工修正知识
8. 确认 GEO 问题池
9. 选择一批问题进入采集
10. 豆包采集真实回答
11. 批量生成文章
12. 文章进入文章库
13. 发起投稿
```

---

# 9. 日常文章生产流程

客户知识库不需要每次重新研究。

日常应是：

```text
选择客户
↓
进入 GEO 问题
↓
选择一批问题
↓
检查是否已有较新的 Research
↓
必要时重新采集
↓
批量生成
↓
每题生成独立 Article Brief
↓
生成文章
```

---

# 10. 更新频率

## Customer Knowledge

低频更新。

触发：

- 新增客户资料；
- 客户业务变化；
- 新门店；
- 新产品；
- 新授权；
- 现有知识明显不足；
- 主动重新研究。

不建议每天刷新。

## GEO Research

更新频率高于知识库。

因为客户事实变化慢，AI 回答环境变化更快。

第一版人工重新采集即可，不做自动定时刷新。

## Article Brief

每次生成实时派生，不作为长期可编辑 owner。

生成文章时将实际使用的 snapshot 固化进文章。

---

# 11. 批量生成规则

批量生成围绕 GEO Question。

```text
Q1 → Brief1 → Article1
Q2 → Brief2 → Article2
Q3 → Brief3 → Article3
Q4 → Brief4 → Article4
Q5 → Brief5 → Article5
```

每篇文章可以通过：

- 文章类型；
- 标题；
- 开篇；
- 客户出现位置；
- 事实取舍；
- 结构；

获得差异。

但是客户事实不能随机变化。

---

# 12. 弱客户 GEO 策略

系统不能为了 GEO 强行制造客户优势。

当客户实力普通时：

## Knowledge

只记录真实能力。

## Recommendation Angle

寻找窄而真实的适配方向：

- 地域便利；
- 特定服务；
- 特定人群；
- 特定产品；
- 特定车型；
- 一站式；
- 细分场景；
- 本地服务；
- 性价比；
- 特定技术能力。

## Question Pool

避免优先进入过度竞争的问题。

例如不优先：

> 河南最好的牙科是哪家？

更适合：

> 通许县老人缺牙在哪里可以看？

> 通许县孩子蛀牙去哪里方便？

> 通许县做隐形矫正有哪些机构？

---

# 13. 客户确认闭环

客户确认稿不是展示功能，而是知识补全工具。

```text
Knowledge
↓
生成 Confirmation Brief
↓
客户查看
↓
客户指出错误 / 补资料
↓
人工审核
↓
更新 Knowledge
↓
重新生成 Confirmation Brief
```

第一版明确：

> 不自动读取客户修改后的文档并写回知识库。

避免错误事实自动进入 canonical knowledge。

---

# 14. 数据 owner 边界

| 对象 | Owner | 是否事实真源 |
|---|---|---|
| Customer Knowledge | GEO Knowledge Store | 是 |
| Confirmation Brief | 派生 View / Export | 否 |
| GEO Question | GEO Knowledge Question | 否，问题资产 |
| GEO Research | 现有 Research Store | 是，对当次 AI 回答事实 |
| Article Brief | geo-generation-context | 否 |
| Article Snapshot | Article | 是，对文章当时使用的输入 |
| Article | Article Store | 是 |

原则：

> 不新增重复 owner。

---

# 15. 禁止的数据反向流

## Article → Knowledge

禁止自动写回。

文章中出现的新表述不能成为客户事实。

## GEO Research → Knowledge

豆包回答提到客户新信息时，可以提示“建议重新研究”，不能直接升级成客户 fact。

## Confirmation Brief → Knowledge

第一版客户文档修改不自动回写。

---

# 16. 推荐实施顺序

## 阶段 A：客户确认稿

### 目标

解决当前“知识库导出内容薄、客户不好确认”的问题。

### 实施

```text
Customer Knowledge
↓
Confirmation Model
↓
确认稿页面
↓
Markdown 导出
```

### 不做

- DOCX；
- 自动回写；
- AI 再联网补知识。

### 验收

- 文档明显比当前知识导出更适合客户阅读；
- 所有事实都能追溯到 Knowledge；
- 缺资料明确显示；
- 不生成新客户事实；
- 有“请客户确认/补充”章节。

## 阶段 B：GEO Question 工作流

### 目标

让 Question 成为知识库、采集和文章的连接点。

### 页面

每个问题显示：

- 知识覆盖；
- 最近采集；
- 客户是否被提及；
- 文章数量；
- 采集；
- 生成文章。

### 不做

- 新 Research Store；
- 自动周期采集；
- 问题评分系统。

## 阶段 C：Article Brief 完整化 + Prompt 瘦身

### 目标

让写作模型只负责写作。

### Article Brief 增加

- targetQuestion；
- intent；
- relevant Knowledge；
- current Research；
- mentioned entities；
- decision dimensions；
- restrictions；
- evidence attribution。

### Prompt

先保持当前版本可用。

Article Brief 稳定后，再删除重复的上游分析职责。

---

# 17. 产品验收标准

整个链路完成后应满足：

### 知识库

即使没有文章，也能独立说明客户是谁、有什么、什么不能写。

### 客户确认稿

即使不给 AI，也能让客户看懂自己的信息、指出错误、补充资料。

### GEO Question

能够明确知道：

- 这个问题知识是否足够；
- 是否采集过；
- 最近一次采集结果；
- 是否已生成文章。

### GEO Research

只描述：

> AI 当前怎么回答这个问题。

不承担客户事实库职责。

### Article Brief

不需要全文知识库，也能提供本篇文章所需的完整上下文。

### 文章模型

即使不能联网，也可以仅依赖 Article Brief 写出：

- 围绕目标问题；
- 事实可靠；
- 有真实信息量；
- 客户自然出现；
- 不硬广；
- 不虚构；

的文章。

---

# 18. 最终产品定义

AutoPublish 的 GEO 内容生产不再理解为：

> “上传客户资料，然后 AI 批量写文章。”

而是：

> **先建立可靠的客户知识 → 确认客户真正适合参与哪些 GEO 问题 → 观察目标 AI 当前如何回答这些问题 → 针对每个问题组合最相关的客户事实和当前竞争环境 → 批量生产能够真实回答问题的内容 → 进入发布链路。**

最终核心链：

```text
Customer Knowledge
        ↓
Recommendation Angles
        ↓
GEO Questions
        ↓
GEO Research
        ↓
Article Brief
        ↓
Article
        ↓
Publish
```

其中：

> **Customer Knowledge 是客户维度的长期资产。**

> **GEO Question 是内容生产维度的核心工作单元。**

> **GEO Research 是目标 AI 环境快照。**

> **Article Brief 是一次文章生成的上下文。**

> **Article Prompt 是编辑器，不是新的知识研究系统。**

这五个职责固定后，后续扩客户量、问题量、文章量和发布平台时，不需要重新推翻内容生产链。

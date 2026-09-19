# AutoPublish 客户 GEO 知识库
## 产品设计与技术设计基线

**状态：** 设计已确认，可进入实施拆分  
**设计日期：** 2026-09-19  
**代码基线：** `master` @ `93bea300f3c6165858ac76f08dac0ca9171aa9b2`  
**适用项目：** `jiayubing/autopublish`

---

## 1. 背景与目标

AutoPublish 当前已经具备较完整的内容生产与发布链路：

> 客户资料 / 问题采集 → 文章生成 → 文章库 → 投稿中心 → 发布 → 发布结果

目前缺少的是位于内容生产前端的“客户知识层”。

现状下，客户资料、问题采集结果和文章生成之间仍然偏直接，系统能够批量生产内容，但对于以下问题缺少统一答案：

- 这个客户到底有哪些可以确认的事实？
- 客户卖什么产品、菜品或服务？
- 哪些能力、资质、案例有证据支持？
- 客户适用于哪些用户需求和场景？
- 用户可能如何向豆包提问？
- 豆包当前如何回答这些问题？
- 当前内容生产缺少哪些知识？
- 哪些说法不能生成，哪些信息存在冲突或已经过时？

因此新增 **客户 GEO 知识库**。

其定位不是普通“企业资料整理工具”，也不是一个通用 RAG 平台，而是 AutoPublish 的内容生产前置层：

> 将客户原始资料和豆包联网研究结果，整理成可追溯、可更新、可直接服务于 GEO 问题与文章生成的结构化知识。

---

# 2. 核心产品原则

## 2.1 资料少也可以生成

客户资料不足不是错误状态。

尤其小餐饮、本地门店、小微企业，可能只能提供：

- 店名或企业名
- 地址
- 主营品类
- 少量菜单或产品信息
- 几张资料文件
- 一两句业务描述

系统仍然应该允许生成知识库。

知识不足只能表现为：

- 暂无信息
- 资料不足
- 存在冲突
- 尚未研究

不能表现为：

> “资料不完整，无法生成知识库”。

---

## 2.2 客户事实、外部研究和 AI 推导必须分层

任何知识都必须能够区分其性质。

### 客户事实

来自：

- 客户提供资料
- 客户明确填写的信息
- 可确认的官方公开资料

例如：

> 门店位于苏州工业园区。

### 外部研究

来自豆包联网查询的行业、地域、品类和场景信息。

例如：

> 多人聚餐通常会关注距离、价格、包间和菜品类型。

这不是客户事实。

### AI 推导

AI 根据已有事实和研究合理推导出的场景或选题。

例如：

> 该餐饮客户可能适合“朋友聚餐”场景。

如果客户并未明确说明，则不能反过来写成：

> 本店最适合朋友聚餐。

---

## 2.3 AI 负责语义，程序负责状态

AI 可以负责：

- 阅读和理解
- 提取事实
- 归类
- 总结
- 生成研究任务
- 生成 GEO 问题
- 发现潜在冲突
- 形成自然语言表达

程序负责：

- `clientId`
- `sourceId`
- 文件路径
- URL 归属
- 时间戳
- 保存状态
- 人工锁定
- 冲突状态
- 重试次数
- 数据合并
- 文件读写
- 不覆盖人工内容

原则：

> **AI 负责理解，程序负责证据和状态。**

---

## 2.4 来源可追溯

任何被视为客户事实的外部信息必须能追到来源。

最低要求：

- 标题
- URL
- 抓取 / 查询时间

对于客户资料则至少需要：

- 原始材料 ID
- 文件名

没有可靠来源的内容可以作为：

- `derived`
- `candidate`
- `unknown`

但不能直接升级为已确认客户事实。

---

## 2.5 不追求“资料完整率”

第一版不做：

- 83.7% 完整度
- 92% 可信度
- AI 置信度评分
- 综合知识健康分

使用离散状态即可：

- 已覆盖
- 部分覆盖
- 暂无信息
- 存在冲突

---

# 3. 产品定位

客户 GEO 知识库属于 **内容生产**。

不新增顶级导航。

建议：

```text
内容生产
├─ 问题采集
├─ 单篇生成
├─ 批量生成
└─ 客户知识库
```

知识库不负责投稿，不负责发布结果，也不替代现有 research 数据。

---

# 4. 用户主流程

用户侧应尽量只有一个核心动作：

> 选择客户 → 点击“生成知识库”

系统内部：

```text
客户已有资料
    ↓
读取和标准化
    ↓
提取客户明确事实
    ↓
生成研究计划
    ↓
豆包联网研究
    ↓
整理外部知识和证据
    ↓
生成场景与 GEO 问题
    ↓
保存客户 GEO 知识库
```

首次知识库生成完成后，**不自动把全部 GEO 问题都发送给豆包做真实回答测试**。

真实 GEO 检测继续通过现有问题采集链执行。

---

# 5. 知识库逻辑结构

内部 canonical state 使用结构化 JSON。

DOCX、Markdown 或未来其他展示格式只是导出结果，不作为知识库主存储。

建议顶层结构：

```json
{
  "schemaVersion": 1,
  "clientId": "client-id",
  "businessType": "restaurant",
  "generatedAt": "2026-09-19T00:00:00Z",
  "updatedAt": "2026-09-19T00:00:00Z",

  "status": {},
  "profile": {},
  "offerings": [],
  "capabilities": [],
  "scenarios": [],
  "geoQuestions": [],
  "externalResearch": [],
  "restrictions": [],
  "sources": []
}
```

---

# 6. 核心数据模型

## 6.1 `businessType`

第一版不为餐饮、工业和服务企业建立不同 schema。

共用底层模型，通过：

```text
businessType
```

区分业务类型。

例如：

```text
restaurant
manufacturer
service
retail
other
```

具体枚举实施时按现有客户数据适度收敛，不为了覆盖所有行业建立庞大类型系统。

---

## 6.2 `profile`

描述“客户是谁”。

只保存基础客户信息，不保存泛化营销词。

示例：

```json
{
  "name": "XX川菜馆",
  "aliases": [],
  "category": "川菜",
  "location": "苏州工业园区",
  "address": "……",
  "serviceArea": ["苏州工业园区"],
  "contact": {
    "phone": null
  },
  "sourceIds": ["source-001"],
  "origin": "ai",
  "locked": false
}
```

工业客户同样使用该结构：

```json
{
  "name": "XX智能科技有限公司",
  "category": "视觉检测设备",
  "location": "苏州",
  "foundedYear": 2016,
  "serviceArea": ["全国"],
  "sourceIds": ["source-001", "source-002"]
}
```

没有的信息不强制填空。

---

## 6.3 `offerings`

统一表示客户对外提供的东西。

不要在底层分别建立：

- 产品
- 菜品
- 服务

统一使用：

```text
offerings
```

由 `type` 区分。

示例：

```json
{
  "id": "offering-001",
  "type": "dish",
  "name": "招牌烤鱼",
  "description": "……",
  "features": [],
  "targetAudience": [],
  "applicableScenarios": [],
  "priceInfo": null,
  "sourceIds": ["source-001"],
  "origin": "ai",
  "locked": false
}
```

工业客户：

```json
{
  "id": "offering-002",
  "type": "product",
  "name": "AOI视觉检测设备",
  "description": "用于工业视觉检测",
  "features": ["自动缺陷检测"],
  "targetAudience": ["新能源制造企业"],
  "applicableScenarios": ["电池外观检测"],
  "sourceIds": ["source-002"]
}
```

---

## 6.4 `capabilities`

保存“客户凭什么这么说”的证据性能力。

可以包括：

- 资质
- 专利
- 荣誉
- 技术能力
- 生产能力
- 服务能力
- 已确认案例
- 经营年限
- 可确认的专业背景

示例：

```json
{
  "id": "capability-001",
  "type": "qualification",
  "name": "ISO 9001",
  "description": "……",
  "sourceIds": ["source-010"],
  "origin": "ai",
  "locked": false
}
```

餐饮客户这一块可以非常少，甚至为空。

为空不是异常。

---

## 6.5 `scenarios`

描述：

> 谁，在什么情况下，可能需要这个客户的产品、服务或菜品。

示例：

```json
{
  "id": "scenario-001",
  "name": "朋友聚餐",
  "audience": "3-6人朋友聚餐",
  "need": "希望吃川菜或烤鱼",
  "relatedOfferingIds": ["offering-001"],
  "basis": "derived",
  "sourceIds": []
}
```

工业示例：

```json
{
  "id": "scenario-002",
  "name": "新能源电池外观检测",
  "audience": "新能源电池生产企业",
  "need": "自动发现外观缺陷",
  "relatedOfferingIds": ["offering-002"],
  "basis": "research",
  "sourceIds": ["source-020"]
}
```

`basis` 第一版仅需要：

```text
fact
research
derived
```

---

## 6.6 `geoQuestions`

这是 GEO 知识库最核心的数据之一。

知识库的目标不仅是“认识客户”，还要回答：

> 用户可能向豆包问什么？

建议结构：

```json
{
  "id": "geo-q-001",
  "question": "苏州工业园区有哪些适合朋友聚餐的川菜馆？",
  "intent": "local",
  "topic": "朋友聚餐",
  "relatedOfferingIds": ["offering-001"],
  "relatedScenarioIds": ["scenario-001"],
  "knowledgeCoverage": "partial",
  "researchId": null,
  "articleIds": []
}
```

当该问题后来进入现有问题采集链后：

```text
researchId
```

可以关联现有 `research-store` 中真实的豆包回答。

不应在知识库对象中复制完整 research answer，避免两个 owner。

---

## 6.7 GEO 问题意图

第一版保持简单。

建议六类：

```text
brand
category
selection
scenario
local
comparison
```

对应：

- 品牌 / 主体
- 品类
- 怎么选
- 使用 / 消费场景
- 地域
- 对比

例如餐饮：

```text
XX川菜馆怎么样？
苏州有哪些川菜馆？
朋友聚餐怎么选餐厅？
苏州工业园区适合聚餐的川菜馆有哪些？
川菜和烤鱼哪种更适合多人聚餐？
```

例如工业：

```text
XX自动化怎么样？
AOI视觉检测设备有哪些？
AOI设备怎么选？
新能源电池外观检测用什么设备？
苏州有哪些AOI设备厂家？
AOI检测和人工检测有什么区别？
```

第一版每个客户建议生成约：

```text
20 ~ 40 个核心 GEO 问题
```

这是默认目标范围，不是硬性业务规则。

---

## 6.8 `externalResearch`

保存客户事实之外的行业、地域、品类、应用知识。

示例：

```json
{
  "id": "research-item-001",
  "topic": "AOI在新能源制造中的应用",
  "summary": "……",
  "sourceIds": ["source-030", "source-031"],
  "relatedScenarioIds": ["scenario-002"]
}
```

其主要用途：

- 场景理解
- GEO 问题生成
- 文章选题
- 文章背景知识

不能直接冒充客户事实。

---

## 6.9 `restrictions`

集中保存不能直接用于确定性生成的内容。

建议第一版类型：

```text
unknown
conflict
forbidden_claim
internal_only
volatile
```

示例：

```json
{
  "id": "restriction-001",
  "type": "unknown",
  "content": "是否提供包间尚未确认",
  "sourceIds": []
}
```

```json
{
  "id": "restriction-002",
  "type": "volatile",
  "content": "菜单价格可能变化，引用前应确认最新信息"
}
```

```json
{
  "id": "restriction-003",
  "type": "conflict",
  "content": "营业时间存在冲突",
  "candidates": [
    "10:00-22:00",
    "11:00-21:30"
  ],
  "sourceIds": ["source-001", "source-021"]
}
```

---

## 6.10 `sources`

所有证据统一登记在一个 source registry 中。

客户文件示例：

```json
{
  "id": "source-001",
  "type": "client_file",
  "title": "门店介绍.docx",
  "materialId": "material-id",
  "fileName": "门店介绍.docx"
}
```

公开网页示例：

```json
{
  "id": "source-002",
  "type": "official_web",
  "title": "XX公司官网",
  "url": "https://example.com",
  "fetchedAt": "2026-09-19T00:00:00Z"
}
```

第一版 source type 建议：

```text
client_file
official_web
authority
industry
media
third_party
```

不做数值可信度评分。

---

# 7. 不建立独立巨大 `facts[]`

第一版不建议再增加一个与 `profile`、`offerings`、`capabilities` 平行的巨大事实数组。

否则容易出现：

```text
profile.location = 苏州
```

同时又有：

```text
facts = “公司位于苏州”
```

形成两份事实 owner。

原则：

> 事实直接存入其业务所属对象，通过 `sourceIds` 指向证据。

只有无法合理归入现有对象的原子信息，未来才考虑增加补充事实容器。

---

# 8. 豆包 AI 研究流程

第一版直接使用豆包 / 火山方舟 API。

当前方向：

> 火山方舟 Responses API + Web Search

第一版不做通用多模型研究平台。

不为了未来可能使用 Gemini、OpenAI、Claude 等平台，提前建立复杂 Provider 体系。

可以在代码边界上保持一个很薄的豆包 client/service，但业务命名直接面向当前真实需求。

---

## 8.1 阶段一：客户资料事实提取

输入：

- 当前客户基本信息
- 客户原始资料

资料来源直接复用现有 `client-material-store`。

当前已有能力支持：

- `.txt`
- `.md`
- `.markdown`
- `.json`
- `.docx`

并已经存在 `contentHash` 与 DOCX 转换缓存能力。

### AI 任务

只回答：

> 客户资料明确告诉了我们什么？

禁止：

- 联网补充
- 常识补充
- 逻辑猜测
- 营销扩写

输出：

- profile candidate
- offerings
- capabilities
- 明确案例
- 明确场景
- unknown / restrictions

每项保留原始材料引用。

---

## 8.2 阶段二：生成研究计划

输入：

- 已提取客户事实
- 客户类型
- 已有产品 / 服务 / 菜品
- 当前明显缺口

AI 输出有限的研究任务。

第一版建议：

```text
最多约 8 ~ 12 个研究任务
最多 2 轮研究
```

研究任务只处理两类：

```text
client
industry
```

### `client`

研究客户本身：

- 官方信息
- 门店 / 企业公开信息
- 产品
- 资质
- 案例
- 服务区域
- 可确认的经营信息

### `industry`

研究：

- 品类知识
- 行业知识
- 使用 / 消费场景
- 用户选择因素
- 地域相关背景

GEO 问题真实回答检测不属于这一步。

---

## 8.3 阶段三：豆包联网研究

每个 research task 单独调用豆包 Web Search。

避免把全部任务一次塞进一个超级 Prompt。

研究输出包括：

```json
{
  "findings": [],
  "unresolved": []
}
```

单条 finding 至少包括：

```json
{
  "statement": "……",
  "category": "client_fact",
  "sources": [
    {
      "title": "……",
      "url": "https://..."
    }
  ]
}
```

### 来源硬规则

外部信息如果没有可靠引用：

> 不能直接进入确定客户事实。

可进入：

- candidate
- derived
- unresolved

---

## 8.4 阶段四：知识库整理与 GEO 问题生成

最终 AI 不再直接处理大量原始网页。

输入应该主要是：

- 客户资料事实提取结果
- 联网 research findings
- sources
- unresolved
- conflicts
- restrictions

AI 输出：

- `profile`
- `offerings`
- `capabilities`
- `scenarios`
- `externalResearch`
- `restrictions`
- `geoQuestions`

程序补充：

- ID
- 时间戳
- source registry
- clientId
- schemaVersion
- lock 状态
- 保存状态

---

# 9. GEO Research 与 Knowledge Research 分开

必须区分：

## Knowledge Research

目标：

> 搞清楚客户、产品、行业和场景。

在“生成知识库”时自动执行。

## GEO Research

目标：

> 用户向豆包问一个真实问题时，豆包当前如何回答？

不在首次知识库生成时自动把几十个问题全部查询。

用户选择 GEO 问题后，通过现有问题采集链执行。

这样可以：

- 控制 API 调用量
- 避免知识生成与 GEO 检测混为一体
- 直接复用现有 `research-store`
- 保留当前成熟问题采集链

---

# 10. 与现有 `research-store` 的关系

现有 `research-store` 继续拥有：

```text
question
answerText
references
collectionMethod
collectedAt
updatedAt
```

其语义保持：

> 一个真实问题的一次研究 / 回答结果。

不要把客户 GEO 知识库塞入现有 `research-store`。

新知识库只通过：

```text
geoQuestion.researchId
```

或等价关系引用现有 research record。

这样两边职责清楚：

```text
geo-knowledge-store
    ↓ 生成问题
research-store
    ↓ 保存豆包真实回答
```

---

# 11. 知识库更新规则

第一版不做复杂版本树和审批流。

只解决三个真实问题：

1. 客户补充新资料
2. 豆包重新研究
3. 人工修改不能被覆盖

---

## 11.1 `origin`

主要知识对象增加：

```text
origin
```

第一版：

```text
ai
manual
```

---

## 11.2 `locked`

用户人工修改并保存后：

```text
locked = true
```

重新研究时：

> AI 不得自动覆盖 `locked = true` 的对象。

---

## 11.3 重新生成 / 重新研究

规则：

### 人工锁定

永远保留。

### AI 新增知识

允许加入。

### 旧 AI 内容出现新证据

允许更新未锁定内容。

### 来源冲突

不直接覆盖，进入 `restrictions: conflict`。

### 本轮没搜到旧内容

不自动删除旧内容。

“没找到”不等于“已经失效”。

---

## 11.4 客户资料变化

现有 `client-material-store` 已提供 `contentHash`。

后续可以利用 hash 判断资料变化。

但第一版不需要开发复杂增量更新引擎。

第一版可直接采用：

> 重新生成 / 重新研究未锁定内容，同时保留人工锁定项。

后续实际出现明显性能问题，再增加精准增量更新。

---

# 12. 页面设计

建议页面位于：

```text
内容生产 → 客户知识库
```

不增加顶级导航。

---

## 12.1 顶部概览

显示：

```text
客户名称
知识库状态
客户资料数量
上次研究时间
GEO问题数量
冲突数量
人工锁定数量
```

主要按钮：

首次：

```text
生成知识库
```

已有知识库：

```text
重新研究
编辑
导出
```

---

## 12.2 客户知识

展示：

- 基础信息
- 产品 / 菜品 / 服务
- 能力与证据
- 场景

普通用户不直接操作 JSON。

---

## 12.3 GEO 问题

建议表格字段：

| 字段 | 含义 |
|---|---|
| GEO 问题 | 用户可能向豆包提出的问题 |
| 类型 | brand / category / selection / scenario / local / comparison |
| 知识覆盖 | enough / partial / insufficient |
| 客户是否出现 | 实际 GEO research 后得到 |
| 最近检测 | 最近一次豆包查询时间 |
| 文章 | 已生成 / 已发布关联数量 |

点击问题可查看：

- 豆包当前回答
- 引用来源
- 关联客户知识
- 关联产品 / 菜品 / 服务
- 关联文章

---

## 12.4 来源与研究

显示：

- 客户资料
- 官方来源
- 权威来源
- 行业资料
- 新闻 / 媒体
- 第三方公开网页

主要用于查证。

---

## 12.5 待确认

集中显示：

- 冲突
- 缺失
- 易变信息
- 人工锁定项
- 未完成 research task

不建立审批系统。

---

# 13. 与问题采集链的衔接

知识库不替代现有问题采集。

链路升级为：

```text
客户资料
    ↓
客户 GEO 知识库
    ↓
GEO 问题池
    ↓
用户选择问题
    ↓
现有问题采集
    ↓
豆包真实回答
    ↓
research-store
```

知识库负责：

> 问题从哪里来。

现有采集链负责：

> 豆包现在怎么回答。

---

# 14. 与文章生成的衔接

未来文章生成输入升级为：

```text
目标 GEO 问题
+
该问题对应的客户知识
+
相关产品 / 服务 / 菜品
+
相关场景
+
相关能力 / 案例
+
外部研究
+
restrictions
+
豆包当前回答（如已采集）
```

不要每次把整个客户知识库塞给模型。

第一版不需要向量数据库。

直接根据：

```text
relatedOfferingIds
relatedScenarioIds
```

和问题 intent 做相关知识选择即可。

---

# 15. 文章与 GEO 问题关联

`geoQuestions` 可以保存：

```text
articleIds
```

从而形成：

```text
GEO问题
↓
生成了哪些文章
↓
哪些文章已发布
↓
豆包目前是否提到客户
```

最终形成 AutoPublish 的 GEO 闭环：

```text
客户资料
↓
客户知识库
↓
GEO问题
↓
豆包采集
↓
发现知识 / 内容缺口
↓
文章生成
↓
发布
↓
未来重新检测
```

第一版不自动周期复测。

先保留人工触发。

---

# 16. 豆包 API 配置

第一版围绕真实业务目标直接使用豆包 / 火山方舟。

设置中增加轻量配置即可。

建议业务名称：

```text
豆包 GEO
```

必要配置：

- 接口 / Base URL：Coding Plan（`https://ark.cn-beijing.volces.com/api/coding/v3`）或标准方舟（`https://ark.cn-beijing.volces.com/api/v3`），仅允许这两个可信地址
- API Key
- 模型 / Endpoint ID（以实际方舟接口要求为准）
- 联网搜索启用状态

新配置默认 Coding Plan；旧配置保留标准地址，用户显式切换后才改变请求路由。标准地址不使用 Coding Plan 套餐额度，页面须提示额外计费风险。保存只落本机加密配置，不调用接口。

请求使用所选地址的 `/responses`，不自动回退其他计费接口。Responses 协议支持不代表联网工具权限或套餐用途已确认；真实验收前保持未验证状态。接口拒绝或联网回复没有可核验引用时明确报错、停止后续研究，不将无引用回复当作联网成功。

设置页提供独立的“测试连接”和“测试联网搜索”，仅使用已保存配置、固定无客户内容的文本，每次一个请求；测试会消耗 API 用量，应在按钮旁告知。连接成功只证明 Responses 调用成功；联网成功必须返回可核验引用。测试不持久化能力结论，不自动重试；测试与配置保存/知识生成互斥，销毁服务取消未完成测试。401、403、能力拒绝和结果不确定使用安全分类提示，不展示服务商原始错误或密钥。

第一版不暴露：

- temperature
- top_p
- 搜索深度
- Agent 参数
- 最大网页数
- 高级采样参数

内部使用合理默认值。

---

# 17. 不做通用 AI Provider 重构

第一版不因为新增知识库，就重构 AutoPublish 全部 AI 能力。

不做：

```text
UniversalAIProvider
├─ OpenAI
├─ Gemini
├─ Claude
├─ Doubao
└─ Browser
```

当前直接建立知识库所需的豆包调用边界。

未来真正出现第二个 GEO 平台需求，再提取 provider interface。

---

# 18. Playwright 的定位

第一版知识库研究：

> **不使用 Playwright 作为默认网页研究方式。**

联网研究直接由豆包 / 火山方舟 Web Search 执行。

Playwright 继续用于当前真正需要浏览器交互的业务：

- 浏览器投稿
- 必须使用网页 UI 的现有采集
- 登录态页面
- 其他自动化交互

以后如果实际证据证明豆包 Web Search 存在关键网站无法读取的问题，再考虑增加浏览器 fallback。

不提前开发。

---

# 19. 失败与降级策略

“知识不足”与“系统失败”必须区分。

---

## 19.1 不属于失败

以下情况知识库仍然可以生成：

- 没有官网
- 没找到案例
- 没有价格
- 没有资质
- 小餐饮资料很少
- 某些 research task 无结果
- 部分网页无可靠来源
- 某些 GEO 领域知识不足
- 少量 AI research task 失败

例如：

```text
8 个 research task
6 个成功
2 个失败
```

结果：

> 知识库生成成功，部分研究未完成。

---

## 19.2 真正失败

只有以下类型应阻塞整个生成：

- 客户不存在
- 工作区不可写
- 豆包 API 配置完全不可用
- 所有关键 AI 调用均无法执行
- 最终知识库无法保存
- 数据边界 / 路径安全异常

---

## 19.3 JSON / schema 输出异常

建议：

```text
自动重试 1 次
```

仍失败：

- 单 research task：跳过，标记失败
- 最终 synthesis：生成流程失败，不保存损坏知识库

禁止无限重试。

---

# 20. 生成进度

前端只显示业务阶段：

```text
正在读取客户资料
正在提取客户事实
正在制定研究计划
正在联网研究 3 / 8
正在整理客户知识
正在生成 GEO 问题
正在保存知识库
完成
```

不要暴露：

- Agent 1
- Agent 2
- Chain of Thought
- Tool invocation
- Reasoning token
- 内部模型步骤

---

# 21. 推荐代码边界

第一版建议新增极少数明确 owner。

示意：

```text
src/content/
├─ geo-knowledge-application.js
├─ geo-knowledge-research.js
└─ geo-knowledge-store.js

src/ai/ 或现有 AI 边界/
└─ doubao-geo-client.js
```

具体目录在实施前按当前项目实际结构确认，不为了匹配本设计强行迁移现有模块。

---

## 21.1 `geo-knowledge-application`

职责：

- `generate(clientId)`
- `regenerate(clientId)`
- `updateManualEdits(...)`
- 协调材料、AI research、store
- 汇总业务进度
- 执行锁定合并规则

不负责：

- 直接文件解析
- 直接 HTTP 存储
- UI
- 投稿

---

## 21.2 `geo-knowledge-research`

职责：

- 调用豆包完成事实提取
- 生成研究计划
- 执行 Web Search research
- 解析 research findings
- 生成最终结构化知识

不负责：

- workspace path
- 知识文件 owner
- 人工锁定持久化

---

## 21.3 `geo-knowledge-store`

职责：

- 一客户一份当前有效知识库
- schema 校验
- 原子保存
- 加载
- 手工修改保存
- lock 状态
- 基础 metadata

不负责：

- `research-store` 的真实问题回答
- 客户原始资料
- article lifecycle

---

# 22. 现有模块复用原则

## `client-material-store`

直接复用。

已有：

- 文本资料读取
- DOCX 提取
- 内容 hash
- 转换缓存
- path boundary

不要新建第二套资料读取器。

---

## `research-store`

保持现有语义。

继续负责：

> 某个具体问题的豆包实际回答与引用来源。

不要扩展成客户知识库数据库。

---

## `client-knowledge`

继续承担当前客户身份和既有知识边界。

不要为了 GEO 知识库，把全部新逻辑继续堆入该模块。

---

# 23. 存储位置原则

新增知识库必须拥有独立 storage owner。

不要直接：

- 塞入 `research/`
- 塞入 article 数据
- 与客户原始资料文件混写
- 复用某个无关 JSON 文件

实施时应在当前 workspace path 体系中增加正式 GEO knowledge path，并保持：

- workspace boundary
- path policy
- atomic write
- clientId 隔离

具体物理目录名在编码阶段依据当前 `workspace-paths` / storage migration 规则确定。

---

# 24. 第一版 Prompt 合约

不在设计文档中绑定完整 Prompt 文案，但必须约束职责。

---

## 24.1 Material Fact Extraction Prompt

原则：

> 只提取资料明确表达的信息。

要求：

- 不联网
- 不推测
- 不补行业常识
- 不写营销话术
- 每条结果关联 material ID
- 未知即省略或标为 unknown

---

## 24.2 Research Planning Prompt

输入：

- 当前事实
- 客户类型
- 信息缺口

输出：

- 有限、优先级明确的 research tasks
- 每项 task 有 topic、purpose、queries
- 不直接生成事实

---

## 24.3 Web Research Prompt

要求：

> 只记录当前联网研究能找到公开来源支持的信息。

必须：

- 提供引用来源
- 区分客户事实与行业知识
- 无结果时返回 unresolved
- 不为了填满字段而猜测

---

## 24.4 Synthesis Prompt

要求：

- 只使用输入中已有证据与研究
- conflict 不得变成确定事实
- derived 场景必须保持 derived
- 禁止无证据的“领先、第一、顶尖”等描述
- 生成有限、真实、有内容价值的 GEO 问题
- 不通过重复改写凑问题数量

---

# 25. 小餐饮客户适配示例

客户只提供：

```text
店名：XX川菜馆
位置：苏州工业园区
主营：川菜、烤鱼
一份菜单
```

系统仍然可以生成：

### profile

- 店名
- 所在地区
- 菜系

### offerings

- 已确认菜单菜品
- 套餐
- 招牌信息（有证据才写）

### scenarios

- 朋友聚餐（derived）
- 多人用餐（derived）
- 川菜消费（research / derived）

### externalResearch

- 用户选择川菜馆常见关注因素
- 区域餐饮消费相关背景

### geoQuestions

- 苏州工业园区有哪些川菜馆？
- 工业园区哪里适合吃烤鱼？
- 苏州工业园区朋友聚餐吃什么？
- 川菜馆怎么选？
- 烤鱼适合几个人吃？

### restrictions

- 是否有包间未知
- 当前营业时间未知
- 菜品价格属于易变信息

该客户依然可以继续文章生产。

---

# 26. 工业客户适配示例

客户资料：

- 企业介绍
- 产品 DOCX
- 产品参数
- 资质
- 案例

知识库可形成：

### profile

- 企业基本信息

### offerings

- AOI设备
- 视觉检测方案

### capabilities

- 资质
- 技术能力
- 实际案例

### scenarios

- 新能源电池检测
- 汽车零部件外观检测

### geoQuestions

- 苏州有哪些AOI设备厂家？
- AOI视觉检测设备怎么选？
- 新能源电池外观检测用什么设备？
- AOI检测和人工检测有什么区别？
- AOI设备适合哪些工厂？

同一底层数据模型即可覆盖。

---

# 27. 第一版明确不做

为了控制复杂度，第一版明确不做：

- 向量数据库
- 知识图谱
- 通用 RAG 平台
- 多 Agent
- 自动爬虫平台
- Playwright 全网研究
- 多 AI 平台适配
- 自动定时重爬
- 自动周期 GEO 复测
- 复杂历史版本树
- Git 式知识 diff
- 多人审批
- 知识可信度百分制
- 完整度百分制
- 为每个行业单独设计 schema
- 一次生成数百个 GEO 问题
- 为了“未来扩展”提前建立巨大抽象层

---

# 28. 第一版验收目标

第一版完成后，应能够选取一个真实客户完成以下闭环：

```text
读取客户现有资料
↓
豆包提取明确客户事实
↓
豆包生成有限研究计划
↓
豆包 Web Search 自动研究
↓
保存来源
↓
生成结构化客户知识库
↓
生成 20~40 个核心 GEO 问题
↓
用户选择问题进入现有问题采集
↓
现有 research-store 保存豆包实际回答
↓
文章生成能按问题读取相关客户知识
```

同时满足：

- 客户资料很少时仍可生成
- 外部研究不冒充客户事实
- 每个外部确定事实可追溯来源
- 单个研究任务失败不拖垮整个知识库
- 人工修改可锁定
- 重新研究不覆盖人工锁定项
- 不引入向量库、多 Agent、Playwright research 等非必要复杂度

---

# 29. 推荐实施拆分

为避免一次改动范围过大，建议实施时拆成独立阶段。

## K1：知识库存储与材料事实提取

完成：

- GEO knowledge schema
- `geo-knowledge-store`
- 复用 client material store
- 豆包基础 API 配置
- material fact extraction
- 最小保存 / 读取

不联网研究。

---

## K2：豆包联网研究

完成：

- research planning
- Responses API Web Search
- source 保存
- partial failure
- knowledge synthesis

不接文章生成。

---

## K3：知识库 UI 与人工修改

完成：

- 客户知识库页面
- 生成 / 重新研究
- 知识查看
- 来源查看
- 待确认
- 人工编辑 / lock

---

## K4：GEO 问题与现有采集衔接

完成：

- GEO question generation
- 问题列表
- 选择问题加入现有采集
- `researchId` 关联
- 当前豆包回答 / 来源展示

---

## K5：文章生成接入

完成：

- 根据 GEO question 选择相关知识
- 将 offerings / scenarios / capabilities / restrictions 注入生成上下文
- article ↔ geoQuestion 关联
- 不把整个知识库无差别塞入模型

---

## K6：集成验证与收口

使用至少：

- 1 个资料充分的工业客户
- 1 个资料较少的小餐饮 / 本地门店客户

真实跑通：

```text
资料 → 知识库 → GEO问题 → 豆包采集 → 文章生成
```

确认：

- 数据 owner 清楚
- 不重复存储 research answer
- 来源可追踪
- 小资料客户不被阻塞
- 更新与 lock 行为稳定
- 没有为了知识库引入无必要的架构层

---

# 30. 最终设计结论

AutoPublish 的客户 GEO 知识库应当是：

> **一份由客户资料作为事实基础、由豆包联网研究补充行业和公开信息、以来源可追溯为约束、最终服务于 GEO 问题发现和文章生产的结构化客户知识。**

系统的核心链路最终变为：

```text
客户资料
    ↓
客户 GEO 知识库
    ↓
GEO 问题
    ↓
豆包真实回答采集
    ↓
发现内容缺口
    ↓
文章生成
    ↓
发布
    ↓
未来重新检测
```

第一版优先把真实 GEO 业务闭环跑通。

**不把它做成一个通用知识工程平台。**

---

## 31. 当前已确认的关键决策

- [x] 客户资料少也可以生成
- [x] 餐饮、工业、服务企业共用底层模型
- [x] 客户事实 / 外部研究 / AI推导分层
- [x] 内部 canonical format 为结构化 JSON
- [x] GEO 问题属于知识库核心内容
- [x] 豆包 / 火山方舟作为第一版研究 AI
- [x] 第一版优先使用 Responses API + Web Search
- [x] Playwright 不作为知识研究默认方案
- [x] Knowledge Research 和 GEO Research 分开
- [x] 首次生成不自动查询全部 GEO 问题
- [x] GEO 真实回答继续复用现有问题采集和 `research-store`
- [x] 人工修改允许锁定
- [x] 重新研究不覆盖人工锁定内容
- [x] 单任务失败允许部分成功
- [x] 第一版不做自动周期 GEO 复测
- [x] 第一版不做向量库、知识图谱、多 Agent
- [x] 不新增顶级导航
- [x] 不因为该功能重构整个 AI 架构

---

**本文件作为后续 GEO 客户知识库实施、代码审查和验收的产品与技术设计基线。**

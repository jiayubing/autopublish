# AutoPublish GEO 客户知识库 V2 增量实施计划 v2.1（精简修订版）

**状态：** 产品方向与技术范围已收口，可进入增量开发  
**目标分支：** `codex/geo-knowledge-base`  
**审阅基线 HEAD：** `1c7688430f450591b2e917aa1092e5468647de66`  
**适用场景：** 少量用户、本地单机 Electron 应用  
**日期：** 2026-09-20

---

## 1. 目标与实施原则

当前分支已经完成 GEO 客户知识库 V1，包括 JSON store、revision、原子写入、客户材料提取、Doubao Responses/Web Search、知识整理、Renderer 页面、人工编辑锁定、GEO 问题采集关联、文章知识选择和 `knowledgeSnapshot`。

V2 不重新实现这些能力，只解决三个问题：

1. 研究重点从泛行业资料转向客户实体本身；
2. Profile 从整对象来源升级为字段级证据和简单冲突处理；
3. 新知识继续通过现有 generation context 为文章生成提供有界、可归因的上下文。

本阶段按当前真实规模设计：少量用户、本地单机、单应用进程。优先选择简单、可验证的实现，不建设多人协作、复杂审批、通用迁移框架或完整证据图谱。

---

## 2. 保持不变的 owner

- `geo-knowledge-store`：客户 GEO knowledge canonical JSON 的唯一 writer。
- `geo-knowledge-research`：材料提取、研究规划、Web Search、citation 和 synthesis。
- `geo-knowledge-application`：同客户运行互斥、取消、进度、Prompt snapshot 和保存编排。
- `research-store`：真实 GEO 问题回答与 references 的唯一 owner。
- `geo-generation-context`：Article Brief 等价的文章知识选择 owner。
- Article `knowledgeSnapshot`：保存文章生成时实际使用的知识，不随知识库更新而变化。

V2 不新增 SQLite knowledge DB、向量库、通用 facts DB、Article Brief store 或 research answer store。

---

## 3. V1 数据处理

V1 knowledge 不迁移、不参与 V2 merge。旧 article `knowledgeSnapshot.version === 1` 是独立合同，继续可读，不批量改写。

### 3.1 读取状态

`geo-knowledge-store` 增加轻量检查：

```text
missing       没有 knowledge 文件
legacy_v1     合法 JSON，schemaVersion === 1
current_v2    合法 schemaVersion === 2
invalid       JSON 损坏、未知版本或不满足对应基本结构
```

- `load()` 只返回通过 V2 validator 的 knowledge。
- `legacy_v1` 在页面显示“旧版知识库需要重新研究”，不作为有效知识使用。
- `invalid` 显式报错，不得当作 V1 自动覆盖。

### 3.2 安全替换

用户点击“生成新版知识库”后：

1. 从当前客户资料重新研究；
2. 不读取 V1 knowledge 作为研究输入；
3. 研究结果完整通过 V2 schema；
4. 保存前再次确认现有文件仍是 `schemaVersion: 1`；
5. 使用现有原子 writer 覆盖为 V2 revision 1。

同客户运行互斥继续生效。当前阶段不增加文件哈希 token、迁移日志或通用 migration framework。

如果研究、schema validation 或原子写入失败，原 V1 文件保持不变。

---

## 4. V2 顶层 schema

```json
{
  "schemaVersion": 2,
  "clientId": "client-id",
  "revision": 1,
  "businessType": "service",
  "generatedAt": "...",
  "updatedAt": "...",
  "status": {"outcome": "complete", "warnings": []},
  "profile": {},
  "onlinePresence": [],
  "history": [],
  "offerings": [],
  "capabilities": [],
  "cases": [],
  "scenarios": [],
  "recommendationAngles": [],
  "competitors": [],
  "geoQuestions": [],
  "externalResearch": [],
  "restrictions": [],
  "sources": []
}
```

继续保留当前文档 4 MB 上限、每 section 最多 500 项、source 最多 500 项。V2 不增加通用 `facts[]`。

---

## 5. 通用知识项合同

除 Profile claim 和 Source 外，知识项继续使用现有公共字段：

```json
{
  "id": "section-...",
  "identity": "stable semantic identity",
  "name": "名称",
  "description": "描述",
  "basis": "fact",
  "origin": "ai",
  "locked": false,
  "sourceIds": [],
  "relatedOfferingIds": [],
  "relatedScenarioIds": []
}
```

约束：

- `id` 继续由程序根据 section + identity 生成；模型不能输出 ID。
- `identity/name` 最大 2000 字符，`description` 最大 12000 字符。
- `sourceIds`、关系数组去重，每项最多 100 个引用。
- relation 必须指向当前文档中真实存在的 offering/scenario，禁止 dangling ID。
- 本轮没有发现旧对象时不自动删除；stable identity 相同时保留稳定 ID。

### 5.1 新 section

`onlinePresence` 额外字段：

```text
platform：必填字符串，最大 100 字符
url：必填安全 http/https URL，最大 2000 字符
```

identity 使用 `platform + normalized name + normalized url`。

`onlinePresence.sourceIds.length >= 1`，且 `url` 必须通过安全 URL 校验。

`history` 额外字段：

```text
dateText：可选字符串，最大 200 字符
```

identity 使用稳定事件名称；第一版不解析时间精度，不建立时间轴数据库。

`history.sourceIds.length >= 1`。

`cases` 使用通用字段，至少有一个 source。identity 使用稳定案例/事件名称。

`recommendationAngles` 使用通用字段，固定 `basis=derived`，允许 sourceIds 为空，但 `relatedOfferingIds` 与 `relatedScenarioIds` 至少一个非空。第一版以现有 relation 表达推导依据，不增加 evidence graph。

`competitors` 使用通用字段，至少有一个 source。description 只记录公开资料支持的定位、强项和与客户的客观差异，不编造竞对缺点。

validator 必须直接验证：`onlinePresence/history/cases/competitors` 至少一个 source；`recommendationAngles` 至少一个 offering/scenario relation。模型输出不满足时按 schema 错误处理，不能把无证据对象写入 canonical knowledge。

---

## 6. Profile claims

`profile.claims` 是 Profile 字段事实唯一真源；`profile.fields` 只是 UI 和 generation 使用的持久投影。

### 6.1 Claim 合同

```json
{
  "id": "claim-...",
  "field": "businessHours",
  "value": "10:00-22:00",
  "status": "accepted",
  "basis": "fact",
  "origin": "ai",
  "locked": false,
  "sourceIds": ["source-a"]
}
```

`status`：`accepted | candidate | rejected`。  
`basis`：`fact | research | derived | candidate`。

`accepted` 只表示当前采用，不等于 `fact`。

AI 自动生成或 merge 后成为 accepted 的 claim，basis 只允许 `fact` 或 `research`。`derived` 和 `candidate` claim 不允许被 AI 自动设置为 accepted。

### 6.2 Projection invariant

- 每个 field 最多一个 accepted claim。
- `profile.fields[field]` 必须严格等于 accepted 且 basis 为 `fact/research` 的 claim value。
- 没有 accepted claim 时，该字段不得存在于 `profile.fields`。
- accepted claim 的 basis 必须是 `fact` 或 `research`；derived/candidate claim 不得进入 canonical fields。
- validator 在每次保存前验证 claims 与 fields 一致。
- Article Brief 逐 claim 判断 basis，不再使用整个 `profile.basis` 判断。

如果为兼容内部公共结构暂时保留 profile 顶层 `basis/sourceIds/locked`，它们只能是程序计算的投影，不是第二套事实来源。

### 6.3 去重与锁定

AI observation 的去重键为 `field + normalizedValue`。normalize 只做 NFKC、trim 和连续空白折叠。人工确认生成的 manual claim 使用独立的程序 ID，并绑定新建的 `client_input` source，因此允许它与原 AI observation 拥有相同 field/value 而 provenance 不同。

- AI 再次发现同字段同 normalized value：合并原 AI observation 的 sourceIds，不创建第二条 AI observation。
- 同字段不同值：创建 candidate claim，并创建/打开 conflict。
- AI 输入为 `fact/research` 时，程序才允许在没有现有 canonical 值的字段上创建 accepted claim；AI 输入为 `derived/candidate` 时只能创建 candidate observation。
- merge 不得把 derived/candidate observation 提升为 accepted，也不得通过覆盖旧对象绕过该限制。
- 人工确认只锁 accepted claim，不锁整个 profile。
- locked accepted claim 不允许自动替换，但后续仍可发现和保存不同 candidate。

用户人工确认一个原本的 candidate 值时，不修改原 candidate 的 basis/status。store 创建一条新的 `client_input + manual + fact + accepted + locked` claim，原 candidate observation 继续保留；新 claim 与原 observation 可以拥有相同 value，但 ID 和 provenance 不同。

---

## 7. Source 与事实强度

支持的 source type：

```text
client_file
client_input
client_public
official_web
authority
platform
industry
media
third_party
```

程序拥有 source ID、URL、title、fetchedAt、materialId、contentHash 和 canonical type。模型只能引用程序登记的 source ID，不能创建 URL 或直接修改 source type。

### 7.1 简单 basis 上限

```text
client_file   → fact | candidate
client_input  → fact
client_public → research | candidate，并要求文章归因
official_web  → fact | research | candidate
authority     → fact | research
platform      → research | candidate
media         → research | candidate
third_party   → research | candidate
industry      → research
无来源         → derived | candidate
```

AI 可以提出 basis，但程序必须按 source 上限降级。官网中的营销排名、第一、领先、客户数量、效果百分比等，没有独立证据时仍降为 candidate/restriction。

### 7.2 Source 识别

- 客户资料或人工输入明确提供的官网 URL，可登记为 `official_web`。
- 客户资料明确提供的账号 URL，可登记为 `client_public`。
- 已知地图/POI/点评 host 可登记为 `platform`。
- 受信政府/监管 host 可登记为 `authority`。
- AI 搜到但无法确认归属的账号、网站统一保守登记为 `third_party` 或 `platform`。

V2 第一版不建设“确认官网/账号归属”审批状态机，只提供下述直接修改 canonical source type 的轻量确认动作。

### 7.3 最小人工来源确认

现有 `geo-knowledge-store` owner 增加一个轻量 command，用于确认 AI 已发现 URL 的角色：

```text
confirmSourceType(clientId, revision, sourceId, targetType)
```

第一版只允许：

```text
third_party            → official_web
third_party | platform → client_public
```

command 必须：

- 读取当前 V2 knowledge，并使用现有 revision/stale write 防护；
- 要求 source 已存在，且 URL 再次通过 safeUrl；
- 只更新同一 canonical source，不创建第二个 source owner 或审批记录；
- 原子保存 source type 变化；
- 不修改 claim value，不删除 observation，不把 candidate 直接改成 accepted/fact；
- 按新的 source type 重新验证依赖该 source 的 claim 是否仍符合 basis 上限；后续 research/merge 可以在新上限内重新评估 basis；
- targetType 为 `client_public` 时，Article Brief 仍派生 `attributionRequired=true`。

source type 更新本身不解决或关闭现有 conflict。后续 merge 如产生不同 canonical 值，继续使用现有简单 conflict 规则。

### 7.4 URL 安全

所有 `source.url` 和 `onlinePresence.url` 必须使用现有 `safeUrl` 等价校验：仅 http/https、禁止内嵌账号密码、限制长度。

### 7.5 客户公开自述归因

当被选知识仅由 `client_public` 支持，没有更强证据时，generation context 派生：

```text
attributionRequired = true
```

现有文章 Prompt 增加一条最小规则：这类信息必须使用“据该客户公开账号介绍”“根据该门店公开内容”等归因表达，不得写成独立第三方结论。

---

## 8. 简单冲突合同

Conflict 继续使用 `restrictions` owner，不增加独立 conflict store。

```json
{
  "id": "restrictions-...",
  "identity": "profile:businessHours",
  "name": "营业时间存在冲突",
  "description": "存在多个不同值，请人工确认。",
  "type": "conflict",
  "basis": "candidate",
  "origin": "ai",
  "locked": false,
  "sourceIds": ["source-a", "source-b"],
  "relatedOfferingIds": [],
  "relatedScenarioIds": [],
  "target": {"section": "profile", "field": "businessHours"},
  "claimIds": ["claim-a", "claim-b"],
  "conflictStatus": "open",
  "resolution": null
}
```

同一 profile field 始终复用 `identity=profile:<field>` 的 conflict ID。

### 8.1 裁决

支持采用 A、采用 B、手工填写。一次 store command 原子完成：

1. 选择值变 accepted、locked；
2. 其他不同值变 rejected；
3. 更新 profile.fields；
4. conflict 变 resolved 并保存 acceptedClaimId/resolvedAt；
5. rejected claims 和来源不删除。

手工填写创建 `client_input + manual + fact + accepted + locked` claim。

### 8.2 简化 reopen

- 再次发现与 accepted 相同的值：只合并来源。
- 再次发现任何不同值：保存/合并 candidate，并把 conflict 重新设为 open。

第一版不区分证据等级、易变字段、第三个值或来源失效等复杂 reopen 矩阵。少量重复提醒可以接受。

---

## 9. 客户实体优先的两轮研究

保留现有 `extract → enrich → synthesis`，只升级 enrich。

### 9.1 第一轮：Customer Entity Discovery

优先研究正式名称、品牌/门店/宣传名、别名、地址/商圈、官网和公开账号、产品/服务/菜品、品牌合作、授权、公开案例和历史事件。

预算：total tasks ≤ 6，每 task 最多 3 个 query，generic industry tasks ≤ 1。第一轮核心任务必须是 Customer Entity Discovery。

第一轮 planner 输出必须由程序 validator 检查 task 总数、每 task query 数和 generic industry task 数；不满足时属于 schema 错误，不能仅依赖 Prompt 约束。

第一轮可输出带 citation 的 discovery：

```text
alias
public_account
person
brand
address
case_keyword
history_keyword
```

`person` 只允许公开职业身份，不采集私人联系方式、家庭信息或与客户业务无关的敏感个人信息。

程序只有在 discovery 对应真实 citation 时才登记。

### 9.2 第二轮：Follow-up / Differentiation

只能使用第一轮已登记 discovery 和原始客户事实，继续搜索别名、账号、品牌、地址、案例、历史、本地竞对和真实差异；最后可补少量行业/地域背景。

预算：total tasks ≤ 4，每 task 最多 3 个 query，generic industry tasks ≤ 1。第二轮结束即停止。

第二轮 planner 输出同样由程序 validator 检查 task、query 和 industry 上限。

### 9.3 Query 和 URL 去重

程序执行 query NFKC、trim、空白折叠及跨轮 exact dedupe。URL 做协议/host 大小写、默认端口和 fragment 的基础规范化；保留 query 参数，不做激进去重。

---

## 10. Request budget

一次 generation 正常路径最多 14 次请求：

```text
材料提取              1
第一轮 plan           1
第一轮 search        ≤6
第二轮 plan           1
第二轮 search        ≤4
最终 synthesis        1
```

硬 transport request 上限为 18。`geo-knowledge-application` 创建本次 budget，并向 research 传入唯一的 `budgetedRequest()`；所有 plan、search、repair 和 synthesis 都必须通过它。只有该函数能增加计数。

两轮 planner 的 task/industry validator 失败可在剩余预算内走一次 JSON/schema repair；repair 仍计入 18 次 transport 上限，不改变 Round 1 ≤6/industry ≤1、Round 2 ≤4/industry ≤1 的最终任务合同。

始终为最终 synthesis 保留 2 次请求。前置阶段即将占用 reserve 时，停止后续可选 research，写入 partial warning，并用已有 findings 进入 synthesis。

- JSON/schema 格式错误允许在剩余预算内修复一次。
- timeout、network uncertainty、unknown result 不自动重发。
- synthesis 两次均失败时，本次 generation 失败，不保存损坏知识库。

重新研究弹窗显示：正常最多约 14 次请求，格式修复时程序硬上限 18 次；不展示无法确认的精确费用。

---

## 11. 三层研究 Prompt

```text
固定 application contract prompt
+ 全局研究 Prompt
+ 客户补充 Prompt
+ 本次临时 Prompt
```

固定 application contract prompt 由代码拥有，与其余三层内容组合后作为普通模型输入发送；本阶段不扩展 transport 为新的 system/developer message 架构。schema validator、source policy、request budget、merge/conflict 和网络不确定不重试才是真正边界，不能依赖 Prompt 优先级或模型自行遵守。

### 11.1 全局 Prompt

新增非秘密应用策略文件，例如：

```text
roamingConfig/geo-knowledge-policy.json
```

只保存可选 `researchPromptOverride`，最大 8000 字符。“恢复默认”删除 override，回到软件内置默认。继续使用原子写入，不增加 revision。

### 11.2 客户 Prompt

由现有 `geo-knowledge-store` 模块在 workspace 内保存 sidecar：

```text
.autopublish/geo-knowledge/<clientId>.policy.json
```

只保存 `researchPrompt`，最大 4000 字符。继续使用 path policy 和原子写入，不增加 revision。

### 11.3 临时 Prompt

通过本次 generate command 传入，最大 2000 字符。不落盘、不写 knowledge、不写 diagnostics 正文；只允许记录长度和是否存在。

### 11.4 运行边界

- 研究开始时一次性读取三层 Prompt，形成固定 snapshot。
- 运行期间 UI 禁止修改全局或客户 Prompt。
- Prompt 保存失败不能修改 knowledge；knowledge 保存失败不能修改 Prompt。
- 客户资料、网页摘要和用户 Prompt 都作为不可信数据分隔，不得覆盖程序验证规则。

---

## 12. 知识维护 UI

现有大卡片改为：

> 紧凑列表 + 右侧详情抽屉 + 待确认工作台

模块：基础信息、线上身份、客户历史、产品与服务、能力与证据、客户案例、场景、推荐角度、竞对。

主列表只显示名称、短摘要、来源类别和维护状态。详情抽屉显示完整描述、来源、关联 offering/scenario 和编辑/锁定状态。

待确认工作台第一版只处理 profile 字段 conflict：采用 A、采用 B、手工填写。Renderer 只收集意图，所有状态转换由 store command 完成。

来源详情或知识详情抽屉为符合转换条件的 URL 提供两个简单动作：“确认是客户官网”“确认是客户公开账号”。动作调用现有 store owner 的 `confirmSourceType` command；不增加审批队列、审核记录或第二套来源状态机。

重新研究弹窗提供客户长期补充要求和本次临时要求，并显示两轮研究与请求上限。

---

## 13. Article Brief 增量

继续修改现有 `geo-generation-context.js`，不新增 store。

### 13.1 Profile

- accepted + fact：作为客户事实；
- accepted + research：进入 context，但标记 `evidenceClass=research`；
- 仅由 client_public 支持：`attributionRequired=true`；
- accepted + derived/candidate：schema 不允许；
- candidate/rejected：不作为正向事实，也不投影到 profile.fields，仅通过 restrictions/uncertainty 影响写作。

### 13.2 Relation

`onlinePresence/history/cases/recommendationAngles/competitors` 全部支持现有 `relatedOfferingIds/relatedScenarioIds`，validator 拒绝 dangling relation。

`recommendationAngles` 至少一个 offering/scenario relation，因此不存在完全脱离现有客户知识的 client-wide angle。

### 13.3 简单、有界选择

- `cases`：只有显式 relation 匹配才加入；
- `history`：显式 relation 匹配；brand 问题可额外加入前 2 条 client-wide history；
- `onlinePresence`：显式 relation 匹配；brand/local 问题可额外加入前 3 条 client-wide item；
- `recommendationAngles`：只用于 selection/local/scenario/comparison；关系匹配项优先，最多 3 条；
- `competitors`：只用于 comparison/selection/local，且关系匹配，或名称在当前 Doubao answer/reference title 中 normalized literal match；最多 5 条；
- `restrictions`：继续全量保留；
- 同类候选超过上限时，按原 knowledge 数组顺序稳定选择，不调用额外 AI 排序。

继续保持 context 100000 字符上限，不静默截断 restrictions。旧文章 snapshot 不可变。

---

## 14. V2-0 真实能力 Gate

V2-0 不阻塞本地 V2 开发，只阻塞以下声明：

- 抖音、地图、点评可以被稳定自动搜索；
- 真实 Doubao Web Search/citation 已通过；
- 真实客户质量和真实成本已验收。

真实验证必须由用户逐次授权：一个客户、一份指定资料、明确允许发送并承担本次 API 用量。

遇到 401、403、capability reject、无 citation、网络结果不确定或计费边界不明确时立即停止；不自动重试、不切 endpoint/model、不扩大资料。

普通自动化测试只使用 synthetic data、fake transport 和故障注入。

---

## 15. 实施阶段

### V2-1：Schema、Claims、Conflict、V1 安全替换

- schemaVersion 2 和新 sections；
- Profile claims 与 projection validator；
- accepted claim 只允许 fact/research，人工确认 candidate 时创建新的 manual fact claim；
- 简单 source→basis 降级；
- 新 section 最低证据/relation 要求；
- `confirmSourceType` 轻量人工确认；
- 简单 conflict/resolution/reopen；
- V1 detection 和成功后原子替换；
- store、IPC contract、renderer types 及直接测试。

### V2-2：客户实体优先研究与预算

- 第一轮实体发现；
- discovery registry；
- 第二轮 follow-up/differentiation；
- Round 1 ≤6/industry ≤1，Round 2 ≤4/industry ≤1 的程序 validator；
- query/URL dedupe；
- 唯一 request counter、14次正常路径、18次硬上限、synthesis reserve；
- partial failure 和 uncertain no-retry。

### V2-3：Prompt 与维护 UI

- 全局、客户、临时 Prompt；
- generation Prompt snapshot；
- 运行期间禁止修改；
- compact list、drawer、source/maintenance badge；
- 来源详情中的官网/公开账号确认动作；
- profile conflict actions 和请求预算提示。

### V2-4：Generation Context 与收口

- Profile claim projection；
- 新 sections 的有界选择；
- attributionRequired；
- competitor deterministic inclusion；
- recommendationAngles 保持 derived；
- 组合回归、UI 交互验证和 bounded review。

阶段顺序默认串行。真实 V2-0 可在用户授权时独立执行，不改变本地阶段 gate。

---

## 16. 自动化验收

### Schema/store

- V1 显示 legacy，不作为有效知识；
- V2 研究成功后原子替换 V1；失败时 V1 保持；
- invalid/未知版本不自动覆盖；
- accepted claim 只允许 fact/research，claim projection 与 accepted value 严格一致；
- onlinePresence/history/cases/competitors 无 source 时拒绝；
- recommendationAngles 无 offering/scenario relation 时拒绝；
- relation/source 引用完整；
- stale V2 save 拒绝。

### Claims/conflict

- accepted 与 fact 分离；
- AI derived/candidate 不能成为 accepted 或进入 profile.fields；
- 人工确认 candidate 创建新的 client_input/manual/fact/accepted/locked claim，原 observation 保留；
- 同值合并 source；不同值产生 conflict；
- locked accepted 不自动覆盖但继续保存 candidate；
- 采用 A/B 和手工填写原子完成；
- rejected observation 保留；
- 再次发现不同值重新 open。

### Source confirmation

- 只允许 `third_party → official_web`、`third_party/platform → client_public`；
- safeUrl、revision 和 stale write 防护生效；
- 不创建第二个 source，不删除 observation，不直接提升 candidate；
- source type 变化后 basis 上限重新验证；
- client_public 继续产生 attributionRequired；
- 来源详情确认动作只调用 store command。

### Research/budget

- round1 ≤6、round1 industry ≤1、round2 ≤4、round2 industry ≤1；
- 两轮 planner validator 拒绝超额 task/industry 输出，repair 计入 transport budget；
- round2 只使用 registered discovery；
- query/URL 去重；
- 正常路径 ≤14、transport 硬上限 ≤18；
- synthesis reserve；
- uncertain request 不重试；
- 部分 research 失败仍可 synthesis 为 partial。

### Prompt/UI

- 三层 Prompt 合并顺序；
- generation 使用启动时 snapshot；
- 运行时设置禁用；
- temporary prompt 不落盘、不进入错误正文；
- compact list、drawer、conflict resolution、loading/partial/cancel/stale 状态。

### Article Brief

- Profile 逐 claim basis 选择；
- accepted derived/candidate 被 schema 拒绝且不能进入 context；
- client_public 生成 attributionRequired；
- 无关新知识不进入；
- client-wide 项遵守固定上限；
- competitor 使用确定匹配；
- recommendationAngles 始终 derived；
- recommendationAngles 必须关联至少一个 offering/scenario；
- restrictions 全量保留；
- context 上限和 snapshot 不可变。

---

## 17. 明确不做

- V1 knowledge migration 或兼容读取；
- 向量数据库、知识图谱、通用 claim graph；
- 多 Agent、crawler、Playwright 默认 research；
- 多 Provider 重构；
- 自动周期研究或自动 GEO 复测；
- 来源归属审批状态机；
- 复杂 conflict reopen/证据失效状态机；
- Prompt revision/多人并发编辑；
- 百分制评分、复杂排序引擎；
- 新 Article Brief owner 或 research answer owner。

---

## 18. 完成定义

完成 V2 需要：

1. V2-1～V2-4 的行为合同全部落地；
2. canonical writer、revision、原子写入和现有 question/article owner 未被绕开；
3. 定向测试、core、integration、lint、main/bridge/renderer typecheck、renderer/preload build 通过；
4. UI 加载、空态、legacy、partial、错误、运行禁用、冲突裁决通过隔离交互验证；
5. Primary Review 的 blocking finding 已修复，bounded re-review 收口；
6. 实际验证命令、结果、未执行的真实 API gate 和剩余风险写回本计划；
7. 最终代码与最终验证之后没有未经重新验证的 production/schema/test 变化。

真实 API 能力未验收不会阻止本地 V2 完成，但必须继续标记为未通过，不得对站点覆盖和真实模型质量作承诺。

---

## 19. Progress

- [x] V2-1 Schema、Claims、Conflict、V1 安全替换
- [x] V2-2 客户实体优先研究与请求预算
- [x] V2-3 Prompt 与维护 UI
- [ ] V2-4 Generation Context 与收口
- [ ] V2-0 真实能力受限验证（等待用户逐次授权）

---

## 20. Decision Log

- 2026-09-20：V2 只做现有 owner 上的增量升级，不重新实现 V1。
- 2026-09-20：按少量用户、本地单机实际规模设计，删除复杂迁移、Prompt revision、来源审批和精细 conflict reopen。
- 2026-09-20：旧 V1 knowledge 不迁移；仅在 V2 研究成功并通过 schema 后原子替换。
- 2026-09-20：Profile claims 是字段事实真源；fields 是严格投影。
- 2026-09-20：正常请求最多约 14 次，硬上限 18 次，并保留 synthesis reserve。
- 2026-09-20：真实 API gate 与本地实现 gate 分离。
- 2026-09-20：最终边界修订补齐 accepted claim basis、轻量 source type 人工确认、两轮 industry task 程序上限和新 section 最低证据要求；不增加新 owner 或复杂状态机。

---

## 21. 验证记录与剩余风险

### V2-1

- schemaVersion 2、新 sections、Profile claims/fields 投影、source→basis 上限、最低证据与 relation validator 已落地；V1 只识别不读取，研究成功后才原子替换为 revision 1。
- 现有 `geo-knowledge-store` 增加来源类型确认和 Profile conflict 裁决 command；IPC、preload、Renderer 类型合同同步，没有新增 writer 或审批状态机。
- 定向 GEO/store/research/service/IPC/flow 21/21；类型 owner bounded 回归 18/18；`npm test` 596/596；lint、main/bridge/renderer typecheck 通过。
- 首轮 `npm run test:integration` 1300/1301，唯一失败为新增 Renderer 类型未登记到既有 ownership baseline；补齐 `ProfileClaim`、`KnowledgeStorageStatus` 后 bounded 回归通过，最终完整 integration 1301/1301。
- `build:renderer`、`build:preload` 通过；Renderer 构建仅保留既有大 chunk 提示。未运行真实 API/账号验收，未发送客户资料。
- Primary Review 检查 accepted basis、投影一致性、V1 原文件保留、source conversion、conflict observation 保留、stale revision 和新 section 证据边界；修复 recommendationAngle 人工编辑仍须保持 derived，并补 source/relation 数组去重 validator。无剩余已知阻塞 finding。

后续每阶段继续记录：提交、定向测试、完整 gate、审查 finding、未运行项目及原因。

### V2-2

- 研究升级为 Customer Entity Discovery 与 follow-up/differentiation 两轮；Round 1 `tasks<=6/industry<=1` 且至少一个客户实体任务，Round 2 `tasks<=4/industry<=1`，均由程序 validator 执行。
- discovery 只有绑定真实 citation 才登记并进入第二轮；query 使用 NFKC/trim/空白折叠跨轮 exact dedupe，URL 规范化协议、host、默认端口和 fragment，保留 query。
- `geo-knowledge-application` 为每次 generation 创建唯一 budgeted request；正常最大路径实测 14 次，非 synthesis 请求在 16 次停止，最终 synthesis 保留 2 次，transport 硬上限 18。JSON/schema repair 计数，网络不确定不重试。
- 定向 research/flow/Coding Plan/store 26/26；`npm test` 596/596；`npm run test:integration` 1305/1305；lint 与 main typecheck 通过。
- Primary Review 检查两轮输入边界、未引用 discovery 丢弃、重复 discovery 合并、partial warning、reserve 和实际 service wiring；第二轮规划失败收敛为 partial 后使用现有 findings 进入 synthesis。bounded re-review 无剩余阻塞 finding。
- 未运行真实 API/账号验收，未发送客户资料。

### V2-3

- 固定 application contract prompt、全局、客户、本次临时 Prompt 按固定顺序组合，仍作为现有 transport 的普通模型输入发送；generation 启动时只读取一次 snapshot，临时 Prompt 不落盘。
- 全局设置写入应用配置目录，客户设置写入既有 GEO knowledge 目录的独立 policy sidecar；两者均原子写入，保存失败不修改 knowledge，运行期间按全局/客户作用域禁止修改。
- 知识库页面收敛为紧凑列表、右侧详情抽屉和 Profile 待确认工作台；来源详情提供官网/公开账号确认动作，冲突采用 A/B 或手工值时只调用既有 store command，没有新增 Renderer writer。
- 定向 GEO/IPC/Renderer/类型 owner 回归 32/32；`npm test` 596/596；`npm run test:integration` 1307/1307；lint、main/bridge/renderer typecheck、renderer/preload build 通过。
- Primary Review 检查 Prompt snapshot、临时值不持久化、作用域禁用、来源确认与冲突裁决调用链、revision 后详情同步；修复详情抽屉在 revision 更新后可能保留旧对象的问题。bounded re-review 无剩余阻塞 finding。
- 未运行真实 API/账号验收，未发送客户资料；真实模型对三层 Prompt 的遵循质量仍属于 V2-0 外部 gate。

当前剩余外部风险：Doubao Responses、Web Search、citation metadata、Coding Plan 权限、抖音/地图/点评覆盖和真实调用成本均未完成真实验收。

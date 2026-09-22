# GEO Web Search 检索能力诊断流程

**状态**：READY / 仅诊断，不改变产品语义或 owner

**日期**：2026-09-22

**关联主计划**：`AutoPublish-GEO-Content-Production-Implementation-Plan-v1.4.md`

> 本文是主计划的真实 API 检索能力诊断附录，不拥有 CP 状态、Knowledge schema、Research owner、Generation owner 或产品决策。当前实施入口和完成状态仍以主计划与 `docs/WORK-INDEX.md` 为准。

---

## 1. 目标

当前真实使用中出现“知识库偏泛、客户实体信息较少”的现象。在继续调整 Knowledge research Prompt、planner 或 synthesis 之前，先把问题分层定位：

1. 火山方舟 Responses API 的 `web_search` 本身是否能检索到这些公开信息；
2. API 能找到时，AutoPublish 的请求参数、返回解析或 citation 处理是否丢失信息；
3. 单次搜索正常时，Knowledge research planner 是否没有提出正确查询；
4. planner 已查到时，synthesis / merge 是否把结果丢掉；
5. Knowledge 与 Article Brief 都正常时，才继续检查文章 Prompt / 写作模型。

本诊断只回答“信息在哪一层丢失”，不通过增加 schema、第二套 Research store、评分系统或更多门禁来掩盖根因。

---

## 2. 当前实现基线

以执行测试时 `codex/geo-knowledge-base` 最新源码为真源，并重新核实以下实现，不死依赖本文描述：

- `src/content/doubao-geo-client.js`
  - 请求 `normalizeGeoBaseUrl(config.baseUrl) + "/responses"`；
  - 联网时传入 `tools: [{ type: "web_search", max_keyword: 2 }]`；
  - 只接受 `output_text`；
  - 从 `url_citation` annotation 提取 citation；
  - `search=true` 但没有 citation 时返回 `GEO_SEARCH_UNCONFIRMED`；
  - 请求结果不确定时不得自动重试。
- `desktop/services/geo-knowledge-service.js`
  - 当前联网连接测试只搜索“火山引擎官网”；
  - 只返回 citation 数量；
  - 该测试只能证明 web_search 能被调用，不能证明对本地客户、长尾实体、地图/平台页、地方媒体等信息具有足够召回。

`max_keyword: 2` 在本次诊断中视为**待验证变量**，不得预设它一定是根因，也不得在没有真实对照证据时直接修改生产默认值。

---

## 3. 授权与安全边界

### 3.1 必须获得逐次授权

以下步骤会调用真实 Responses / web_search，可能产生费用，因此执行前必须获得用户对本次诊断的明确授权。

未获得授权时，只允许准备脚本、fixture、测试矩阵和本地 fake transport，不得发送真实请求。

### 3.2 测试数据边界

第一轮能力诊断只使用**公开、可事先验证存在的目标信息**，不发送客户私密资料、内部文档、手机号、Cookie、账号凭据或未公开经营数据。

推荐使用 6–8 个公开目标，每个目标在测试前记录“已知证据 URL / 页面标题 / 目标事实”，确保我们是在测“已知存在的信息能否被搜到”，而不是把“网络上本来没有”误判为检索失败。

### 3.3 凭据与日志

- 不输出 API Key、Authorization header 或完整配置对象；
- 不把真实凭据写入 fixture、测试报告或 commit；
- 允许记录：模型名、baseUrl host、查询文本、返回正文、citation title/url、错误 code、请求耗时；
- 远端结果不确定时停止该调用，不自动重发。

---

## 4. 固定测试样本

优先选一个真实出现“知识库不够好”的客户，但测试内容只使用其已公开信息。若不希望使用真实客户名称，可先使用同类型公开实体做能力探针。

建议样本覆盖：

| 编号 | 公开目标 | 目的 |
| --- | --- | --- |
| T1 | 精确实体全称 + 已知官网/官方页 | 验证最基础实体召回 |
| T2 | 精确实体 + 公开地址/门店页 | 验证本地实体/POI 类信息 |
| T3 | 精确实体 + 已知公开服务/产品 | 验证业务能力长尾信息 |
| T4 | 精确实体 + 已知公开资质/授权/合作品牌 | 验证证据型信息 |
| T5 | 精确实体 + 已知公开案例/地方新闻 | 验证地方媒体和案例页面 |
| T6 | 精确实体 + 已知公开社交/内容平台账号或文章 | 验证平台型页面可见性 |
| T7 | 精确实体 + 一个较难的本地长尾事实 | 验证长尾召回上限 |
| T8 | 非客户的高可见官方站点 | 作为正向对照，确认 web_search 基础能力 |

不做主观总分。每个目标只记录：**找到 / 未找到 / 找到但 citation 不可用 / API 拒绝或不确定**。

---

## 5. A/B/C 三层诊断

### A 层：API 原始检索能力

目的：先回答“同一个模型 + 同一个 Responses API + web_search，脱离 Knowledge planner 后能不能找到目标”。

对每个 T1–T8 使用明确、窄范围、可核验的搜索问题。示例结构：

```text
请联网查找“<精确实体名>”与“<已知目标>”相关的公开网页。
只总结实际搜索到的信息，并给出网页引用；找不到就明确说没有找到，不要推测。
```

记录：

```text
caseId
model
baseUrl host
search request variant
prompt
response status / error code
response text
citations[]: title + url
elapsedMs
```

A 层不得调用 Knowledge synthesis，不得因为第一次没搜到就由程序自动重试。

### B 层：AutoPublish 单次搜索链路

目的：判断信息是否在请求构造、Responses 返回解析、`output_text` / `url_citation` 提取、`safeUrl` 等本地链路中丢失。

使用与 A 层**同一测试问题**，经过当前 AutoPublish `createDoubaoGeoClient(...).request({ search: true })` 以及 Knowledge research 实际使用的单次搜索入口执行，但暂不进入最终 synthesis / merge。

记录与 A 层同样的正文和 citations，并逐项比较：

- A 有正文，B 无正文；
- A 有 citation，B citation 被丢弃；
- URL 是否因为本地校验被过滤；
- API 原始结构是否包含当前 parser 未覆盖的结果类型；
- 是否因为 `GEO_SEARCH_UNCONFIRMED` 把实际有价值但没有当前格式 citation 的结果整体判失败。

若 A 正常、B 异常，先修本地 transport/parser，不继续调 Knowledge Prompt。

### C 层：完整 Knowledge research 链路

只有 A、B 层足以证明单次检索可用后，才进入：

```text
客户公开材料
  → extract
  → round 1 planner
  → web_search results
  → gap analysis / round 2 planner
  → web_search results
  → synthesis
  → merge
  → Customer Knowledge
```

对同一客户记录：

- planner 实际生成了哪些 task / query；
- T1–T8 中哪些已知目标被查询；
- 搜索结果中哪些已经出现；
- synthesis 是否引用并保留；
- merge 后进入哪个 Knowledge section；
- 哪些结果因为证据等级、candidate、conflict、restriction 等规则没有成为正向事实。

C 层重点不是“多搜几次”，而是找到丢失位置：

- planner 根本没问；
- planner 问偏了；
- 搜索已经找到，但 synthesis 丢掉；
- synthesis 有，merge 丢掉；
- Knowledge 有，但展示没有让用户看到。

---

## 6. `max_keyword` 对照实验

当前生产请求显式传 `max_keyword: 2`。第一轮真实诊断需在不改变其他变量的前提下做最小对照：

### Variant K2 — 当前生产形状

```json
{"type":"web_search","max_keyword":2}
```

### Variant K0 — 不显式传 `max_keyword`

```json
{"type":"web_search"}
```

两组必须使用相同 model、baseUrl、prompt 和目标样本。

只有在当前官方能力或真实 API 响应明确支持其他值时，才增加 K5/K8 等更宽值；不要凭猜测扩值。

比较项只看事实：

- 是否成功完成；
- citation 数量与 URL；
- 是否找到事先已知目标；
- 正文是否明显包含新增目标信息；
- 是否出现 capability reject / 参数错误。

若 K0 明显能找到 K2 持续找不到的已知目标，才把 `max_keyword` 作为生产改动候选；否则不因一次偶然结果修改默认参数。

---

## 7. 判定矩阵

| 证据 | 结论方向 | 下一步 |
| --- | --- | --- |
| A 就无法找到多数已知目标，K2/K0 均相同 | provider/web_search 覆盖或模型检索能力限制 | 不继续堆 Prompt；评估检索来源/能力方案 |
| A 的 K0 能稳定找到，K2 找不到 | 当前 `max_keyword: 2` 可能限制召回 | 先做最小参数修复，再复测 A/B/C |
| A 找到，B 找不到 | AutoPublish transport/parser/citation 处理问题 | 修本地链路 |
| A/B 都找到，C planner 没查 | planner / research strategy 问题 | 调整客户实体优先和 gap-driven 查询 |
| planner 已查到，synthesis 没保留 | synthesis 问题 | 调整 synthesis 合同，不增加新 owner |
| synthesis 有，merge 后丢失 | merge/evidence 规则问题 | 按当前 schema/证据边界修 merge |
| Knowledge 已有，UI 看不出来 | 展示/确认稿问题 | 改派生视图，不改 canonical truth |
| Knowledge 和 Article Brief 都正确，文章仍差 | Prompt / 写作模型问题 | 再审文章生成输入与 Prompt |

只有证据指向对应层时才修改该层，禁止“知识库不好 → 同时改 API、planner、schema、Prompt、UI”。

---

## 8. 输出证据格式

测试结果使用单表记录，不建立新的持久业务 owner：

| Case | 已知目标 | A/K2 | A/K0 | B | Planner query | Search hit | Synthesis | KB | 丢失层 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | ... | ... | ... | ... | ... | ... | ... | ... | ... |

每个单元格只写事实或稳定错误 code；必要时附 citation URL。

诊断完成后在主计划 Progress / Discoveries 中记录：

- 使用的 branch/commit；
- 用户授权范围；
- 实际真实请求数量；
- A/B/C 结果；
- 是否证明 `max_keyword` 有影响；
- 根因所在层；
- 后续允许修改的最小范围。

不把长 API 原始日志复制进主计划。

---

## 9. 停止条件

出现以下情况立即停止真实请求并保留证据：

- API 返回鉴权/权限/能力拒绝；
- 远端结果不确定；
- 需要发送客户私密资料才能继续；
- 需要更换收费模型、搜索服务或增加新的真实第三方调用；
- 已经获得足够证据定位到 A/B/C 某一层，不再为了“多跑几个样本”继续消耗调用。

真实调用不自动重试。需要再次发起真实请求时，按用户本次授权范围执行；超出授权范围则先停止。

---

## 10. 完成条件

本诊断只有在以下事实明确后才算完成：

1. 至少有一个高可见正向对照能证明 web_search 基础调用状态；
2. 对 6–8 个已知公开目标完成 A 层，且 K2/K0 对照可比较；
3. 对同一问题完成 B 层，能确认本地 transport/parser 是否丢结果；
4. 若 A/B 正常，完成 C 层并定位 planner / search result / synthesis / merge 的实际丢失点；
5. 不使用主观总分，不把“没找到”自动解释为客户不存在；
6. 不修改 Knowledge schema，不新增 Research 真源，不引入自动重试；
7. 后续修改范围由证据决定，并写回主计划 Progress / Discoveries。

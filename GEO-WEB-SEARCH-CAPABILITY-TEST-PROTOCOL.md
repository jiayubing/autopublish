# GEO Web Search 检索能力诊断流程

**状态**：本地试验文档 / 不提交 GitHub

**日期**：2026-09-23

**目的**：判断知识库研究质量问题究竟来自 provider/web_search、本地 API 接法、planner、synthesis/merge，还是后续文章生成链路。

---

## 1. 测试目标

当前真实使用中出现“知识库偏泛、客户实体信息较少”的现象。继续调整 Knowledge research Prompt、planner 或 synthesis 前，先分层确认信息到底在哪一步丢失：

1. 火山方舟 Responses API 的 `web_search` 本身能不能检索到目标公开信息；
2. API 能找到时，AutoPublish 的请求参数、响应解析或 citation 处理有没有丢结果；
3. 单次搜索正常时，Knowledge research planner 有没有提出正确查询；
4. planner 已查到时，synthesis / merge 有没有把结果丢掉；
5. Knowledge 与 Article Brief 都正常时，再检查文章 Prompt / 写作模型。

本诊断只回答“问题在哪一层”，不通过增加 schema、第二套 Research store、评分系统或更多门禁掩盖根因。

---

## 2. 当前实现基线

执行测试时以本地最新源码为真源，先重新核实：

- `auto—publish/src/content/doubao-geo-client.js`
  - 请求 `/responses`；
  - 联网时当前传入 `tools: [{ type: "web_search", max_keyword: 2 }]`；
  - 从 `output_text` 读取正文；
  - 从 `url_citation` annotation 提取 citation；
  - `search=true` 但没有 citation 时返回 `GEO_SEARCH_UNCONFIRMED`；
  - 不确定远端结果不得自动重试。
- `auto—publish/desktop/services/geo-knowledge-service.js`
  - 当前联网测试只搜索“火山引擎官网”；
  - 只看 citation 数；
  - 因此它只能证明 web_search 能调用，不能证明本地客户、长尾实体、地图/平台页、地方媒体等检索能力足够。

`max_keyword: 2` 只作为待验证变量，不预设它是根因。

---

## 3. 授权和数据边界

真实 Responses / web_search 可能产生费用，因此真正发请求前需要本次操作的明确授权。授权时确认使用的模型、接口地址、阶段、最多请求数和费用边界；A/B 的授权不自动包含 C 层完整知识库生成。测试中不自动切换接口或模型。

第一轮只使用公开、可事先验证存在的信息，不发送：

- 客户内部资料；
- 未公开经营信息；
- Cookie / 登录态；
- 在 prompt、请求正文或诊断记录中放入 API Key（正式请求仍通过 Authorization header 鉴权）；
- 手机号等无关敏感信息。

允许记录：

- 模型名；
- baseUrl host；
- 查询文本；
- 返回正文；
- citation title/url；
- 稳定错误 code；
- 请求耗时。

为定位解析差异，可以在仅供本地诊断的文件中保留可回放的脱敏响应 JSON：保留 `status`、`output` / `content` / annotation 的数组层级与 `type`，以及必要的公开正文、`title/url`。若响应夹带无关个人信息或敏感内容，遮盖对应值并保持字段及类型不变；回放时注明遮盖范围，若遮盖影响了待查字段，该样本不能用于解析结论。不得记录 Authorization header、完整凭据、原始请求头或完整配置对象。诊断文件不提交 GitHub。

---

## 4. 固定测试样本

选择 6–8 个“我们事先知道网页确实存在”的公开目标。

| 编号 | 公开目标 | 目的 |
| --- | --- | --- |
| T1 | 精确实体全称 + 已知官网/官方页 | 基础实体召回 |
| T2 | 精确实体 + 公开地址/门店页 | 本地实体/POI |
| T3 | 精确实体 + 已知公开服务/产品 | 业务长尾信息 |
| T4 | 精确实体 + 已知资质/授权/合作品牌 | 证据型信息 |
| T5 | 精确实体 + 已知案例/地方新闻 | 地方媒体/案例 |
| T6 | 精确实体 + 已知公开账号或平台文章 | 平台型页面 |
| T7 | 精确实体 + 较难的本地长尾事实 | 长尾召回上限 |
| T8 | 高可见官方站点 | 正向对照 |

每个样本测试前记录：

- 已知目标事实；
- 已知页面标题；
- 已知 URL；
- 为什么可以确认该页面实际存在。

“找到”必须能对应测试前登记的 URL（允许同一页面的规范化 URL）和目标事实，并有可核验引用；仅有模型声称找到、引用却不可用，不算有效召回。目标事实被正文准确提到但引用缺失时单列。结果不打总分，只记录：

- 找到；
- 未找到；
- 找到正文但 citation 不可用；
- API 拒绝；
- 远端结果不确定。

每个样本预先固定一条 prompt。测试期间不根据某一组的结果临时改写 prompt；若必须修正样本，记录原因，并从头重跑该样本的配对对照。

---

## 5. A/B/C 三层诊断

### A 层：API 原始检索能力

目标：先回答“同一个模型 + 同一个 Responses API + web_search，脱离 Knowledge planner 后到底能不能找到”。

每个 T1–T8 使用明确且窄范围的查询，例如：

```text
请联网查找“<精确实体名>”与“<已知目标>”相关的公开网页。
只总结实际搜索到的信息，并给出网页引用；找不到就明确说没有找到，不要推测。
```

记录：

```text
caseId
model
baseUrlHost
searchVariant
prompt
responseStatus / errorCode
responseText
citations[] = title + url
rawOutputTypes[] / rawContentTypes[] / rawAnnotationTypes[]
knownTargetUrlMatched / knownFactMatched
elapsedMs
```

A 层保留每次响应的脱敏快照和请求参数形状，以便与 B 层回放比较。若 `status` 非 `completed`、JSON 无法解析或请求结果不确定，按实际状态记录，不将它归为“未找到”。A 层不得进入 Knowledge synthesis，也不得因为第一次没搜到就自动重试。

---

### B 层：AutoPublish 单次搜索链路

目标：判断 API 原始结果是否在本地 transport / parser / citation 处理阶段丢失。

先把 A/K2 已完成请求的脱敏响应通过注入的假 `fetch` 回放给 AutoPublish 当前的：

```text
createDoubaoGeoClient(...).request({ search: true })
```

回放不发送真实请求，可以判断同一份响应在本地解析后是否丢失正文或 citation。再选最多 2 个有代表性的样本，使用与 A/K2 相同的 prompt 和配置发真实 B 请求，以检查实际 request/transport；两次真实请求的搜索结果可能波动，不能仅凭内容不同认定 parser 错误。检查 Knowledge research 真正使用的单次搜索入口时也停在 synthesis / merge 之前。

重点比较：

- 同一响应回放时，A 有正文，B 是否没有；
- 同一响应回放时，A 有 citation，B 是否被丢弃；
- URL 是否被 `safeUrl` 过滤；
- API 原始响应是否存在 parser 未处理的结果类型；
- 是否因为没有当前格式 citation，被 `GEO_SEARCH_UNCONFIRMED` 整体判失败。
- 真实 B 请求与 A/K2 的请求体、模型、接口地址是否一致；响应差异与请求形状差异分开记录。

判定：

> A 正常、B 异常 → 优先修 transport/parser，不继续改 research Prompt。

---

### C 层：完整 Knowledge research

只有 A/B 证明相关样本的单次搜索可用、且 C 层获得单独的真实请求授权后，再跑完整链路。A 对部分样本失败时，可以只对已证明可用且与问题相关的样本继续 C；不把 A 的失败归因给 planner。C 只使用已确认公开且获准发送的材料：

```text
客户公开材料
  → extract
  → round 1 planner
  → web_search
  → evidence gap / round 2 planner
  → web_search
  → synthesis
  → merge
  → Customer Knowledge
```

记录：

- planner 生成了什么 task/query；
- T1–T8 哪些目标实际被查询；
- search result 是否已经出现目标信息；
- synthesis 有没有保留；
- merge 后进入了哪个 Knowledge section；
- 哪些内容因为 candidate/conflict/restriction/证据等级没有成为正向事实。

C 层重点定位：

- planner 根本没问；
- planner 问偏了；
- search 已经找到，但 synthesis 丢掉；
- synthesis 有，merge 丢掉；
- Knowledge 已有，但 UI/确认稿没展示清楚。

---

## 6. `max_keyword` 对照实验

当前生产形状：

### K2

```json
{"type":"web_search","max_keyword":2}
```

对照组：

### K0

```json
{"type":"web_search"}
```

K2 和 K0 必须保持以下变量完全一致：

- model；
- baseUrl；
- prompt；
- 测试目标；
- 其他 request 参数。

预先选定 6–8 个样本各做一组 K2/K0 配对，共 12–16 次真实请求。若初次配对出现影响结论的差异，最多选择 2 个有分歧的样本各追加一组配对，共最多 4 次请求；记录执行顺序和时间。追加配对是事先限定的独立对照，不是失败后的自动重试。A 层最多 20 次真实请求；若权限拒绝、结果不确定或已足够定位，立即按第 9 节停止。真实 B 层最多 2 次请求，因此 A+B 合计上限 22 次。C 层不包含在此上限内，必须在执行前依据当前实现的 request budget 明确其单次运行的最多请求数和费用边界。

比较：

- 请求是否完成；
- citation 数量；
- citation URL；
- 已知目标是否被找到；
- 正文是否出现更多有效目标信息；
- 是否发生 capability reject / 参数错误。

只有同一已知目标在预设的两组配对中均出现 K0 有效召回、K2 未有效召回，且没有权限、超时或解析差异，才把 `max_keyword: 2` 作为生产修改候选。否则记录为“证据不足”或“无稳定差异”。

不要因为一次偶然差异就修改默认参数。

---

## 7. 判定矩阵

| 证据 | 结论方向 | 下一步 |
| --- | --- | --- |
| A 就找不到多数已知目标，K2/K0 都一样 | provider/web_search 覆盖或模型搜索能力限制 | 不继续堆 Prompt，评估检索来源或能力 |
| K0 稳定找到、K2 找不到 | `max_keyword: 2` 可能限制召回 | 做最小参数修复后复测 |
| A 找到、B 找不到 | AutoPublish transport/parser/citation 问题 | 修本地接法 |
| A/B 都找到，C planner 没查 | planner/research strategy 问题 | 调整客户实体优先和 gap-driven query |
| planner 已查到，synthesis 没保留 | synthesis 问题 | 调整 synthesis 合同 |
| synthesis 有，merge 后丢失 | merge/evidence 规则问题 | 修当前 owner |
| Knowledge 已有但界面看不出来 | Confirmation/UI read model 问题 | 改派生展示，不改 canonical truth |
| Knowledge + Article Brief 都正确，文章仍差 | Prompt / 写作模型问题 | 再优化文章生成 |

原则：

> 只有证据指向哪一层，才修改哪一层。

禁止一次同时改 API、planner、schema、Prompt 和 UI。

---

## 8. 结果记录格式

使用一张本地表记录：

| Case | 已知事实 / URL | A/K2 | A/K0 | 配对复测 | B 回放 | B 真实请求 | Planner query | Search hit | Synthesis | KB | 丢失层 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |

每次请求另记模型、接口 host、请求参数形状、执行顺序、状态/code、耗时、目标 URL/事实是否命中和脱敏响应快照位置；必要时附 citation URL。无请求的回放与真实请求分开标注。未进入 C 的样本填“未执行”，不要填“未找到”。

不要建立新的业务持久化结构，这只是一份诊断 evidence。

---

## 9. 停止条件

出现以下情况停止真实请求：

- API 返回鉴权/权限/能力拒绝；
- 请求已经发出但结果不确定；
- 需要发送客户私密资料才能继续；
- 需要更换收费模型或新的第三方搜索服务；
- 已经有足够证据定位到 A/B/C 某一层；此时可以提前停止，未测样本如实标为“未执行”。
- 达到本阶段获授权的请求或费用上限。

不要为了“样本更多”继续消耗真实调用。

---

## 10. 完成条件

本诊断完成时至少要明确：

1. web_search 基础能力是否正常；
2. 预先选定的 6–8 个已知公开目标在 A 层的实际召回情况，或提前停止的原因及未测范围；
3. K2/K0 是否存在稳定差异；配对不足时明确写“证据不足”；
4. B 层同响应回放和真实请求分别显示了什么，transport/parser 有没有可复现的丢失；
5. 若 A/B 正常且 C 已获授权，C 层具体在哪一步丢失；未执行 C 时不得推断其根因；
6. 已有证据能定位的层及尚不能排除的层；
7. 后续只修改被证据指向的最小范围。

---

## 11. 建议执行顺序

实际本地试验按以下顺序：

```text
准备已知目标
→ A/K2 与 A/K0 配对
→ 按预设上限复测有分歧的样本
→ A 响应回放 B
→ 必要时执行最多 2 次真实 B 请求
→ 对比
→ 若 A/B 正常且另获授权，再跑 C
→ 定位根因
→ 再决定是否修改生产代码
```

在完成 A/B 之前，不先修改知识库 schema，也不先重写 research Prompt。

# AutoPublish GEO 知识质量与文章消费闭环方案 v1.0

**状态**：PLANNED / 待 `AutoPublish-GEO-Content-Production-Implementation-Plan-v1.4.md` 的 CP-5 Closure 后登记为当前入口

**目标分支**：`codex/geo-knowledge-base`

**制定日期**：2026-09-22

**实施方式**：串行 KQ1 → KQ2 → KQ3；每阶段只修改直接 owner 与调用链，不重新设计 GEO Knowledge V2，不新增平行真源。

---

## 1. 背景与结论

当前 GEO Knowledge V2 的结构、来源追踪、问题关联和 Article Brief v2 基础已经建立；文章生成也已经能够以单个 GEO Question + 单个 Research + Article Brief v2 进入 Prompt v2。

真实确认稿试用暴露的问题不再是“字段不够”，而是以下四类质量问题：

1. 客户资料中的营销性能力、保证、数字、比较性主张虽然有来源，但在确认稿和文章消费侧仍容易被用户或写作 AI 理解为“已被独立验证的事实”。
2. 公开研究仍可能把有限请求花在泛行业背景上，而真正影响 GEO 写作的客户线上身份、案例、授权、负责人公开职业信息、项目痕迹和第三方提及没有被充分补全。
3. synthesis 仍可能保留低客户特异性的行业噪音和语义重复项；这些内容占用确认稿和 Article Brief 上下文，却不能形成更可靠的推荐理由。
4. Article Brief v2 已经进入生成链路，但用户在 UI 中看不到“完整知识库 → 本篇筛选结果 → 当前 GEO 环境 → 限制”的过程，因此难以判断文章质量问题究竟来自 Knowledge、Brief 选择还是 Prompt 写作。

因此本轮不扩展 canonical schema，不新增第二套 Article Brief，不上向量检索或多 Agent。目标是把现有链路做成：

```text
客户资料 / 公开研究
        ↓
Customer Knowledge V2
        ↓
按目标 GEO Question 选择
        ↓
Article Brief v2（本篇知识包）
        ↓
Prompt v2
        ↓
Article
```

其中：

- Knowledge 回答“关于这个客户，当前有证据知道什么”；
- Research 回答“这个 GEO 问题当前如何被回答、出现谁、关注哪些判断维度”；
- Article Brief 回答“本篇文章允许使用哪些相关信息，以及每类证据应该如何使用”；
- Prompt 只负责写作，不重新整理完整客户知识库。

---

## 2. 不变边界

本轮必须保留以下现有 owner：

| 对象 | 唯一 owner | 本轮规则 |
| --- | --- | --- |
| Customer Knowledge | `geo-knowledge-store` / Knowledge schema | 不新增平行知识 store，不新增 generic facts 图谱 |
| Knowledge research/synthesis | `geo-knowledge-research` | KQ1 只改研究目标、来源登记和 synthesis 质量规则 |
| GEO Research | 现有 `research-store` | 不复制回答，不把 Research 改成 Knowledge owner |
| Article Brief | `geo-generation-context` | KQ2 继续实时派生，不持久化新 Brief store |
| Article source snapshot | 现有 Article store | 继续保存实际生成输入，旧文章不被后续 Knowledge 改写 |
| 写作规则 | `prompt-builder` | 使用 Article Brief v2 + template，不重新接回完整客户资料 |
| Renderer | 现有 Knowledge/Generation feature | 只展示和触发既有 owner，不复制筛选或证据分类逻辑 |

继续遵守：**AI 负责语义，程序负责状态与证据边界。**

本轮不增加 confidence/completeness 分数，不要求客户资料齐全后才能生成，不把搜不到视为失败；“没有找到可靠证据”本身就是允许保留的结果。

---

## 3. KQ1 — 客户证据补全研究

### 3.1 目标

把 Knowledge research 从“按 section 找内容”收敛为“先理解客户实体，再针对写作所需证据缺口做有限跟进”。

第一轮仍负责实体发现；第二轮不做泛泛继续搜索，只追第一轮和客户资料暴露出来的关键证据缺口。

### 3.2 第一轮研究优先级

第一轮 planner 的优先级固定为：

1. **客户身份**：正式名称、别名、历史名称、主体、地址、门店/机构身份；
2. **线上公开身份**：官网、公开账号、地图/POI、可明确归属客户的公开页面；
3. **核心业务**：真实存在的产品、服务、项目、设备、团队、主推方向；
4. **证据**：公开职业身份、案例、授权、品牌合作、设施、资质和具体项目痕迹；
5. **真实差异**：与本地同类实体相比，有证据支持的不同点；
6. **泛行业背景**：仅在直接帮助理解客户或 GEO 问题时补充，继续保持每轮最多 1 个 generic industry task。

现有 round 1 ≤ 6 tasks、round 2 ≤ 4 tasks、每 task ≤ 3 queries、generic industry ≤ 1、总请求预算和 synthesis reserve 继续保留，不扩大研究成本。

### 3.3 运行时证据缺口

第一轮完成后，由现有研究 AI 基于：

- 客户资料提取结果；
- 已登记 findings/discoveries；
- 已确认 source registry；

形成一个**仅用于本次 research runtime 的 evidence gaps**。它不进入 Knowledge schema、不单独持久化、不成为第二状态 owner。

典型 gap：

- 官方线上身份是否确认；
- 某资质/授权是否有权威或公开证据；
- 某核心能力是否只有客户自述；
- 是否存在可核验案例；
- 负责人/医生/团队是否有公开职业身份；
- 具体项目、品牌合作、设备或门店信息是否有公开痕迹；
- 与目标区域/场景直接相关的本地差异是否有依据。

第二轮 planner 只能围绕已登记 discovery、原始客户事实和这些 gap 规划跟进，不得为了“填满 section”自行发明新的研究方向。

### 3.4 第二轮查询行为

第二轮优先查询：

- 客户名称/别名 + 具体资质；
- 客户名称/别名 + 具体服务/项目；
- 客户名称/别名 + 案例/品牌/授权；
- 客户名称/别名 + 负责人/公开职业身份；
- 客户名称/别名 + 平台/账号；
- 第一轮真实发现出的品牌、地址、案例关键词、历史关键词。

默认不继续查询宽泛市场规模、行业趋势、消费升级、全国性行业常识。泛行业信息只有在能直接解释当前客户场景、竞争关系或用户决策条件时才允许进入最终 Knowledge。

### 3.5 来源分类

当前搜索 citation 不应永久统一落为 `third_party`。本轮在不新增 approval state machine 的前提下，使用现有 source type 表达来源语义：

- 已由用户/既有确认 command 确认为客户官网：`official_web`；
- 已确认属于客户的公开账号：`client_public`；
- 政府、监管或明确权威主体：`authority`；
- 地图、点评、平台页面：`platform`；
- 新闻/媒体页面：`media`；
- 其余：`third_party`。

AI 搜索发现的疑似官网或账号不能自动升级为 `official_web/client_public`；未经过现有确认 command 前保持保守类型。不得新增通用“source approved”状态机。

### 3.6 客户资料与独立公开证据的边界

`basis=fact` 可以继续表示“这是客户实体相关的可用事实”，但文章消费和确认稿不得忽略 source provenance。

写作语义至少区分：

| source | 确认稿/文章含义 |
| --- | --- |
| `client_input` / `client_file` | 客户提供的信息；普通实体信息可自然使用，高强度能力/效果/保证/数字/比较性主张必须保持来源边界 |
| `client_public` | 客户公开内容；需要按客户公开信息归因 |
| `official_web` | 客户官网信息；需要按官网介绍归因，不能冒充第三方独立评价 |
| `authority` | 权威公开信息；可按权威来源直接或归因使用 |
| `platform` / `media` / `third_party` | 对应第三方公开研究；不得改写为客户自证事实 |
| `derived` | 仅用于场景、推荐角度和写作组织，不能升级为事实 |

不新增 confidence score，不用数字分数替代来源语义。

### 3.7 synthesis 收口

现有 synthesis 增加两条质量合同：

1. **客户特异性优先**：行业常识、区域宏观描述或统计，如果不能支撑客户身份、能力、场景、案例、竞争差异或 GEO 推荐角度，则不进入最终 Knowledge。
2. **确定性去重**：规范化 name/description 完全相同或同 identity 的重复项合并 sourceIds 与关系；不引入 embedding/向量检索。语义近似但无法确定相同时，交给现有 synthesis 合并，不额外建立去重模型。

### 3.8 未完成项展示

Confirmation 不再逐条回显“研究任务未完成 1/2/3…”。

只保留影响文章写作的实际证据缺口，例如：

- 尚未确认官方公开账号；
- 某能力当前仅来自客户资料；
- 暂未找到可核验案例；
- 某授权/资质尚未由独立来源确认。

这仍然由现有 Knowledge/Confirmation 内容派生，不新增持久状态。

### 3.9 KQ1 验收

KQ1 Closure 至少满足：

- 两轮 research 预算和不确定网络“不自动重试”规则不回归；
- round 2 明确围绕 evidence gaps 跟进，而不是重复 generic research；
- generic industry 每轮仍 ≤ 1，且无客户特异性价值的行业内容不会为了填 section 进入最终 Knowledge；
- source provenance 能区分客户资料、客户公开、官网、权威、平台/媒体/第三方；
- AI 不能自动把疑似官网/公开账号升级为已确认客户来源；
- Confirmation 能把“客户提供但尚未独立验证”与“公开/权威证据”区分出来；
- 重复内容不再以两条明显同义且正文一致的条目占据确认稿；
- 自动测试只使用 synthetic customer/search fixtures，不写入真实客户内容。

---

## 4. KQ2 — Article Brief v2 变成可直接写作的“本篇知识包”

### 4.1 目标

继续使用现有 `buildArticleBriefV2()`，不新建 Article Brief owner。目标是让同一份 Brief 同时满足：

- 程序可以验证；
- 用户可以预览；
- Prompt 可以明确知道“哪些是事实、哪些是客户自述、哪些是第三方、哪些只是推荐角度、哪些禁止使用”。

### 4.2 选择范围

Article Brief 继续只选择目标 GEO Question 直接相关的：

- accepted profile facts；
- offerings；
- capabilities；
- scenarios；
- cases；
- recommendationAngles；
- onlinePresence/history（仅在 intent 需要时）；
- competitors（仅 comparison/selection/local 等需要时）；
- external research；
- **全部 restrictions**；
- current Research answer + references + captured metadata。

不把整个 Knowledge、所有客户资料、无关产品或无关场景重新塞回 Prompt。

### 4.3 写作语义由既有证据派生

不新增 canonical evidence class store。由 Article Brief builder 基于：

- item/claim `basis`；
- `sourceIds`；
- source `type`；
- `attributionRequired`；
- restrictions；

计算本次写作用法。

逻辑上 Brief 应让 Prompt 可以区分五组：

1. **客户基础事实**：名称、地区、地址、营业信息等低争议实体信息；
2. **本题相关服务/能力**：只选目标问题相关内容；
3. **推荐角度**：derived，只用于回答“为什么在这个场景可以考虑该客户”，不能变成事实；
4. **当前 GEO 环境**：current Research 中的回答、出现实体、决策维度、客户是否被提及和 answer gaps；
5. **风险边界**：全部 restrictions + 仅客户资料支撑的高强度主张 + 当前仍缺独立证据的关键项。

不要求为了 UI 新增一套结构化持久格式；若需要便于展示的字段，应是 `geo-generation-context` 对同一 Brief 的确定性派生，不能由 Renderer 自己重新分类。

### 4.4 客户资料事实的使用规则

普通实体信息（名称、地址、明确存在的服务名称等）在无冲突时可自然写入。

以下高强度主张若主要来源仅为 `client_input/client_file`，Prompt 必须保持客户来源边界，不得包装成独立第三方结论：

- 最好、第一、领先、唯一等排名/比较性表述；
- 成功率、效果百分比、投诉率、复购率、市场份额等效果/统计数据；
- 团队人数、服务客户数、案例数量等规模数字；
- 官方授权、合作机构、资质等级；
- “可处理全部复杂情况”“无需转诊”等能力承诺；
- “终身质保”“免费返工”等保证性政策；
- 能直接影响医疗、安全、财务或其他高风险决策的确定性结论。

已有 restriction 更严格时，restriction 始终优先。

### 4.5 当前 Research 的职责

Research 继续用于：

- 当前问题真正的回答方式；
- 当前答案出现哪些实体；
- 当前答案明示哪些决策维度；
- 客户是否已被当前答案提到；
- Knowledge 中哪些相关能力没有被当前答案覆盖。

Research 不是客户事实来源；不得因为豆包当前答案写了某内容就升级为客户 Knowledge fact。

### 4.6 Prompt v2 写作合同

`buildPromptV2()` 保留 JSON Article Brief 输入，不再接回完整客户资料。

固定 application/writing contract 增加：

- `client_input/client_file` 表示客户提供信息，高强度主张不得写成第三方独立结论；
- `client_public/official_web` 必须按客户公开信息/官网介绍归因；
- `authority` 按权威来源使用；
- `platform/media/third_party` 只代表对应外部来源；
- `derived/recommendationAngles` 只负责写作角度，不得成为事实；
- current Research 描述当前 GEO 环境，不是客户事实来源；
- restrictions 优先级最高；
- 缺失证据直接省略或使用保守表述，不允许模型补造。

### 4.7 KQ2 验收

KQ2 Closure 至少满足：

- 同一个目标问题只带相关 Knowledge，不把整库重新注入 Prompt；
- 无关 offering/scenario/capability 不进入 Article Brief；
- recommendationAngles 保持 derived 语义；
- 全量 restrictions 继续 fail closed，100000 字符边界不通过静默截断解决；
- source type 对写作归因产生真实效果；
- client-file 高强度主张不能被 Prompt 当成独立第三方结论；
- old Article snapshot / Brief v1/v2 历史读取不被改写；
- Article 仍保存实际使用的不可变生成输入；
- 不新增 Article Brief store、向量检索或额外隐藏 AI 请求。

---

## 5. KQ3 — 可观测 UI：让用户看见知识如何进入文章

### 5.1 Knowledge 页面增加“客户认知摘要”

在现有 Knowledge 页面顶部增加一个 compact read model，不持久化第二份摘要。

摘要至少展示：

- **客户是谁**：名称、地区、核心实体信息；
- **主要提供什么**：核心 offering；
- **已确认的公开/权威证据**；
- **客户提供但尚未独立验证的关键能力**；
- **适合推荐的场景/角度**；
- **尚缺的关键证据**；
- **禁止或谨慎表述**。

它只从当前 Knowledge + source provenance + restrictions 派生。现有详细 section、来源和待确认页继续保留。

目标是用户打开客户后可以快速判断：“系统是否真正理解了这个客户，以及哪些内容只是客户自述”。

### 5.2 生成前增加“本篇将使用的知识”

在用户选定 GEO Question、完成生成预检后、实际 start 前，提供一个可折叠只读预览。

预览必须直接使用真正传给 `buildPromptV2()` 的同一份 Article Brief，不能由 Renderer 自己重新筛选。

至少显示：

- 目标 GEO Question；
- 客户基础事实；
- 本题相关服务/能力；
- 推荐角度；
- 当前 Research 的主要判断维度/出现实体；
- 外部/公开证据；
- 仅客户提供、需要谨慎表达的内容；
- restrictions / 尚未验证项。

列表默认 compact；详情按需展开，避免再次回到大卡片铺满页面。

### 5.3 只读边界

Article Brief Preview 不能：

- 编辑 Knowledge；
- 修改来源类型；
- 接受/拒绝 claim；
- 直接改 Prompt；
- 形成新的持久选择结果。

需要修正 Knowledge 时回到现有 Knowledge 编辑/确认入口；需要重新采集当前答案时回到现有 GEO Question/Research 流程。

### 5.4 KQ3 验收

KQ3 Closure 至少满足：

- Knowledge 摘要是现有 Knowledge 的 read model，不成为第二真源；
- Article Brief Preview 与真正发送给 Prompt v2 的 Brief 完全同源；
- Preview 不自己复制筛选和证据分类逻辑；
- 长文本、空态、部分 Knowledge、只有客户资料、只有外部证据、存在 restrictions 时都可用；
- 不需要打开调试日志即可判断问题位于 Knowledge、Brief 选择还是最终写作；
- Renderer typecheck/build 与直接 UI 回归通过。

---

## 6. 真实产品验收方法

自动测试继续只使用 synthetic fixtures。真实客户只用于用户授权后的人工产品验收，不进入仓库 fixture、日志或测试快照。

人工验收时固定选择同一客户的三类问题：

1. **本地选择类**：区域 + 品类 + “怎么选/哪家合适”；
2. **具体服务类**：区域 + 某个核心 offering；
3. **场景类**：特定人群/需求/家庭/预算/距离等场景。

每个问题依次检查 A → B → C：

```text
A. 完整 Customer Knowledge
        ↓
B. 本篇 Article Brief
        ↓
C. 最终 Article
```

判定规则：

- A 差：回到 KQ1 Research/Synthesis；
- A 好、B 漏关键知识或带大量无关内容：修 `geo-generation-context`；
- A/B 都正确、C 仍差：只优化 Prompt/模板，不继续扩 Knowledge schema。

这条诊断顺序是本轮重要完成标准，避免再次出现“文章不好 → 加字段 → 加规则 → 加系统”的无边界演进。

---

## 7. 明确不做

本轮不实施：

- 向量数据库；
- embedding；
- 通用 claim/evidence graph；
- confidence/completeness 数字评分；
- 新 Article Brief owner/store；
- 多 Agent 研究；
- 通用爬虫/Playwright 研究框架；
- 自动周期重查；
- Research answer 第二存储；
- 为 confirmation 新增 AI 扩写；
- 全量 GEO Question 自动查询；
- 弱客户因资料不足而禁止文章生成；
- 为来源建立复杂 approval state machine；
- 重新设计 provider transport 或 Generation Batch v2。

---

## 8. 实施顺序与文件范围

### KQ1

主要 owner：

- `auto—publish/src/content/geo-knowledge-research.js`
- 现有 source/merge/confirmation 直接 owner（仅在来源分类和展示语义需要时）
- 对应 synthetic tests

不得顺带改 Generation Batch 或发布链路。

### KQ2

主要 owner：

- `auto—publish/src/content/geo-generation-context.js`
- `auto—publish/src/content/prompt-builder.js`
- Article snapshot validator/serialization 的直接调用方（仅兼容性需要时）
- 对应 tests

不得另建 Article Brief store。

### KQ3

主要 owner：

- 现有 GEO Knowledge Renderer feature/view
- 现有 Generation Wizard/Question generation feature
- 对应 main/bridge/preload 只在现有 Brief/read-model capability 无法直接复用时做最小扩展
- 对应 Renderer tests

Renderer 不能重新拥有 selection/evidence semantics。

---

## 9. 测试与 Review 边界

每阶段先跑最贴近改动的 synthetic unit/contract/UI tests，再执行该阶段涉及的 typecheck/lint/build。不要为了本计划新增大量“源码形状测试”。

优先证明公开行为：

- planner 不再重复泛行业任务；
- source provenance 不被自动升级；
- customer-provided high-impact claim 的写作边界；
- Article Brief question relevance；
- restrictions 完整；
- Preview 与真实 Brief 同源；
- partial/empty evidence 不阻塞生成；
- 不确定远端请求不自动重试。

Primary Review 只检查当前阶段 owner、直接调用方和 acceptance；blocking remediation 后做 bounded re-review，不重新扩大为全项目审计。

---

## 10. 完成定义

只有以下条件全部满足，本计划才可标记 COMPLETE：

1. KQ1、KQ2、KQ3 全部 Closure；
2. Knowledge Research 以客户证据补全为主，泛行业内容不再为了填 section 占据主要结果；
3. 客户资料、客户公开、官网、权威、平台/媒体/第三方来源在文章消费侧有明确不同语义；
4. 真实搜不到的内容允许明确保持缺失，不通过 AI 猜测补齐；
5. Customer Knowledge 没有新增第二 store 或 generic facts 图谱；
6. Article Brief 继续由 `geo-generation-context` 唯一派生，并且一篇只围绕一个 GEO Question；
7. Prompt v2 只消费 Article Brief + template，不重新发送完整客户资料；
8. recommendations/derived 不被写成事实，高强度客户自述不被包装成独立第三方结论；
9. restrictions 全量生效，缺失证据不触发编造；
10. Knowledge 页面可以快速看到“已知 / 客户自述 / 外部证据 / 推荐角度 / 缺口 / 限制”；
11. 生成前可以看到真正将被 Prompt 消费的本篇 Article Brief；
12. 用户能够按 A（Knowledge）→ B（Brief）→ C（Article）定位内容质量问题；
13. 自动测试不包含真实客户内容，真实 API/真实豆包调用仍遵守逐次授权；
14. 没有引入向量库、评分体系、多 Agent、第二 Brief owner 或其他本计划明确排除的过度工程化能力。

---

## 11. 与当前 CP 计划的关系

本计划是对真实客户试用后暴露的“Knowledge 质量 + Article Brief 消费可观测性”问题的增量收口，不否定 `AutoPublish-GEO-Content-Production-Implementation-Plan-v1.4.md` 已完成的 CP-0～CP-4，也不改变 CP-5 当前职责。

在 CP-5 Closure 前：

- 本文件只作为后续计划保存；
- 不替换 `docs/WORK-INDEX.md` 当前执行入口；
- 不与 CP-5 并行实施。

CP-5 Closure 后，如用户决定继续本轮，则把本文件登记为唯一当前 GEO 内容质量实施入口，按 KQ1 → KQ2 → KQ3 串行执行。

---

## 12. Decision Log

- **KQD1**：不再扩展 Knowledge canonical schema；当前问题属于研究质量、来源语义和文章消费，而不是字段不足。
- **KQD2**：第二轮 research 的核心输入是 evidence gaps，但 gap 只存在于单次研究 runtime，不持久化为新状态 owner。
- **KQD3**：客户资料中的 `basis=fact` 不等于“独立第三方验证”；写作语义由 basis + source provenance + restrictions 共同决定。
- **KQD4**：source type 复用现有 `client_input/client_file/client_public/official_web/authority/platform/media/third_party` 等语义；疑似客户来源未经确认不能自动升级。
- **KQD5**：Article Brief v2 继续是唯一“本篇知识包”，不建立 Article Brief v3 store 或 Renderer 平行筛选逻辑。
- **KQD6**：Knowledge 摘要和 Article Brief Preview 都是 read model；前者来自 Knowledge，后者必须直接来自真正送入 Prompt 的 Brief。
- **KQD7**：内容质量排查固定按 A Knowledge → B Brief → C Article 顺序；只有 A/B 正确后才继续优化写作 Prompt。
- **KQD8**：弱客户允许资料不足、允许搜不到，但不得通过推测创造优势；应优先形成范围更窄、证据可支撑的场景化推荐角度。

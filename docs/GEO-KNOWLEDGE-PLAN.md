# 客户 GEO 知识库实施计划

## 范围与授权

2026-09-19，基线 `93bea300`，分支 `codex/geo-knowledge-base`。
用户授权规划后直接实施、按阶段验证并提交；不授权 push、合并、真实 API 请求或付费操作。
产品基线为用户提供的 `AUTOPUBLISH-GEO-KNOWLEDGE-BASE-DESIGN.md`（2026-09-19），原文归档到 [GEO-KNOWLEDGE-DESIGN.md](GEO-KNOWLEDGE-DESIGN.md)。本计划记录实现决策，不修改原始基线。
仅使用用户指定的一份 DOCX 做本地材料读取验证，不提交客户原文；自动化验收使用合成资料。

## 实施合同

- 独立 JSON store 是知识库唯一 writer；复用材料解析、路径边界与原子写入。
- 内容对象区分 `basis: fact/research/derived/candidate` 与 `origin: ai/manual`；人工保存锁定。
- 来源由程序登记；模型只能引用输入来源 ID。联网引用必须来自 Responses 返回的引用 metadata，模型正文的 URL 不能升级为证据。
- 稳定对象 ID 与更新身份绑定；重新生成保留旧项、锁定项及关联，冲突进入 restrictions。保存使用 revision 防止 stale 编辑覆盖。
- 同客户生成不重复启动；后台生成基于开始版本，保存时检查版本，冲突不覆盖；退出/切内容库取消请求，重启不自动补发。
- 资料不足仍可生成；单研究任务失败保留部分结果；关键提取/整理或保存失败保留旧知识库。仅 JSON/schema 错误允许一次修复请求，网络结果不确定不自动重试。
- `research-store` 继续拥有真实回答；问题关联指向现有采集问题身份，当前回答按该身份读取。文章关联优先从文章来源快照投影，避免双写。
- 知识库增强现有文章生成上下文，不取消现有生成资料集与 GEO 回答前置要求；无知识库的现有流程继续可用。
- 第一版导出 Markdown；不做向量库、通用 provider、多 Agent、自动周期检测或浏览器知识研究。

## 阶段与 gate

| 阶段 | 范围 | 状态 |
| --- | --- | --- |
| K1 | schema、store、路径、材料提取、豆包配置与基础调用 | COMPLETE |
| K2 | 有界研究计划、联网引用、部分失败、整理 | COMPLETE |
| K3 | service/IPC/bridge、知识库页面、编辑锁定、导出 | COMPLETE |
| K4 | GEO 问题进入现有采集、关联回答 | COMPLETE |
| K5 | 按问题选择知识、生成快照与文章关联 | COMPLETE |
| K6 | 组合回归、构建、有限审查与证据收口 | COMPLETE_LOCAL |

每阶段：实现 → 定向行为测试 → Primary Review → 修复阻塞问题 → Bounded Re-review → 提交。
提交前按应用 README 运行 core 与 integration；UI 阶段加类型检查、构建和页面交互验证。
审查遵循现有 AUDIT-PROTOCOL，不启动无边界重复 review。串行实施，不启用子 agent。

## 验证矩阵

资料少/空；材料读取失败；合法/非法 schema；引用缺失或伪造；路径穿越/链接；原子写失败保留旧值；
重复生成；stale 保存；锁定保护；更新冲突；单任务失败；关键调用失败；取消/切内容库；
重复加入采集；采集问题编辑/删除；旧回答保留；生成知识选择及 restrictions；UI 空态/失败/禁用/交互。

## 发现与待验收

- 当前代码与设计标注基线一致，本机 Node 24 与桌面 CI 一致。
- 现有原子写入器默认可在替换失败时返回 false；知识库必须显式要求失败传播。
- 当前采集问题 ID 同时用于 research 存储身份，应复用该关联，不复制回答。
- 真实豆包接口、费用与客户资料发送仅在用户提供配置并明确授权后验证；此前测试不代表真实模型效果。

## 阶段证据

### K1

- `node --test tests/geo-knowledge.test.js tests/workspace-paths.test.js`：初始 14/14；增加凭据、取消和目录链接用例后 `node --test tests/geo-knowledge.test.js` 9/9。
- `npm test`：596/596；`npm run test:integration`：1259/1259（新增补充用例另做上述定向验证）。
- 新增 JS 的 ESLint、`npm run typecheck:main`、`git diff --check` 通过。
- 应用现有 DOCX 解析器成功读取用户指定文档（3602 字符），未发送客户资料到网络。
- Primary Review：原子写返回 false、stale 保存、锁定/冲突、来源引用、取消迟到结果、路径链接均有行为覆盖；无未关闭阻塞 finding。
- 网络调用仅实现请求合同和合成 transport 验证，真实 API 尚未执行。官方接口参考：https://www.volcengine.com/docs/82379/1585128 。
- commit：本阶段提交 `feat: add GEO knowledge storage and material extraction`（具体 hash 由 Git 历史记录）。

### K2

- 定向 `node --test tests/geo-knowledge.test.js tests/geo-knowledge-research.test.js`：12/12；定向 ESLint 和 diff 检查通过；`npm test`：596/596。
- `npm run test:integration`：1264/1265，唯一失败为未修改的 `renderer-history-editor-flow.test.js` 焦点即时断言；独立复跑该文件验证。该阶段没有 renderer 变更，最终 K6 再跑整体 gate。
- Primary Review 修复 `INTRODUCED_BY_CHANGE`：整理候选 profile 不得覆盖材料提取的事实；补断言后 bounded re-review 通过。
- 一轮最多 8 个研究任务；引用无官方身份认证时保守登记 third_party；模型只引用程序来源 registry。真实效果留待 API 验收。

### K3

- 知识库入口、分区浏览、进度、取消、人工编辑锁定、Markdown 导出、加密配置设置已接通；设置保存不触发网络。
- IPC/服务/fixture matrix 8/8，知识库后端回归 13/13，隔离浏览器交互 1/1；截图检查通过。人工改写后来源改为 client_input，不继续假称原文件支持该陈述。
- `npm test` 596/596。首轮 integration 1266/1268：新增设置命令与类型 owner 未登记到既有合同清单；补齐明确 owner 后定向 10/10，最终整体复跑 1268/1268。
- lint、main/bridge/renderer typecheck、renderer/preload build 通过。format:check 中本次 transport 格式已修复；剩余四个未修改基线文件格式问题（identities.js、authenticated-runtime、phase-01-domain-contracts、phase-08-content-lifecycle）未扩大修改。
- K2 唯一失败文件独立复跑 19/19，K3 首轮整体该文件也已通过。
- Primary Review 与 bounded 修复覆盖鉴权 transport、配置秘密不回传、手动 provenance、revision、页面空态/错误/禁用/保存；无剩余已知阻塞 finding。

### K4

- 复用现有采集 service 创建问题；文本规范化去重，已有停用项不自动启用。写入前验证全部选择与 revision，跨文件失败显式 GEO_LINK_PARTIAL，重试复用已落盘问题。
- 真实回答只读 research-store，不写入知识库；采集问题改名/删除、知识库问题改名均使旧关联失效；“客户出现”仅代表客户名称字面匹配。
- 新增行为测试 3/3；IPC/fixture matrix 与 service 8/8；隔离页面测试 1/1（选题加入、回答详情、原有编辑/设置）。lint、三项 typecheck、preload 构建、diff 检查通过。
- `npm test` 596/596；`npm run test:integration` 1271/1271。
- Primary Review：单 writer、无真实网络、跨 owner partial/retry、旧回答隔离；无未关闭阻塞 finding。选择问题不会自动启动真实采集。

### K5

- 两条现有生成用例均注入同一知识库读取 owner；只选择与当前 research 身份/问题文本匹配的 GEO 问题，按 relatedOfferingIds / relatedScenarioIds 选择知识。没有知识库/匹配问题仍走原生成流程，资料和回答前置条件不变。
- 候选宣传不作正向事实；相关能力只接纳 fact，外部背景只接纳 research；全量 restrictions 优先于材料/模板。上下文超过 100000 字符明确失败，不截断限制。
- article.knowledgeSnapshot 保存实际输入 context、知识版本及问题身份，后续知识更新不修改历史快照；普通文章编辑仅修改原有 title/content，不覆盖 provenance。
- 文章摘要从快照投影 geoQuestionIds；知识库问题详情只读摘要并复用 ArticleLifecycle projection 获取状态，最多展示 100 篇，统计全部关联文章，不读取正文，不写回 articleIds/发布计数。
- 新增选择/生成持久化/文章关联 3/3；摘要与类型 owner 回归合计 15/15；生成/prompt/IPC fixture 34/34；隔离页面 1/1。lint、三项 typecheck、preload/renderer build、diff 检查通过。
- `npm test` 596/596；`npm run test:integration` 1274/1274。
- Primary Review 与直接边界检查：快照不可变、旧流程无知识可用、摘要 transport 显式合同、发布事实唯一 owner；无未关闭阻塞 finding。

### K6

- 本地完整闭环使用合成数据：资料提取/整理 → 保存 → 加入现有采集 → 保存合成回答 → 生成文章 → 重启 → 查询文章与发布状态；外部模型和发布 observation 均为 fixture，无真实外部副作用。
- Integration Review 发现并修复 `CROSS_COMPONENT_INTERACTION / P2`：profile 补充新字段不应制造整对象冲突。现在逐字段保留旧冲突值、补充非冲突值，仅记录冲突字段；人工锁定规则不变。bounded 回归与闭环合计 17/17。
- 最终 `npm test` 596/596；`npm run test:integration` 1276/1276（238 文件，零跳过）；`npm run lint`、`typecheck:main`、`typecheck:bridge`、`build:renderer`（包含 renderer typecheck）、`build:preload`、`git diff --check` 通过。最终验证后仅更新文档/evidence，未再修改生产源码或测试。
- `GEO_CAPTURE_SCREENSHOT=1 node --test tests/renderer-geo-knowledge.test.js` 1/1；已检查客户知识与问题详情截图，选择/禁用/回答/关联文章均可见。截图只含合成数据，保存于 ignored build/test-results，不作为客户原文 evidence。
- `npm run format:check` 仅剩 K3 记录的四个基线文件失败；`git diff --exit-code 93bea300 -- <上述四文件>` 为 0，未将无关格式债混入功能。Vite 仍有既有大 chunk 提示，不影响构建成功。
- 未运行 release/unpacked/真实账号验收：本次未打包发行，也未取得真实外部操作授权。用户 DOCX 仅验证本地解析，尚未验证真实 AI 提取/联网质量。
- Bounded Re-review 仅检查 profile 修复 diff、来源/锁定不变量与直接提取/整理/生成回归；无剩余已知阻塞 finding。未引入旁路事实 writer，未迁移或删除生产数据，未 push/merge。
- 交接 Git 状态：阶段改动全部提交到 codex/geo-knowledge-base；用户原有未跟踪 DOCX 与根 work/ 保留且未提交。K1–K6 本地范围完成，真实 API gate 仍待用户配置与授权，不声称端到端真实模型验收完成。

## 阶段提交

- K1 `c788c995`：存储、材料提取、配置基础。
- K2 `6449c00f`：有界联网研究与整理。
- K3 `9b0deb3b`：工作台、编辑、导出、设置。
- K4 `2d3c896e`：问题采集及真实回答关联。
- K5 `3a04f638`：文章知识快照及关联投影。
- K6：本计划最终验证与收口提交（hash 见 Git 历史）。

## 真实 API 验收 gate（未通过）

### 设置页连接测试（用户追加需求）

- 用户手动生成后反馈“豆包拒绝了配置”。旧提示合并了 401/403，仅凭截图不能确定具体状态或断言密钥错误；真实知识库链路尚未验收通过。
- 此前临时 Electron helper 因加载错误及加密配置读取失败未发起 API 请求（安全观测 calls=0）；用户随后接手手动测试，不自动重试真实请求。
- 增加已保存配置的单请求连接测试、独立联网测试；固定无客户内容文本，不写配置/客户知识、不显示模型原文；界面明确用量与未保存限制。设置 command owner 复用现有机制；应用服务拥有互斥和销毁取消边界。
- 401/403 分别提示鉴权/权限；能力拒绝、无引用、网络结果不确定使用安全提示，不暴露服务商原始正文、不自动重试或切换接口。本阶段仅假 transport 和隔离页面验证，真实 Key 留给用户在运行中的开发版手动测试。
- Primary Review / 首轮集成：1282/1283。`CROSS_COMPONENT_INTERACTION`：固定鉴权提示中的英文 API Key 触发既有敏感词断言；改为等义中文“密钥”，保留原安全断言。Bounded Re-review 仅检查该文案、IPC 安全错误、设置页显示与直接回归；定向安全/连接/IPC 20/20，隔离页面 1/1，未发现剩余阻塞问题。
- 最终代码验证：`npm test` 596/596；`npm run test:integration` 1283/1283（240 文件，无跳过）；`npm run lint`、`typecheck:main`、`typecheck:bridge`、`build:renderer`（含 renderer typecheck）、`build:preload`、`git diff --check` 通过。Playwright 隔离设置交互验证连接/联网成功、401 安全提示、未保存禁用和编辑后清除旧结果；不使用真实凭据。
- 格式 gate 仍仅四个未修改基线文件失败，已核对相对 93bea300 无 diff；既有 Vite 大 chunk 提示保留。最终验证后只更新文档/evidence；阶段提交到 codex/geo-knowledge-base，不 push/merge、不提交用户 DOCX、临时 helper 或 work/。用户重启开发版后手动测试真实接口；真实质量/费用与权限仍未通过验收。

### Coding Plan 接口适配（用户追加授权）

- 设置页显式选择 Coding Plan 或标准方舟，并展示 Base URL、套餐外计费和能力未验证提示；保存不发请求。新配置默认 Coding Plan，旧 version 1 配置保持标准地址，显式保存后写 version 2；空密钥保留本机加密凭据。
- 配置 owner 仅接受两个可信地址；transport 使用所选地址的 `/responses`，禁止重定向，不自动回退标准地址或重试被拒绝请求。
- Responses/工具请求被拒绝、联网回复无可核验引用均返回安全错误并停止后续研究；无引用不是“不支持联网”的确定证据，不静默当作联网成功。
- 本地测试使用合成数据和假 transport；真实 Coding Plan、web_search 权限、引用格式及套餐用途尚未验收，不上传用户资料。
- 最终验证：定向 `node --test`（geo-coding-plan、geo-knowledge、geo-knowledge-research、geo-knowledge-ipc、phase-06-production-ipc-fixture-matrix）23/23；`node --test tests/renderer-geo-knowledge.test.js` 1/1，覆盖保存地址、切换与计费提示；`npm test` 596/596，`npm run test:integration` 1279/1279（239 文件，无跳过）。
- `npm run lint`、`typecheck:main`、`typecheck:bridge`、`build:renderer`（含 renderer typecheck）、`build:preload` 通过；`format:check` 仅原四个基线失败文件，已再次以 `git diff --exit-code 93bea300 -- <四文件>` 确认未修改。既有 Vite chunk 提示保留。
- Primary Review 检查配置版本兼容、密钥不回传、可信地址/计费边界、研究停止及直接 IPC/UI 调用方，无已知阻塞 finding；未扩大无关 owner。使用 Playwright 隔离页面测试验证设置交互，无真实外部调用。最终验证后仅更新文档；提交分支 codex/geo-knowledge-base，不 push/merge，用户 DOCX 与 work/ 不提交。

需要用户在本机“设置 → 豆包 GEO”配置 API Key 与支持 Responses/web_search 的模型或 Endpoint ID，并明确授权将指定测试资料发送到服务商以及本次调用费用。不要把 Key 提交到 Git 或写进计划。

授权后先限定一个客户、用户指定 DOCX、单轮最多 8 个研究任务，验证真实响应/引用 metadata、研究质量、来源准确性和成本；遇到鉴权拒绝、模型/工具不支持或请求结果不确定立即停止，不自动重复付费请求。此 gate 未通过前不宣称真实模型效果已验收。

当前已知边界：对象去重依赖稳定 identity，并非语义相似度去重；外部引用保守标为 third_party，不凭搜索引用直接认定官网/权威；第一版导出 Markdown，细分业务属性记录在对象说明中，不建立行业特化 schema。

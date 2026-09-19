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
| K6 | 组合回归、构建、有限审查与证据收口 | PENDING |

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

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
| K3 | service/IPC/bridge、知识库页面、编辑锁定、导出 | READY |
| K4 | GEO 问题进入现有采集、关联回答 | PENDING |
| K5 | 按问题选择知识、生成快照与文章关联 | PENDING |
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

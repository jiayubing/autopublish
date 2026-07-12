# GEO AI Content Integration Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** 将 F:\携程 中已验证的豆包回答读取、客户知识库、平台多模板和 OpenAI 兼容 AI 写作能力，稳定集成到 F:\官媒投稿\auto—publish，生成文章可直接进入现有编辑和投稿流程。

**Architecture:** auto—publish 是唯一正式桌面产品。GEO/AI 能力以独立 Node.js 领域模块接入，不把 Python CLI、SQLite 或 React 组件直接互相耦合。Electron 主进程通过 service 和 IPC 暴露稳定接口，React 只负责展示和用户操作；客户资料、采集结果、模板和生成文章统一存放在应用 workspace 中，并保留旧数据迁移适配层。

**Tech Stack:** Electron 33, Node.js, React, Node built-in test runner, dotenv, existing runtime paths, OpenAI-compatible HTTP API, Markdown/YAML front matter.

---

## 0. 范围、约束和最终流程

本计划覆盖客户资料读取、豆包结果读取、平台多模板、AI 生成、文章保存、Electron 接入、旧数据迁移和最终投稿闭环。

第一期不实现自动登录豆包、自动发布到携程、向量数据库、复杂 RAG、云端客户管理、在线协作和多模型路由。豆包采集继续由 F:\携程负责，Electron 第一阶段读取已经保存的采集结果。

目标流程：

~~~text
选择客户 -> 查看客户资料和搜索词 -> 查看豆包回答及参考资料
-> 选择平台 -> 选择具体场景/模板 -> 生成文章
-> 编辑和保存草稿 -> 进入现有投稿流程
~~~

总通过标准：全量 Node 测试通过；没有 API Key 时应用仍能启动；文件、模板、API 和旧数据异常均有明确错误；生成文章能在现有编辑器中打开，原有投稿功能不回归。

## 1. Workspace 和数据契约

**Files:**
- Create: F:\官媒投稿\auto—publish\docs\content-workspace-contract.md
- Modify: F:\官媒投稿\auto—publish\src\core\files.js
- Modify: F:\官媒投稿\auto—publish\desktop\runtime-paths.js
- Test: F:\官媒投稿\auto—publish\tests\content-workspace.test.js

- [ ] Step 1: 写失败测试。使用临时根目录验证生成 clients、research、templates、generated、published、logs 六个目录。客户名 xxx、xxx餐厅、xxx住宿均可用；空名称和包含 .. 的名称必须拒绝；解析后的客户路径必须仍位于 clients 内。
- [ ] Step 2: 运行失败测试。命令：npm test -- --test-name-pattern="content workspace"。预期：FAIL，因为 workspace 内容模块尚未存在。
- [ ] Step 3: 实现 getContentWorkspace(root)，返回 root、clients、research、templates、generated、published、logs。所有路径只由该模块拼接，客户路径使用 path.resolve 后做边界检查。
- [ ] Step 4: 运行命令：npm test -- --test-name-pattern="content workspace"。预期：PASS，覆盖正常名称、中文名称、空名称和目录穿越名称。
- [ ] Step 5: 在 docs/content-workspace-contract.md 固定对象 Client、ResearchQuery、Template、GeneratedArticle。GeneratedArticle.source 必须记录 client_material、doubao_answer、references、template 是否参与生成。
- [ ] Step 6: 提交：git add src/core/files.js desktop/runtime-paths.js tests/content-workspace.test.js docs/content-workspace-contract.md；git commit -m "chore: define content workspace contract"。通过标准：后续模块不自行拼接 workspace 路径。

## 2. 客户知识库和豆包结果

**Files:**
- Create: F:\官媒投稿\auto—publish\src\content\client-knowledge.js
- Create: F:\官媒投稿\auto—publish\src\content\research-store.js
- Test: F:\官媒投稿\auto—publish\tests\client-knowledge.test.js
- Test: F:\官媒投稿\auto—publish\tests\research-store.test.js

- [ ] Step 1: 写客户读取测试。临时目录包含 search_query.txt、brand.md、service.txt、ignored.png 和 articles/old.md。断言读取搜索词和三个文本入口；忽略 articles、非文本文件和生成文章；客户不存在、搜索词不存在、搜索词为空时返回明确错误。
- [ ] Step 2: 写 research 测试。用 JSON fixture 验证回答和参考资料读取；另测回答为空、参考资料为空、记录不存在和旧字段缺失。空回答不能被当成成功结果。
- [ ] Step 3: 运行命令：npm test -- --test-name-pattern="client knowledge|research store"。预期：FAIL。
- [ ] Step 4: 实现 listClients、getClient、loadClientKnowledge、readSearchQuery。允许 txt、md、markdown、json；统一 UTF-8；返回文件名、路径和正文；客户 id 与目录名分开，目录名不要求包含行业。
- [ ] Step 5: 实现 research/<client-id>/<query-id>.json，提供 listResearch、getResearch、saveResearch。写入采用临时文件后 rename。参考资料统一为 title、url、snippet。
- [ ] Step 6: 错误码至少包括 CLIENT_NOT_FOUND、SEARCH_QUERY_MISSING、RESEARCH_NOT_FOUND、RESEARCH_EMPTY_ANSWER。运行测试预期 PASS。
- [ ] Step 7: 提交：git add src/content tests/client-knowledge.test.js tests/research-store.test.js；git commit -m "feat: add client knowledge and research stores"。

## 3. 平台多模板和 Prompt

**Files:**
- Create: F:\官媒投稿\auto—publish\src\content\template-store.js
- Create: F:\官媒投稿\auto—publish\src\content\prompt-builder.js
- Test: F:\官媒投稿\auto—publish\tests\template-store.test.js
- Test: F:\官媒投稿\auto—publish\tests\prompt-builder.test.js
- Migrate: F:\携程\config\templates\ to workspace\templates\

- [ ] Step 1: 写多模板测试。同一平台准备 templates/ctrip/榜单.md 和 templates/ctrip/探店攻略.md。断言按平台列出两个模板，按场景精确选择；缺 front matter、平台不匹配或正文为空时拒绝加载。
- [ ] Step 2: 写 Prompt 测试。固定客户资料、豆包回答、参考资料和模板，断言 Prompt 包含四个标题：客户资料、豆包搜索问题及回答、豆包参考资料、平台与文案模板要求。客户事实优先，模板要求优先于默认文风，缺回答时不能构造已完成调研的 Prompt。
- [ ] Step 3: 运行命令：npm test -- --test-name-pattern="template store|prompt builder"。预期：FAIL。
- [ ] Step 4: 解析 YAML front matter：platform、scenario、name；template-store.js 只负责发现、解析、筛选和校验，不调用 AI。
- [ ] Step 5: 实现 buildPrompt(input)，返回 system 和 user。加入事实边界：没有的信息不得编造；不确定信息使用中性表达；参考资料不得自动被写成客户官方背书。
- [ ] Step 6: 运行命令：npm test -- --test-name-pattern="template store|prompt builder"。预期：PASS，覆盖两个平台、同平台多个模板、中文、缺字段和恶意路径。
- [ ] Step 7: 提交：git add src/content tests/template-store.test.js tests/prompt-builder.test.js；git commit -m "feat: add platform template store and prompt builder"。

## 4. OpenAI 兼容客户端和文章生成

**Files:**
- Create: F:\官媒投稿\auto—publish\src\content\ai-client.js
- Create: F:\官媒投稿\auto—publish\src\content\article-generator.js
- Modify: F:\官媒投稿\auto—publish\.env.example
- Test: F:\官媒投稿\auto—publish\tests\ai-client.test.js
- Test: F:\官媒投稿\auto—publish\tests\article-generator.test.js

- [ ] Step 1: 写 HTTP mock 测试。验证请求地址为 AI_BASE_URL/chat/completions，请求体包含 model 和 system/user messages，API Key 位于 Bearer header。测试 401、429、500、超时和不完整 JSON。
- [ ] Step 2: 写生成器测试。注入 fake AI client，验证流程为客户资料 -> 豆包结果 -> 非空校验 -> 模板 -> Prompt -> AI -> 内容清理 -> 返回文章。重复输入不得静默覆盖旧文章。
- [ ] Step 3: 运行命令：npm test -- --test-name-pattern="ai client|article generator"。预期：FAIL。
- [ ] Step 4: 实现客户端配置：AI_API_KEY、AI_BASE_URL=https://provider.example/v1、AI_MODEL、AI_TIMEOUT_MS=60000。AI_BASE_URL 只到 /v1，内部再拼 /chat/completions；填入完整 endpoint 时返回配置错误。Key 不写日志、文章或错误详情。
- [ ] Step 5: 实现 generateArticle({ clientId, researchQueryId, platform, templateId })。任何一步失败都不保存成功文章；返回对象必须包含标题、正文、来源和时间。
- [ ] Step 6: 运行命令：npm test -- --test-name-pattern="ai client|article generator"。预期：PASS，覆盖配置错误、超时、空回答、AI 空输出、Markdown 和重复生成。
- [ ] Step 7: 提交：git add src/content .env.example tests/ai-client.test.js tests/article-generator.test.js；git commit -m "feat: add openai compatible article generation"。

## 5. 文章存储和旧数据迁移

**Files:**
- Create: F:\官媒投稿\auto—publish\src\content\article-store.js
- Create: F:\官媒投稿\auto—publish\src\content\legacy-migration.js
- Create: F:\官媒投稿\auto—publish\scripts\migrate-geo-data.js
- Modify: F:\官媒投稿\auto—publish\src\core\logger.js
- Test: F:\官媒投稿\auto—publish\tests\article-store.test.js
- Test: F:\官媒投稿\auto—publish\tests\legacy-migration.test.js

- [ ] Step 1: 写文章存储测试。验证保存 generated/<client-id>/<article-id>.md 和同名 JSON；Markdown 可人工编辑，JSON 保存元数据和来源；列表按 updatedAt 倒序；损坏文件返回 ARTICLE_INVALID。
- [ ] Step 2: 写迁移测试。fixture 模拟 F:\携程\clients、data\geo_data.db 和 output，验证客户目录、search_query、旧文章、豆包回答和参考资料被转换；原始数据不删除；重复迁移不重复写入。
- [ ] Step 3: 运行命令：npm test -- --test-name-pattern="article store|legacy migration"。预期：FAIL。
- [ ] Step 4: 实现存储和迁移。采用临时文件后 rename。新增命令：node scripts/migrate-geo-data.js --source "F:\携程" --workspace "<workspace>" --dry-run；正式迁移也不得删除源文件。禁止把完整 Prompt 和 API Key 写入迁移产物。
- [ ] Step 5: 运行命令：npm test -- --test-name-pattern="article store|legacy migration"。预期：PASS；对真实项目先执行 dry-run。
- [ ] Step 6: 提交：git add src/content scripts tests/article-store.test.js tests/legacy-migration.test.js src/core/logger.js；git commit -m "feat: persist articles and migrate geo data"。

## 6. Electron Service 和 IPC

**Files:**
- Create: F:\官媒投稿\auto—publish\desktop\services\ai-content-service.js
- Create: F:\官媒投稿\auto—publish\desktop\ipc\ai-content-ipc.js
- Modify: F:\官媒投稿\auto—publish\desktop\main.js
- Test: F:\官媒投稿\auto—publish\tests\ai-content-service.test.js
- Test: F:\官媒投稿\auto—publish\tests\ai-content-ipc.test.js

- [ ] Step 1: 写 service 测试，覆盖 listClients、getClient、listResearch、getResearch、listTemplates、generateArticle、saveArticle、listGeneratedArticles。非法 id、platform、template id 在 service 层拒绝。
- [ ] Step 2: 写 IPC 测试。模拟 ipcMain.handle，验证 IPC 只做参数校验、调用 service 和统一响应包装：成功为 { ok: true, data }，失败为 { ok: false, error: { code, message } }。
- [ ] Step 3: 运行命令：npm test -- --test-name-pattern="ai content service|ai content ipc"。预期：FAIL。
- [ ] Step 4: 实现 service 注入 workspace、stores、generator、logger；实现频道 content:list-clients、content:get-client、content:list-research、content:get-research、content:list-templates、content:generate-article、content:save-article、content:list-generated-articles。
- [ ] Step 5: 运行 npm test。预期：新增测试通过，原有测试不减少、不改变断言含义。
- [ ] Step 6: 提交：git add desktop/main.js desktop/ipc desktop/services tests；git commit -m "feat: expose AI content workflow through Electron IPC"。

## 7. React 内容工作台

**Files:**
- Create: F:\官媒投稿\auto—publish\media-workbench\src\features\content\ContentWorkbench.jsx
- Create: F:\官媒投稿\auto—publish\media-workbench\src\features\content\content-api.js
- Create: F:\官媒投稿\auto—publish\media-workbench\src\features\content\content.css
- Modify: F:\官媒投稿\auto—publish\media-workbench\src\App.*（以实际入口为准）

- [ ] Step 1: 实现 content-api.js，组件不直接调用原始 Electron API；每个请求处理 loading、成功、空数据和错误状态。
- [ ] Step 2: 实现客户、搜索词、豆包回答和参考资料预览。回答为空时显示不可生成状态。
- [ ] Step 3: 实现平台和模板选择。选择平台后只加载该平台模板；同平台不同场景可切换，不把餐饮或住宿写死。
- [ ] Step 4: 实现生成、取消、重试和编辑。生成期间防重复提交；失败可重试；成功后显示标题和正文编辑区；错误文本不得写入正文。
- [ ] Step 5: 复用已有文章/草稿能力和投稿流程，只传递标题、正文、客户、平台、生成文章 id，不复制新的发布逻辑。
- [ ] Step 6: 运行 npm test 和 npm run build:renderer。预期：测试和 renderer 构建通过；窄窗口下客户名、模板名、错误信息和按钮不溢出。
- [ ] Step 7: 提交：git add media-workbench/src desktop src tests；git commit -m "feat: add GEO AI content workbench"。

## 8. 真实数据、API 和发布闭环验收

**Files:**
- Create: F:\官媒投稿\auto—publish\docs\content-acceptance-checklist.md

- [ ] Step 1: 在独立 workspace 创建 clients/xxx，放入 search_query.txt、brand.md、service.md、location.md，只使用公开内容。
- [ ] Step 2: 导入一条含回答和参考资料的 research，以及一条空回答 research，验证成功和阻断路径。真实采集仍由 F:\携程执行，Electron 读取导出结果。
- [ ] Step 3: 只在本机 .env 配置 AI_API_KEY、AI_BASE_URL、AI_MODEL、AI_TIMEOUT_MS。先撤销已暴露的旧 Key；.env.example 只能保留空值和示例地址。
- [ ] Step 4: 执行成功路径：选择客户 -> 查看搜索词 -> 查看回答字数和参考资料数 -> 选择平台 -> 分别选择两个模板 -> 生成两篇文章 -> 保存 -> 在现有编辑器打开 -> 进入投稿流程。
- [ ] Step 5: 执行失败路径：断网、错误 URL、删除回答、删除模板、填写不存在客户，确认 UI 可理解、应用不崩溃、不生成空文章、不污染旧草稿。
- [ ] Step 6: 最终命令：npm test；npm run build:renderer；npm run pack:alpha。预期：测试、构建和 alpha 打包成功；旧发文功能回归通过；新工作台完成至少一条真实生成和保存流程。

## 9. 实施顺序和停线规则

严格按 1 workspace 契约、2 数据读取、3 模板 Prompt、4 AI 生成、5 存储迁移、6 IPC、7 React、8 真实验收执行。每阶段必须满足对应测试通过、npm test 通过、文档同步、独立 commit 可回滚。

出现以下情况时暂停加功能并先修复：文章无法追溯来源；React 直接读文件或调用 AI；Key 出现在日志或 git diff；旧投稿流程失败；同一平台无法区分多个模板；空豆包回答被当成正常输入。

## 10. 计划自检

- [x] 覆盖客户资料、搜索词、豆包回答、参考资料、模板、AI 生成、文章保存和投稿衔接。
- [x] 每阶段包含文件、接口、测试命令和通过标准。
- [x] 未把餐饮、住宿写死为行业分类；平台和场景由模板目录控制。
- [x] 客户目录名可以是任意合法名称，不使用搜索词作为目录名。
- [x] Python 项目只作为采集验证和数据来源，不直接嵌入 Electron 运行时。
- [x] 明确 API 配置、密钥处理、异常路径和旧数据迁移策略。
- [x] 未使用 TBD、TODO 或无法执行的占位步骤。

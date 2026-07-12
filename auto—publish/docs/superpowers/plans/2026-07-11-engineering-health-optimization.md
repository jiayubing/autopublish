# AutoPublish 工程健康优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 在不破坏既有官媒投稿流程的前提下，统一运行时工作区与配置、建立 GEO/AI 到投稿的受控闭环、恢复前端/打包质量门禁，并收敛遗留 UI、依赖和发布制品。

**Architecture:** 主进程初始化唯一的 WorkspacePaths 与 RuntimeConfig。Renderer 仅提交稳定标识，IPC 在主进程中重新解析投稿文件与资源。GEO/AI 保留原始生成稿，人工确认后导出为投稿队列文件及溯源 sidecar，绝不直接自动投稿。

**Tech Stack:** Electron 33、CommonJS Node.js、React 19、TypeScript、Vite、Node test runner、electron-builder、Playwright CLI、MarkItDown/Python。

---

## 基线与不变量

- 基线：根 npm test 为 138 pass、0 fail、1 skip；React lint 当前有 8 个错误；alpha 内容检查通过；两套生产依赖 audit 为 0 漏洞。
- 不删除或覆盖 .env、客户资料、GEO 研究、生成稿、待投稿件、已发布记录、订单和当前安装包。
- AI 稿不得绕过人工确认自动投稿。
- Renderer 不得提交任意绝对路径、工作区外路径或未验证资源对象。
- 密钥、客户知识库全文和研究原文不得进入投稿 sidecar、日志或 IPC 错误详情。
- 每阶段结束须通过该阶段测试和根 npm test；提交前通过 npm run verify。

### GEO/AI 交接决定

写作平台（ctrip、xiaohongshu、dianping）不等于现有自动投稿适配器（media、lieju、toutiao、hepan）。采用最小、安全闭环：

1. 原稿保留在 generated/clientId/articleId.md 和 .json。
2. 用户选择现有投稿目标并显式执行“导出到投稿队列”。
3. 系统在 input/target 创建标准 Markdown 和同名 .meta.json；不移动、不覆盖原稿。
4. 用户仍需在媒体或平台工作台预检并最终确认投稿。
5. 新增 Ctrip 等正式适配器属于后续独立需求，本计划不伪造可投稿能力。

## 目标模块边界

~~~text
React Renderer
  -> preload API（仅 ID、文件名、资源 ID、目标平台）
  -> IPC validation
  -> application services
      - workspace/runtime config
      - content generation and export
      - media submission
      - platform submission
  -> stores/adapters
  -> Documents\AutoPublish 或 AUTO_PUBLISH_WORKSPACE
~~~

工作区必须包含 input/{media,lieju,toutiao,hepan}、data、logs、published、failed、tmp、work、clients、research、templates、generated。

---

## Task 1：恢复前端类型契约与构建门禁

**Files:**

- Modify: media-workbench/src/App.tsx
- Modify: media-workbench/src/electron-api.ts
- Modify: media-workbench/src/types.ts
- Modify: media-workbench/src/components/OrdersView.tsx
- Modify: media-workbench/src/mockData.ts
- Modify: media-workbench/vite.config.ts
- Modify: media-workbench/package.json
- Modify: package.json
- Create: scripts/verify.js
- Test: tests/react-workbench-regression.test.js

- [ ] 为统一 IPC 信封添加断言：ok、data、error.code、error.message。
- [ ] 为平台状态添加断言，只保留真实存在的一套字段；isPlatformPaused 要么由主进程真实维护，要么从前端契约移除。
- [ ] 运行 media-workbench lint，确认 8 个错误为红色基线。
- [ ] 修正 OrdersView prop 与 App 实际传参；onRefreshOrders 要么是真实接口，要么从两端删除。
- [ ] 删除 electron-api 中重复的 isPlatformRunning，统一 preload、主进程、TypeScript 的状态模型。
- [ ] 更新或隔离过期 mock Article，生产类型不得接收缺失 IPC 字段的 mock。
- [ ] 修正 Vite Rollup 输出的 TypeScript 类型。
- [ ] 将 tsc --noEmit 加入 build:renderer 前置步骤。
- [ ] 新增根 verify：根测试、Renderer lint、Renderer build；提供 unpacked app 路径时验证 alpha 包内容。

**Verification:**

~~~powershell
npm --prefix media-workbench run lint
npm test
npm run build:renderer
npm run verify
~~~

Expected: 全部 exit 0；故意制造类型不匹配时，build:renderer 必须在产出 dist 前失败。

**Commit:** fix(renderer): restore TypeScript contracts and build gate

## Task 2：统一工作区路径、环境加载和业务状态目录

**Files:**

- Create: desktop/workspace-paths.js
- Create: desktop/runtime-config.js
- Modify: desktop/runtime-paths.js, desktop/main.js, scripts/config.js
- Modify: src/platforms/media/config.js
- Modify: src/platforms/media/media-draft-store.js
- Modify: src/platforms/media/media-resource-store.js
- Modify: src/platforms/media/media-pool-store.js
- Modify: src/platforms/media/submission-order-store.js
- Modify: desktop/services/media-order-service.js
- Modify: desktop/ipc/media-ipc.js
- Create Tests: tests/workspace-paths.test.js, tests/runtime-config.test.js, tests/media-runtime-workspace.test.js
- Modify Tests: tests/desktop-packaging.test.js, tests/media-draft-store.test.js, tests/media-order-service.test.js

- [ ] 先写临时工作区测试，证明所有创建目录都位于同一 root 下。
- [ ] 实现 createWorkspacePaths(root) 与 ensureWorkspaceDirectories(paths)，涵盖 legacy 和 content 的全部目录。
- [ ] configureRuntimeEnvironment 返回 appRoot、workspaceRoot、paths，并只设置兼容环境变量。
- [ ] runtime-config 在主进程启动时一次性加载工作区 .env，校验 AI、媒体、MarkItDown、Playwright、浏览器与 Hepan 配置；错误不得泄露值。
- [ ] 移除媒体 config 的 dotenv 副作用；AI 不得依赖 register.js 的 media-first 注册顺序。
- [ ] 每个 Store 只接受显式路径或 workspace paths；不得从 __dirname 推导业务数据路径。
- [ ] 媒体 IPC 从 deps.paths.data 创建 Store；订单读取路径必须与 SubmissionOrderStore 写入路径一致。
- [ ] 保留旧 JSON 读取兼容层，不能丢弃当前草稿、资源池和订单。

**Verification:**

~~~powershell
$env:AUTO_PUBLISH_WORKSPACE = Join-Path $env:TEMP 'autopublish-workspace-test'
npm test
~~~

Expected: 草稿、缓存、资源池、订单、AI 内容均写入临时工作区；安装目录/源码 data 无新增业务写入；无配置时返回稳定且无密钥的错误。

**Commit:** refactor(workspace): centralize runtime paths and configuration

## Task 3：收紧 IPC 与 Electron 安全边界

**Files:**

- Modify: desktop/preload.js, desktop/ipc/media-ipc.js, desktop/ipc/platform-ipc.js
- Modify: desktop/services/media-workbench-service.js, desktop/services/platform-workbench-service.js
- Modify: desktop/main.js, media-workbench/src/electron-api.ts, media-workbench/index.html
- Create Tests: tests/ipc-submission-boundary.test.js, tests/electron-security.test.js
- Modify Tests: tests/media-ipc-thin.test.js, tests/platform-workbench-service.test.js

- [ ] 媒体投稿仅接受 filename、resourceIds、draft revision；平台投稿仅接受 sourcePlatformId、filename、targetPlatformIds。
- [ ] 新建服务端路径解析器，拒绝空值、路径分隔符、绝对路径、..、非 md/txt/docx、非普通文件和符号链接；只能解析预期 input/platform。
- [ ] 主进程从资源池/缓存重新读取资源 ID；未知资源和未知平台拒绝。
- [ ] 草稿 get/set/remove 使用文件名与 Draft schema 校验，并全部走 wrap。
- [ ] 显式启用 sandbox，拒绝未授权导航、新窗口和权限请求。
- [ ] 增加适配 file bundle 的 CSP；仅主进程按 http/https allow-list 用系统浏览器打开参考链接。

**Verification:**

~~~powershell
npm test
~~~

Expected: 绝对路径、..、junction/symlink、未知平台、未知资源和非法扩展名均返回稳定错误；正常计划仍可创建；外链不在 Electron 内开子窗口。

**Commit:** security(ipc): validate submission commands in main process

## Task 4：修复原投稿流程的便携性与工作区扫描

**Files:**

- Create: desktop/services/runtime-diagnostics-service.js
- Modify: scripts/config.js, src/core/markitdown.js, src/core/playwright.js
- Modify: desktop/services/desktop-task-service.js
- Modify: src/platforms/hepan/adapter.js, src/platforms/media/adapter.js, src/app/publish-batch.js
- Modify: scripts/verify-alpha-package.js, scripts/create-alpha-smoke-workspace.ps1
- Create Tests: tests/runtime-diagnostics.test.js, tests/batch-workspace-scan.test.js

- [ ] 先写媒体 batch 在 AUTO_PUBLISH_WORKSPACE/input/media 扫描的测试；不得读取应用源码 input。
- [ ] 统一运行依赖优先级：工作区显式配置、环境变量、随包工具、PATH 探测、带修复说明的诊断错误。
- [ ] 移除开发机绝对 Python/MarkItDown、Playwright CLI 路径。
- [ ] 将 Hepan Python、cookie 等个人配置移入工作区配置。
- [ ] media adapter 使用注入 workspace input/DIRS，不再从 __dirname 回溯。
- [ ] 诊断只暴露可用性、搜索位置和修复说明，不暴露密钥。
- [ ] alpha 冒烟检查增加目录初始化和诊断验证。

**Verification:**

~~~powershell
$env:AUTO_PUBLISH_WORKSPACE = Join-Path $env:TEMP 'autopublish-batch-test'
npm test
node scripts/verify-alpha-package.js release-alpha/win-unpacked/resources/app
~~~

Expected: batch 仅扫描工作区文件；缺少 Python/Playwright/Hepan 设置时给出可操作诊断。

**Commit:** fix(runtime): make legacy submission portable and workspace-aware

## Task 5：建立 GEO/AI 的人工确认导出闭环

**Files:**

- Create: src/content/submission-export-service.js
- Create: desktop/services/content-submission-service.js
- Create: desktop/ipc/content-submission-ipc.js
- Modify: desktop/ipc/register.js, desktop/preload.js, desktop/services/ai-content-service.js
- Modify: media-workbench/src/electron-api.ts, media-workbench/src/components/ContentWorkbench.tsx
- Modify: docs/content-workspace-contract.md
- Create Tests: tests/content-submission-export.test.js, tests/content-submission-ipc.test.js
- Modify Test: tests/content-workbench-regression.test.js

- [ ] 先写失败测试：仅已保存文章可导出，只允许 media/lieju/toutiao/hepan，不允许直接投稿。
- [ ] 定义导出记录：generatedArticleId、clientId、targetPlatform、filename、SHA-256 contentHash、exportedAt、status queued。
- [ ] 导出 Markdown 使用 # 标题、空行、正文，避免 front matter 被旧扫描器误识别为标题。
- [ ] 同名 meta.json 仅保存溯源；不得保存 API key、客户资料正文或研究答案。
- [ ] 使用安全确定性文件名；同名且内容哈希相同为幂等成功，哈希不同必须阻止静默覆盖。
- [ ] 新增 previewExport 和 exportToSubmissionQueue IPC；导出要求 confirmed true，绝不能发布。
- [ ] ContentWorkbench 增加投稿目标、导出预览和明确提示：“导出到待投稿队列，仍需在投稿工作台确认”。
- [ ] 契约文档补充导出生命周期和非自动投稿规则。

**Verification:**

~~~powershell
npm test
~~~

Expected: 原稿仍在 generated；目标队列产生 Markdown/sidecar；媒体和平台扫描器可发现导出稿；重复导出幂等；篡改 sidecar 或工作区外路径被拒绝。

**Commit:** feat(content): export reviewed generated articles to submission queues

## Task 6：统一预检、任务生命周期和生产 UI

**Files:**

- Modify: src/platforms/media/preflight.js, desktop/services/media-workbench-service.js
- Modify: desktop/services/platform-workbench-service.js, desktop/services/desktop-task-service.js
- Modify: media-workbench/src/components/PreflightModal.tsx, media-workbench/src/components/SettingsView.tsx
- Modify or remove: media-workbench/src/mockData.ts
- Modify: electron-builder.alpha.yml
- Remove after migration: desktop/renderer/**
- Create Tests: tests/submission-preflight-integration.test.js, tests/react-production-flow.test.js
- Migrate tests that currently inspect desktop/renderer/**

- [ ] 先写集成测试，证明预检失败时不发送网络请求也不写提交订单。
- [ ] 真实媒体服务使用统一预检；UI 确认和提交前检查必须调用相同服务规则。
- [ ] 将 platform workbench 拆为队列扫描、已验证计划构建、文章解析、串行提交，保持 IPC 公共行为兼容。
- [ ] 清理 Promise.race timer；停止/暂停/超时必须关闭 child、仅发一次最终状态。
- [ ] 删除 Electron 生产路径中的 localStorage/mock 回退；开发 fixture 必须显式开关隔离。
- [ ] 设置页仅展示真实功能；未实现的加密保存、目录监听、自动预检不得宣称已启用。
- [ ] 在真实 React 回归测试通过后，将旧 Renderer 移出 builder，随后删除或归档。

**Verification:**

~~~powershell
npm test
npm --prefix media-workbench run lint
npm run build:renderer
~~~

Expected: React 是唯一生产 UI；预检阻断不生成请求；暂停、停止、超时产生唯一确定状态。

**Commit:** refactor(ui): unify production submission flows

## Task 7：收敛依赖、打包策略和操作文档

**Files:**

- Modify: media-workbench/package.json, media-workbench/package-lock.json
- Modify: electron-builder.alpha.yml, .gitignore（仅新增生成物时）
- Modify: docs/desktop-workbench.md, docs/alpha-packaging-checklist.md, docs/content-workspace-contract.md
- Modify or archive: docs/media-workbench-ui.md
- Create: docs/runtime-dependencies.md

- [ ] 以源码引用和 production build 证明无用后，才删除 React 子工程确认未使用的 @google/genai、express、dotenv、@types/express。
- [ ] 将 node_modules/**/* 改为生产依赖策略与显式运行时文件白名单。
- [ ] 依赖稳定后评估 asar；若因动态工具维持关闭，记录原因并继续白名单化。
- [ ] 修复损坏编码文档；统一打包工作区为 Documents/AutoPublish。
- [ ] 文档写清 .env、诊断、GEO 导出、人工最终确认、备份和恢复路径。

**Verification:**

~~~powershell
npm ci
npm --prefix media-workbench ci
npm run verify
npm run pack:alpha
node scripts/verify-alpha-package.js release-alpha/win-unpacked/resources/app
~~~

Expected: 包含所需运行文件，不含 .env、用户数据、测试和退休 Renderer；包体积低于优化前基线；文档与实际一致。

**Commit:** build: reduce package surface and refresh operations docs

## 单独审批的磁盘清理

清理不属于代码实施。全部功能验证后，另行提交确认：

| 分类 | 内容 | 预计释放 | 恢复 |
| --- | --- | ---: | --- |
| 可重建 | 根 node_modules | 347.56 MiB | npm ci |
| 可重建 | media-workbench/node_modules | 166.43 MiB | npm --prefix media-workbench ci |
| 可重建 | media-workbench/dist | 约 0.47 MiB | npm run build:renderer |
| 可重建 | data/media-resources.json | 11.91 MiB | 应用内刷新资源 |
| 可重建 | .playwright-cli、tmp | 约 2.92 MiB | 下次运行生成 |
| 关闭浏览器后可重建 | 浏览器 Cache/Code Cache/GPU/Service Worker cache | 约 115 MiB | 浏览器自动生成 |
| 必须确认 | release-alpha | 421.72 MiB | 重建或恢复制品 |
| 必须确认 | 整个 Playwright profile | 128.82 MiB | 丢失登录态，需重新登录 |
| 必须保留 | .env、clients、research、generated、input、published | — | 受保护业务数据 |
| 必须保留 | 草稿、资源池、订单 JSON | — | 当前操作状态/历史 |

清理缓存前必须关闭浏览器，并确保 Cookie、Local Storage、state export 不在选择路径中。不得自动删除安装包、profile 或任何业务数据。

## 最终验收清单

- [ ] npm test 无非预期失败或跳过。
- [ ] npm --prefix media-workbench run lint 通过。
- [ ] npm run verify 通过。
- [ ] 临时工作区测试证明可变状态均在包目录外。
- [ ] 打包冒烟测试覆盖启动、目录初始化、依赖诊断与扫描。
- [ ] GEO 稿可人工导出、扫描、预检、投稿并追溯，且不自动投稿。
- [ ] IPC 拒绝任意路径、未知资源和未知目标。
- [ ] Electron 导航、窗口和权限策略测试通过。
- [ ] React 为唯一生产 UI，文档与实际一致。
- [ ] 磁盘清理另行确认。


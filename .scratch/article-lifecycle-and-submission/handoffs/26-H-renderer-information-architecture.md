# 26-H — Renderer 信息架构 handoff

## 范围与基线

- Work package：`26-H — Renderer 信息架构`
- 合同：`.scratch/article-lifecycle-and-submission/issues/26-H-renderer-information-architecture.md`
- Base integration HEAD：`7cc5a13af4fcccc1ebfdf64f5a5d20b8193bb433`
- Worktree：`C:\Users\violet\.codex\worktrees\b927\官媒投稿-refactor`
- 实现根目录：`auto—publish/`
- 初始状态为给定 HEAD 的 detached worktree；本包没有 push、release、真实登录、投稿、付费、取消、订单核对或生产数据操作。
- 所有 Renderer 回归使用合成数据、内存状态和假 transport；未进入 26-I。

## 实现结果与 owner mapping

- 主导航现在只有六个入口：`内容生产`、`文章库`、`投稿中心`、`订单`、`媒体资源`、`设置`。
- Sidebar 不再创建状态或伪造统计：文章库 badge 来自 `management.lifecycleCounts`，投稿中心 badge 汇总普通队列 read model、已确认付费批次 read model 和需处理事项 read model，订单 badge 来自真实订单列表。
- 内容生产只保留问题采集与文章生成；生成批次完成只通过 `{ generationBatchId, clientId }` intent 打开文章库。
- 文章库新增五类生命周期筛选（待投稿、待完善、投稿中、已发布、回收站）、生成批次筛选、关键词/创建日期筛选；编辑、发起普通投稿、付费预检/确认、发布进度/档案、订单入口、回收站均从文章库进入。付费入口只展示有真实报价的媒体资源；未报价资源不可选择。
- 投稿中心集中普通平台队列、已确认付费批次和需处理事项；普通队列的开始/暂停/移除、付费批次执行和 attention resolution 均留在此处。需处理事项导航只传 `clientId/articleId` 等稳定 identity。
- 订单页仅消费真实订单 read model；文章库/投稿中心到订单页不传可变订单对象。
- 跨页导航只传 `articleId`、`generationBatchId`、`clientId` 等稳定 identity/filter intent；Renderer 未新增主进程状态机、Electron transport 访问或兼容 alias。
- 删除旧六阶段 tabs、`navigation-summary`、`PlatformTaskIndicator`、`MediaThirdPartyIdControl` 以及旧平台/旧付费暂存入口；`ViewMode`、公开 Renderer types、直接测试夹具和 CSS 已同步收敛。

## 变更文件

### Renderer 组合、页面与样式

- `auto—publish/media-workbench/src/App.tsx`
- `auto—publish/media-workbench/src/components/Sidebar.tsx`
- `auto—publish/media-workbench/src/components/ContentWorkbench.tsx`
- `auto—publish/media-workbench/src/components/PlatformWorkbench.tsx`
- `auto—publish/media-workbench/src/components/content/ArticleLibraryFilters.tsx`
- `auto—publish/media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `auto—publish/media-workbench/src/components/content/GeneratedArticlesView.types.ts`
- `auto—publish/media-workbench/src/components/content/GeneratedArticlesList.tsx`
- `auto—publish/media-workbench/src/components/content/GeneratedArticleEditorPanel.tsx`
- `auto—publish/media-workbench/src/components/content/ArticleTrashPanel.tsx`
- `auto—publish/media-workbench/src/components/content/ArticleAttentionPanel.tsx`
- `auto—publish/media-workbench/src/components/OrdersView.tsx`
- `auto—publish/media-workbench/src/components/ResourceLibrary.tsx`
- `auto—publish/media-workbench/src/components/SettingsView.tsx`
- `auto—publish/media-workbench/src/components/settings/SettingsNavigation.tsx`
- `auto—publish/media-workbench/src/index.css`

### Renderer types、legacy absence 与删除

- `auto—publish/media-workbench/src/article-workflow.ts`
- `auto—publish/media-workbench/src/types/view.ts`
- `auto—publish/media-workbench/src/types/publication.ts`
- `auto—publish/media-workbench/src/types/media.ts`
- `auto—publish/media-workbench/src/mockData.ts`
- 删除 `auto—publish/media-workbench/src/components/ArticleStageTabs.tsx`
- 删除 `auto—publish/media-workbench/src/components/PlatformTaskIndicator.tsx`
- 删除 `auto—publish/media-workbench/src/components/MediaThirdPartyIdControl.tsx`
- 删除 `auto—publish/media-workbench/src/navigation-summary.ts`

### 直接回归测试

- `auto—publish/tests/auth-gate.test.js`
- `auto—publish/tests/phase-08-renderer-contract-layout.test.js`
- `auto—publish/tests/renderer-article-attention-actions.test.js`
- `auto—publish/tests/renderer-generation-batch-navigation.test.js`
- `auto—publish/tests/renderer-history-editor-flow.test.js`
- `auto—publish/tests/renderer-lieju-publication-profile.test.js`
- `auto—publish/tests/renderer-platform-cross-page-progress.test.js`
- `auto—publish/tests/renderer-platform-queue-refresh-lifecycle.test.js`
- `auto—publish/tests/renderer-publication-history.test.js`
- `auto—publish/tests/renderer-question-editor-session.test.js`
- `auto—publish/tests/renderer-residue-cleanup-flow.test.js`
- `auto—publish/tests/renderer-responsive-layout.test.js`
- `auto—publish/tests/renderer-settings-window-focus.electron.test.js`

## Primary Audit

审计范围限定为 26-H diff、Renderer 组合/bridge/type 边界、直接调用方、六入口/read model/稳定 intent 不变量、旧入口 absence 和直接回归测试；没有读取 domain/store internals、平台 adapter 或 migration planner。

已发现并在本包内修复：

1. `INTRODUCED_BY_CHANGE`，P2，付费入口边界：初版会把 `price === null` 的未报价媒体资源列入选择器。现在只展示有数字报价的资源，无报价时选择器禁用；增加了合成 absence 回归。
2. `INTRODUCED_BY_CHANGE`，P2，stale 语义：普通投稿预检收到 stale read model 时初版会落成“没有符合规则的文章”错误。现在与付费预检一致，识别 stale 后 fail-closed，不显示确认且不执行投稿命令。

未发现未关闭的 P0/P1，或直接违反当前 acceptance、持久事实一致性、幂等/不确定结果安全和公开合同的 P2。

按上游 26-F 已记录的证据边界保留以下非阻塞项：

- `EXPOSED_PREEXISTING` / `PROCESS_EVIDENCE_GAP`：`attention.listArticleAttention` 的 TypeChecker/reachability 证据缺口；本包只消费公开 feature，不越界重写 attention owner。
- `PROCESS_EVIDENCE_GAP`：ASAR/package smoke artifact 不可用；没有通过手改生成物或真实安装验收伪造证据。
- 全仓旧 acceptance 测试仍有属于上游生命周期合同的 `canQueue`/`operations.queue` 断言；26-H Renderer source、直接 Renderer fixture 和公开 ViewMode 已无该兼容字段。该交叉边界未改动，不是本包的隐藏导航或新 writer。

## Bounded re-audit

bounded re-audit 只复查上述两个修复、直接调用方、付费报价/stale fail-closed、六入口与三中心分区、稳定 identity/filter intent、旧 Renderer 入口 absence 以及受影响测试；没有重新开启 fresh full review。结果：**43 passed, 0 failed**；没有新的 P0/P1 或当前正确性阻塞 P2。

## 实际验证

以下命令均已实际运行：

- `npm ci`（`auto—publish/media-workbench`、`auto—publish`）：通过；npm audit 报告 Renderer 2 个、根项目 5 个依赖漏洞，未在本包扩大处理。
- `npm run lint`（`auto—publish/media-workbench`）：通过。
- `npm run typecheck:strict`（`auto—publish/media-workbench`）：通过。
- `npm run typecheck:renderer; npm run typecheck:bridge`（`auto—publish`）：通过。
- `npm run build`（`auto—publish/media-workbench`）：通过；只有既有 chunk 大小 warning。
- `node --test --test-concurrency=1 tests/phase-08-renderer-contract-layout.test.js tests/phase-06-production-caller-inventory.test.js tests/architecture-seams.test.js tests/renderer-platform-cross-page-progress.test.js tests/renderer-publication-history.test.js tests/renderer-lieju-publication-profile.test.js tests/renderer-article-attention-actions.test.js tests/renderer-history-editor-flow.test.js tests/renderer-generation-batch-navigation.test.js tests/renderer-platform-queue-refresh-lifecycle.test.js tests/renderer-residue-cleanup-flow.test.js tests/renderer-question-editor-session.test.js tests/renderer-responsive-layout.test.js`（`auto—publish`）：**43 passed, 0 failed**。
- `git diff --check`：exit 0；仅有 Windows 工作副本的 LF→CRLF warning，没有 whitespace error。
- 26-H Renderer source legacy absence scan：`canQueue`、`operations.queue`、旧组件/导航模块、旧入口标识无命中；测试中的旧名字仅用于 absence assertion 或上游非 Renderer 合同。

## 未运行的重要验收与原因

- 未运行真实登录、投稿、付费、取消、订单核对、供应商写操作、生产数据库迁移/删除：26-H 合同和项目安全边界明确禁止。
- 未运行 `pack:smoke`、ASAR、真实安装后 smoke 或 release verification：需要生产打包/运行期 artifact，且已知 ASAR evidence gap 不属于 26-H；本包不修改生成物、不伪造 artifact。
- 未运行全量 `npm test`、`typecheck:main`：本包没有 main/domain/store 修改，协议要求先以受影响 Renderer/bridge/type/直接回归为门禁；上游全量历史残余不由本包重开 fresh review。

## 剩余风险

- attention reachability/TypeChecker 与 ASAR/package smoke 仍需由其既有 owner 按协议补证；本包定向通过不能替代这些门禁。
- 真实第三方账号、远端发布结果、订单状态和供应商费用仍未执行真实验证；本包没有对这些系统产生副作用。
- npm audit 报告的依赖漏洞未处理，避免扩大 26-H 范围。

本 handoff、Renderer 实现、类型/absence 收敛和直接回归共同构成 26-H 单一意图提交；提交 hash 以最终 Git 记录为准。

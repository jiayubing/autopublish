# Ticket 27-C — Attention 与发布档案 Renderer

## 状态

- Ticket 27 仍为 `PARTIAL`；27-C 已 Closure。27-D 尚未获授权，不自动启动。
- 初始实现来自用户“按 Ticket 27 执行 27-C”的 Manual Dispatch；用户随后明确授权 Primary Audit 与提交。
- Base integration HEAD：`6b45bbaccf34a25eefb10f9f66e49768880f3841`，分支：`codex/第三阶段`；开始时工作树干净。Implementation commit：`fdaa1154abe0e0c6367e5f61e30e39737c7e61bb`（`feat(submission): close publication attention UX`）。未执行任何真实外部操作。

## 实现

1. 增加只在 Renderer 内流转的 `ArticleLibraryNavigationIntent`，让 Attention 的三个导航动作分别落到：
   - `open-submission`：文章库的统一发起投稿面板；
   - `open-publication`：发布档案；
   - `open-article`：文章编辑器。
   它不改变提交、publication、Attention 或生命周期事实。
2. Attention 卡片改为展示“发生了什么 / 下一步 / 处理完成后”；普通平台明确失败优先使用 domain 投影的受控 `reasonSummary`，原因码仅保留在折叠核对详情。普通不确定的“确认已接受”说明该动作会永久标记文章已发布，且发布链接不是必填项。
3. 发布档案首层展示平台、账号、最终结果、确认/发布时间、证据来源、远端 ID 和可安全打开的链接。人工确认无 locator 时明确显示“已人工确认发布，未记录可用链接”。
4. 投稿内容快照与投稿处理/核对详情分别折叠；`targetKey`、结果代码和执行信息不再作为首层档案字段。Renderer 仅在主进程现有安全链接合同认可的 URL 上展示打开按钮（HTTPS、无凭据/fragment/敏感查询参数）；打开失败显示受控用户反馈。

## 验证

在 `auto—publish/` 下执行，均通过：

- `node --test tests/renderer-attention-panel-presentation.test.js tests/renderer-article-attention-actions.test.js tests/renderer-publication-history.test.js tests/renderer-responsive-layout.test.js tests/phase-06-attention-feature.test.mjs tests/article-attention-query.test.js tests/publication-link-service.test.js tests/publication-failure-read-model.test.js tests/article-management-snapshot.test.js`
  - 46 tests passed；覆盖 loading / empty / error / disabled / stale、ID-only / URL-only / manual-no-link / failure fixtures、三个 navigation intent、确认文案、窄屏与安全外链合同。
- `npm --prefix media-workbench run typecheck:strict`
- `npm --prefix media-workbench run lint`
- `npm run build:renderer`
- `npm run lint`
- `git diff --check`

Renderer production build emits the existing Vite chunk-size warning; build succeeds. 未运行全量 `npm test`，因为 Ticket 27-C 的最低验收未要求它，且本次仍未到 27-D final gate。

## Primary Audit 与 Bounded Re-audit

Scope：ArticleLibraryNavigationIntent 的 App / ContentWorkbench / SubmissionCenter 闭合调用链、ArticleAttentionPanel、PublicationHistoryDrawer、文章管理 snapshot/IPC 链接合同及定向 renderer 行为测试。

Checked invariants：Renderer 不新增 publication、Attention、submission 或 lifecycle writer；三个导航意图稳定且分别进入统一投稿、发布档案、编辑器；resolved Attention 仅靠权威 refresh 消失；manual accepted 无 locator 不伪造链接；失败原因受控；外链仅由主进程 capability 打开；loading / empty / error / disabled / stale / 窄屏行为仍成立。

Finding：`P2 INTRODUCED_BY_CHANGE`。初版 Renderer 将任何带 query 的 HTTPS URL 视作不可显示，但主进程 `normalizePublishedArticleUrl` 接受非敏感查询参数；这会让可安全打开的已存链接在档案中消失。修复将 Renderer 校验收敛到同一安全合同，并增加 safe-query 与 sensitive-query fixture：前者保留按钮，后者仍隐藏。

Bounded Re-audit：仅复查该修复 diff、主进程链接服务、Renderer 链接展示与直接回归。`tests/renderer-publication-history.test.js`、`tests/publication-link-service.test.js`、严格类型检查及完整 27-C 定向门禁均通过。结论：`PASS`；无新的 P0/P1 或本 Ticket 阻塞 P2。

## Closure / 当前边界

27-C 已完成 Primary Audit、P2 remediation、Bounded Re-audit 与 implementation commit。变更直接提交到当前 integration branch `codex/第三阶段`，无独立分支需要 merge。后续仅可在用户另行授权后从新的 scheduling preflight 启动 27-D；不继承真实登录、投稿、付费、取消、迁移或其他外部操作授权。

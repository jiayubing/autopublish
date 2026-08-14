# Workstream 6 — 列举网普通平台端到端验收

日期：2026-08-14

## 范围与当前基线

- 本线程只执行 Workstream 6 的集成验收，不做结构性重构。
- 当前代码基线为 `0fd005f`；工作区另有上一 Workstream 的未提交改动：
  - `src/platforms/lieju/adapter.js`
  - `tests/regular-platform-adapter-outcomes.test.js`
- 本线程未修改生产代码，也未回滚或覆盖上述既有改动。

## 自动化组合验收

以下命令在当前工作树执行并通过：

```text
node --test --test-concurrency=1 tests/platform-account-inspector.test.js tests/platform-account-runtime.test.js tests/platform-browser-session-lifecycle.test.js tests/client-knowledge.test.js tests/ai-content-ipc.test.js tests/article-lifecycle-ticket-08.test.js tests/regular-platform-adapter-outcomes.test.js tests/regular-platform-outcome-service.test.js tests/regular-platform-outcomes.test.js tests/ticket-25-c-regular-platform-acceptance.test.js
```

结果：`111/111 PASS`。

```text
node --test --test-concurrency=1 tests/phase-08-publication-submission-orchestration.test.js tests/phase-07-regular-queue.test.js tests/phase-03-publication-workflow.test.js tests/regular-publication-evidence-contract.test.js tests/phase-04-platform-account-projection.test.js tests/phase-04-platform-run.test.js
```

结果：`60/60 PASS`。

附加门禁：

- `npm run typecheck:main`：PASS
- `npm run typecheck:renderer`：PASS
- `npm run typecheck:bridge`：PASS
- Workstream 1–5 直接调用链定向 ESLint：PASS
- `git diff --check`：PASS

## 场景结果

| 场景 | 当前证据 | 结论 |
| --- | --- | --- |
| 主 Happy Path 的队列、preparation、结果回写组合 | `article-lifecycle-ticket-08`、`regular-platform-adapter-outcomes`、`regular-platform-outcomes`、`ticket-25-c` | 合成数据 PASS；覆盖客户档案、账号预检、Lieju 输入和标准结果回写 |
| A：未登录 | account inspector/preflight 与队列状态测试 | 合成数据 PASS：不提交，账号检查失败可恢复，文章不被判为文章级失败 |
| B：登录账号与绑定不一致 | account binding、preparation 和 regular outcome 测试 | 合成数据 PASS：队列安全暂停，不跨越远端提交边界 |
| C：网站明确拒绝 | Lieju adapter `article_rejected` 测试及 outcome 状态矩阵 | 合成数据 PASS：文章级失败进入需处理，按现有队列规则收口 |
| D：提交后无法确认 | Lieju `uncertain` 测试及 regular queue 状态矩阵 | 合成数据 PASS：进入 uncertain/需处理，队列冻结，不自动重发 |
| E：真实成功 | 无可用登录态、账号或测试文章 | 未执行，不能宣称通过 |

## 外部验收阻塞

项目内 `work/playwright-cli/profiles`、`work/playwright-cli/sessions`、`work/playwright-cli/state` 当前均为空，未发现可恢复的列举网登录态。当前线程也没有被提供可用于本次验收的真实账号、绑定档案和测试文章。

因此本线程没有执行真实登录、真实投稿或任何可能产生公开发布事实的操作，也没有生成真实 `remoteUrl` / `remoteId` evidence。Workstream 6 的“至少一次真实列举网成功发文”验收条件仍未满足；不得将本线程标记为完整闭环，也不得进入 Workstream 7。

## 缺陷归属

本次自动化组合验收未发现新增缺陷：

- 状态写错：未发现 Workstream 1 回归。
- Session/账号预检：未发现 Workstream 2 回归。
- 客户档案丢失或串户：未发现 Workstream 3 回归。
- Lieju runtime/填表：未发现 Workstream 4 回归。
- accepted/rejected/uncertain 识别：合成合同通过；真实页面证据仍待外部验收。

## 未运行的重要 gate

- 真实列举网登录、账号核验、表单提交和成功回写：因缺少可用登录态/测试账号/测试文章未运行。
- 全量 `npm test`：本线程未取得全量完成证据；前序 Workstream 已记录该命令在 120 秒和 300 秒窗口内未完成。本线程以与 Workstream 6 直接相关的 `171/171` 定向测试和类型/静态门禁作为当前 evidence。


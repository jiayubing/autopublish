# Thread 5 — 列举网远端提交结果识别

日期：2026-08-14

## 范围

- 基线 HEAD：`a649e1d`。
- 只修改 Lieju `submitPreparedPublication()` 的提交观察与结果标准化，以及对应行为测试。
- 未修改客户档案、普通队列状态机、账号模型、图片、HTTP 发布或付费媒体。

## 实现结果

- 提交动作在同一个 Playwright 页面上下文中执行，并在点击前挂载 `response` / `dialog` 监听。
- 结果观察同时读取当前导航 URL、响应 URL / `Location`、详情页链接和明确拒绝文本；响应或页面只有在 Lieju 官方详情 URL 可解析出数字远端 ID 时才返回 `accepted`。
- 页面正文或浏览器拒绝弹窗明确说明字段/投稿失败且没有远端详情身份时返回 `article_rejected`。
- 远端已提交但没有可靠远端身份或明确拒绝证据时返回 `uncertain / REMOTE_RESULT_UNKNOWN`。
- 同一 `PreparedSubmission` 的提交方法只允许触发一次；结果未知不会从该 capability 再次点击发布。

## 修改文件

- `auto—publish/src/platforms/lieju/adapter.js`
- `auto—publish/tests/regular-platform-adapter-outcomes.test.js`

## 验证

- `node --test --test-concurrency=1 tests/regular-platform-adapter-outcomes.test.js`：15/15 PASS。
- Thread 5 直接调用链：
  `node --test --test-concurrency=1 tests/regular-platform-adapter-outcomes.test.js tests/regular-platform-outcome-service.test.js tests/regular-platform-outcomes.test.js tests/article-lifecycle-ticket-08.test.js tests/phase-08-publication-submission-orchestration.test.js`
  ：90/90 PASS。
- 结果收口与队列回归：
  `node --test --test-concurrency=1 tests/ticket-25-c-regular-platform-acceptance.test.js tests/regular-publication-evidence-contract.test.js tests/phase-07-regular-queue.test.js`
  ：24/24 PASS。
- `npm run typecheck:main`、`npm run typecheck:renderer`、`npm run typecheck:bridge`：PASS。
- `npx eslint src/platforms/lieju/adapter.js tests/regular-platform-adapter-outcomes.test.js`：PASS。
- `node --check src/platforms/lieju/adapter.js`、`node --check tests/regular-platform-adapter-outcomes.test.js`：PASS。
- `git diff --check`：PASS。

## 未解决 / 不属于本线程

- 未执行真实列举网登录或真实发布；真实远端成功验收属于 Thread 6，且需要本次明确外部操作授权。
- `tests/phase-04-browser-evidence.test.js` 在当前 HEAD 仍因其 Playwright mock 未返回 `stateFile`，导致 Lieju runtime 构造时 `path.dirname(undefined)` 失败；这是 Thread 4 runtime 测试 fixture 问题，本线程未跨界修改。
- 两个直接变更文件的 Prettier 检查仍报告既有格式差异；本线程未进行全文件格式化，以避免扩大改动范围。

## Thread 5 验收结论

Thread 5 的 accepted / article_rejected / uncertain 行为、远端身份提取、成功提示不单独视为 accepted、以及 uncertain 后禁止重复提交均已由合成页面行为测试覆盖并通过。真实外部发布结果仍待 Thread 6 的授权验收。

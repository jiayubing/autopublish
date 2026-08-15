# 19-B — 列举网无浏览器 HTTP Session：Closure Handoff

## 状态与 provenance

- 工作包：`19-B-lieju-browserless-http-session`。
- 开始 integration HEAD：`a02c71db140ef425ee9619362806aa5539854a3e`（`codex/article-lifecycle-submission`，开始时工作树干净）。
- 实现提交：`1f500a1a666fa3b1004d4da4662a262cf615c774`（`feat(lieju): add browserless HTTP session`）。
- 当前状态：Primary Audit、bounded re-audit、定向 gate 与实现提交均已完成；无 blocking 或 deferred finding。`19-B` 为 `COMPLETE`，`19-C` 为唯一下一可调度项。
- 本包未执行真实登录、GET、POST、上传、发布、付费、Cookie 导出或生产数据操作。所有 HTTP/session 测试使用假的 Playwright request runtime 和临时合成 storage state。
- 停止条件核对：当前打包 `@playwright/cli@0.1.14` 的 `storage-state.md` 与 README 将 `state-save` / `state-load` 明确描述为 Playwright storage state；本包未发现需要迁移或删除既有登录数据的证据。

## 实现范围

- 新增 `src/platforms/lieju/http-session.js`：
  - 显式使用 `playwright.request.newContext({ storageState })`，没有 Browser、browser context 或 Page 依赖。
  - 提供只含 `probeLogin()` / `get()` 的窄 port；GET 输出仅含经 allowlist 验证的 URL、status、content type 和 parser 必需的 bytes，拒绝 JSON 序列化，不暴露 Cookie jar、raw headers 或 state path。
  - probe 将安全的投稿页 2xx 分类为 `authenticated`，登录 URL / 401 / 403 分类为 `expired`，其他情况为 `unclassified`；缺失、损坏 state 和 GET/redirect/body 故障使用稳定 error code，且不重试网络请求。
  - 只允许 HTTPS `post.lieju.com` / `www.lieju.com`；逐跳禁用 Playwright 自动 redirect，手动验证 Location 与上限。
  - 收到有效 2xx 后，通过同目录 temporary state + rename 原子持久化更新；save 或 cleanup 失败只写脱敏诊断，不覆盖已得到的主业务结果。
- `src/platforms/shared/browser-session-lifecycle.js` 新增可选 state-file lease 与可选原子 state save。列举网 browser/http 分别拥有相同 state file 的独立 lease，因此同一进程或遗留进程 lock 都不能并发覆盖；死亡 PID 的遗留 lock 可安全回收。
- `src/platforms/lieju/adapter.js` 将 browser lifecycle 和 HTTP session 接入各自 lease，并暴露 `withHttpGetPort()` 给后续 19-A parser consumer；既有 browser prepare/submit 路径未改写。
- `package.json` / lock 直接声明 `playwright@1.61.0-alpha-1781023400000`。打包 verifier 现在要求 Playwright metadata/批准版本，避免依赖 `@playwright/cli` 的偶然传递依赖；现有 alpha asar unpack 已显式包含 Playwright。

## Primary Audit

- Scope：19-B 的 HTTP session/state lease 唯一 owner、列举网 adapter 接入、browser lifecycle 的直接共享 writer、Playwright production dependency/package verifier，以及直接合同测试；不审计尚未接入的 19-C parser consumer、POST 或真实平台。
- Checked invariants：request context 不创建 Browser/Context/Page；probe/GET 的分类、重定向 allowlist 和无自动网络重试；有效 state 的原子保存与 save/cleanup 不覆盖主结果；HTTP/browser 同一 stateFile 的 single writer、死亡 PID lock recovery；窄 port/脱敏诊断；既有 browser prepare/submit 调用方与 production package closure。
- Findings：无。没有 P0/P1/P2/P3 或 `PROCESS_EVIDENCE_GAP`；因此没有 remediation 或 deferred owner。
- 结论：`PASS`。定向 tests、lint、install resolution、dependency audit 与 diff check 都支持该结论，未触发扩大审计条件。

## Bounded Re-audit

- Scope：Primary Audit 所检查的直接 owner/adapter/package seam、并发/故障状态矩阵及其回归。
- 结果：`PASS`。确认没有新增 writer、公开 adapter 只暴露 `withHttpGetPort()` 的 `get`/`probeLogin`，外部 GET 失败为单次稳定错误，state-save/cleanup failure 保留主结果，且 package lock 解析为批准的 Playwright/runtime 版本。

## 定向验证

在 `auto—publish/`，Node `v24.16.0`：

```text
node --test --test-concurrency=1 tests/lieju-http-session.test.js tests/platform-browser-session-lifecycle.test.js tests/lieju-http-form-parser.test.js tests/regular-platform-adapter-outcomes.test.js tests/article-lifecycle-ticket-08.test.js tests/packaged-playwright-runtime.test.js tests/production-packaging.test.js
# 73 passed, 0 failed, 0 skipped, 0 cancelled

npm run test:packaging
# 48 passed, 0 failed, 0 skipped, 0 cancelled

npm exec -- eslint src/platforms/shared/browser-session-lifecycle.js src/platforms/lieju/http-session.js src/platforms/lieju/adapter.js tests/lieju-http-session.test.js tests/platform-browser-session-lifecycle.test.js tests/regular-platform-adapter-outcomes.test.js tests/packaged-playwright-runtime.test.js
# PASS

npm audit --omit=dev --audit-level=high
# found 0 vulnerabilities

npm ci --dry-run --ignore-scripts
# PASS (up to date)

git diff --check
# PASS
```

新增 session matrix 覆盖：有效 state 的 probe + city/form GET（browser launch=0）、缺失/损坏/过期/unclassified state、timeout 与 unsafe redirect 的单次 GET、HTTP/browser 互斥、遗留 lock 恢复、HTTP 与 browser 原子保存、rename/cleanup failure 不覆盖主结果、敏感内容不进入诊断，以及 direct dependency / packaged runtime contract。

## 后续边界

- 19-C 才消费 `withHttpGetPort()` 与 19-A parser；本实现不解释城市或 form 语义，也不构建 body、图片 manifest 或 POST。
- 真实列举网验收仍须另行逐次授权。

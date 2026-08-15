# 19-F — 列举网 Playwright 提交前保底与 Mode Policy：Closure Handoff

## 状态与 provenance

- 工作包：`19-F-lieju-playwright-fallback-and-mode-policy`。
- 开始 integration HEAD：`26c49fc feat(lieju): submit publication through HTTP`。
- 实现提交：`57150e6 feat(lieju): add browser fallback policy`。
- 本次已获授权完成实现、定向验证、Primary Audit、blocking remediation、bounded re-audit 与提交；19-F=`COMPLETE`，Wave 13 保持 `RUNNING`，19-G=`READY`。
- 未执行真实登录、GET、POST、上传、发布、付费、Cookie 导出或生产数据操作。全部验证只使用临时 state 文件、合成 HTML/图片、假的 HTTP request context 与假的 Playwright runtime。

## 实现范围

- 新增平台级 `LIEJU_SUBMISSION_MODE=auto|playwright_only`。运行时配置仅接受这两个值；`auto` 为默认值，子进程 runtime context 从受控应用配置环境读取。不新增逐篇 transport UI、IPC、持久 schema 或文章级 transport 事实。
- `auto` 的账号核验、登录 probe、城市与 form 准备先经独立 HTTP session 完成；正常队列调用链的 browser launch 为零。只有 HTTP POST 尚未调用时的登录交互需求或显式安全准备故障才切换到既有 browser lifecycle。HTTP state lease 并发冲突保持 fail-closed，不被误转为 browser fallback。
- `playwright_only` 从一开始使用 browser，但仍用 19-A 的同一城市/区域 parser、19-C 的纯文本 prepared evidence 与 19-D 的一次性 image buffer capability。browser 提交前复核所有冻结文本字段和每个已冻结图片 input；漂移返回 `uncertain/PREPARED_CONTENT_DRIFT`，不提交。
- browser outcome 补齐并与 HTTP 统一：已验证 detail URL 才 accepted；login/captcha/risk 分别返回 recoverable `group_blocked`；其余未知仍为 `uncertain`。HTTP POST timeout 或任何 post-boundary unknown 不会触发 browser submit 或第二次 POST。
- 关闭 19-E 记录的账号核验 P1：HTTP-first account inspection 不再抢占 browser state lease，成功路径不启动 Chromium。
- 删除列举网旧 `publishArticle()` browser 填表/提交旁路及其 fixture。prepared-submission adapter 的 loader 合同不再要求该旧函数；旧 worker 路径在任何 session/browser 副作用前安全阻断，因而不能绕开 frozen city/body/image/evidence plan。

## 定向验证

在 `auto—publish/`、Node `v24.16.0` 实际运行：

```text
node --test --test-concurrency=1 tests/lieju-transport-policy.test.js tests/lieju-http-submit-and-outcome.test.js tests/lieju-http-session.test.js tests/lieju-http-form-parser.test.js tests/lieju-image-multipart-preparation.test.js tests/lieju-plain-text-preparation.test.js tests/regular-platform-adapter-outcomes.test.js tests/platform-account-inspector.test.js tests/article-lifecycle-ticket-08.test.js tests/regular-publication-evidence-contract.test.js tests/phase-03-worker-main-contract.test.js
# 111 passed, 0 failed, 0 skipped, 0 cancelled

npm exec -- eslint desktop/runtime-config-store.js src/core/platforms.js src/platforms/lieju/adapter.js src/platforms/lieju/http-session.js src/platforms/lieju/image-multipart-preparation.js src/platforms/platform-runtime-context.js tests/lieju-transport-policy.test.js tests/regular-platform-adapter-outcomes.test.js tests/phase-03-worker-main-contract.test.js
# PASS

npm exec -- prettier --check desktop/runtime-config-store.js src/core/platforms.js src/platforms/lieju/adapter.js src/platforms/lieju/http-session.js src/platforms/lieju/image-multipart-preparation.js src/platforms/platform-runtime-context.js tests/lieju-transport-policy.test.js tests/regular-platform-adapter-outcomes.test.js tests/phase-03-worker-main-contract.test.js
# PASS

git diff --check
# PASS
```

矩阵覆盖 `auto` 的零 browser 成功路径、prepare 前 HTTP failure fallback、HTTP POST timeout 后不 fallback/不重发、HTTP state lease 并发、`playwright_only` 无 HTTP context/POST、同一 city/zone/body/image evidence、login/captcha/risk 阻断、图片 input 漂移、停止和非法 mode；并回归 lifecycle、HTTP session、GBK/form parser、multipart、plain-text、prepared evidence、queue claim/restart/remote-boundary、account inspection 与 legacy worker 阻断。

## Primary Audit

- Scope：19-F transport selection、account-inspection/HTTP lease 直接调用链、browser frozen form/image capability、outcome mapping、runtime config 注入及真实旧 worker consumer。
- Checked invariants：无逐篇选择或新持久 owner；浏览器只在 HTTP POST 前保底；POST 后未知不可重放；同一 state writer；HTTP/browser 同一 city/body/image/evidence；安全 outcome 与诊断不含 Cookie/body/path；旧 route 无法绕过 queue prepare。
- `P1 / CROSS_TICKET_INTERACTION`：19-E 的 HTTP-first prepare 会先经过 existing account inspector；旧 browser inspection 抢占同一 state lease，使 HTTP 自动路径不可能 browser-launch=0。已以 HTTP-first inspection 和仅 prepare 前的 browser fallback 关闭。
- `P1 / CROSS_TICKET_INTERACTION`：worker 仍可调用列举网旧 `publishArticle()`，绕开 19-A–D 冻结计划。已删除该 adapter API/旧实现并收紧 prepared adapter contract；worker regression 证明在启动会话前返回 `group_blocked`。
- `P1 / INTRODUCED_BY_CHANGE`：初始 browser fallback 只复核冻结文本，页面若移除 image input 会使 evidence 与实际上传不一致。已对每个冻结图片 input 作提交前存在性/文件名复核，漂移 fail-closed。

## Bounded Re-audit

- Scope：上述三个 P1 的修复 diff、adapter loader/worker 直接调用方、browser frozen text/image 不变量、mode/lease/post-boundary matrix。
- Result：`PASS`。111 项定向测试、ESLint、Prettier 与 diff 检查均通过；没有新增 P0/P1、没有触发公开合同、schema、状态 owner 或远端副作用边界的 escalation。

## 后续边界

- 19-G 才执行 Wave 13 combined integration audit、必要 remediation、bounded closure re-audit 与 final clean-HEAD gate；不得重新开启 19-F 的 fresh full review。
- 列举网独立 HTTP client 的真实 multipart 带图验收仍需单独、逐次明确授权；本闭环不继承此前探索或本次本地测试的任何真实发布授权。

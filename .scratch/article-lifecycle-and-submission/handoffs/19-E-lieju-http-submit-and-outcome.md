# 19-E — 列举网单次 HTTP POST 与远程结果分类：Manual Dispatch Handoff

## 状态与 provenance

- 工作包：`19-E-lieju-http-submit-and-outcome`。
- 开始/当前 integration HEAD：`aeaf28f8e89089928329e61aa8de056d89ac9953`（`codex/article-lifecycle-submission`）。
- 本次由用户授权：已完成实现、定向验证、Primary Audit 与本 Ticket 检查点提交；未执行真实外部验收、push 或 Wave 13 final closure。
- 当前工作树包含本工作包未提交的 production、test 与本 handoff 改动；开始时无其他 dirty 改动。
- 未执行真实登录、GET、POST、上传、发布、付费、Cookie 导出或生产数据操作。所有 HTTP 交互均为临时 `storageState`、合成 HTML/GBK bytes、合成图片和假的 Playwright request context。

## 实现范围

- `http-session` 新增严格的 submission port：只允许经过 19-A 已验证形状的 `https://post.lieju.com/{cityId}/239?action=postnew`；multipart Buffer POST 固定 `maxRetries: 0`、`maxRedirects: 0`、有界 20 秒 timeout，且不暴露 Cookie、headers、state path 或 request body。
- 每个 prepare/submission operation 新建可关闭的 HTTP session，仍通过同一个账号 state file 的独立 lease 串行保存。这样 prepare 关闭 GET session 后，提交可正常创建新的 request context，而不会制造第二个 state writer。
- HTTP POST 一旦开始，capability 立即变为不可重放；同一 `PreparedSubmission` 的后续调用直接返回 `uncertain/REMOTE_RESULT_UNKNOWN`。post-boundary 的 timeout、body read、decode、unsafe redirect、state-save 及其他错误均不再 POST。
- POST 获得安全响应后会 best-effort 保存 storage state；保存失败将结果降级为 `uncertain`，不会以已知 accepted/rejected 覆盖 state 不确定性。
- 新增 `http-outcome` 私有 owner：仅在可验证的列举网 detail URL / remote ID 存在时 accepted；GBK/UTF-8 均经 19-A decoder 解析；明确拒绝、登录失效、验证码、风控分别映射既有 stable outcome，成功文本或未信任 URL 一律 uncertain。
- `preparePlatformSubmission` 改为 HTTP-first：probe → 城市目录 GET → 当次投稿 form GET → 纯文本 evidence → 19-D 不可重放 multipart plan → 单次 POST capability。实际 0–4 张的成功 image manifest、hidden controls 与非 hidden title/body/zone/contact/phone override 被冻结后才可提交。
- workspace composition 只向 platform runtime 注入 Ticket 17 的窄 `imageResolver.resolveImage` capability；adapter 不自行扫描客户图片目录。
- 旧 browser helper 的回归用例改为直接测试其既存 `publishArticle` 行为，避免误把新的 queue prepare 主路径断言为浏览器 form fill。19-F 的 Playwright fallback 未接线。

## 定向验证

在 `auto—publish/`、Node `v24.16.0` 实际运行：

```text
node --test --test-concurrency=1 tests/lieju-http-submit-and-outcome.test.js tests/lieju-http-session.test.js tests/lieju-http-form-parser.test.js tests/lieju-image-multipart-preparation.test.js tests/lieju-plain-text-preparation.test.js tests/regular-platform-adapter-outcomes.test.js tests/article-lifecycle-ticket-08.test.js tests/regular-publication-evidence-contract.test.js
# 92 passed, 0 failed, 0 skipped, 0 cancelled

node --test --test-concurrency=1 tests/regular-image-plan-service.test.js tests/phase-03-composition.test.js tests/workspace-runtime-lifecycle.test.js
# 17 passed, 0 failed, 0 skipped, 0 cancelled

npm exec -- eslint src/platforms/lieju/http-session.js src/platforms/lieju/http-outcome.js src/platforms/lieju/adapter.js desktop/composition/workspace-runtime-composition.js tests/lieju-http-session.test.js tests/lieju-http-submit-and-outcome.test.js tests/lieju-plain-text-preparation.test.js tests/regular-platform-adapter-outcomes.test.js
# PASS

npm exec -- prettier --check src/platforms/lieju/http-session.js src/platforms/lieju/http-outcome.js tests/lieju-http-submit-and-outcome.test.js
# PASS

git diff --check
# PASS
```

新矩阵覆盖 HTTP-first 不启动 browser、UTF-8/GBK accepted、redirect identity、显式 rejected、401/403/login、captcha、risk control、仅成功文本、恶意 URL、multipart text/image fields、图片真实槽位、late response、同 capability 重入、timeout、body 读取失败、decode 失败、unsafe redirect、state-save failure 和 19-D/19-C/19-A/Ticket 09 直接回归。Ticket 09 的 startup/remote-started regression 继续证明重启后已开始的远端提交不重放。

## Primary Audit

- Scope：19-E HTTP POST 唯一副作用边界、HTTP session/state-file lease、outcome classifier、`preparePlatformSubmission` 直接调用链及其与现有账号核验入口的组合。
- 已检查不变量：POST 最多一次、POST 后异常统一 `uncertain`、state-save 不覆盖业务结果、无敏感值进入 outcome/evidence/diagnostic、19-A–D 的 frozen form/body/image 结果由 HTTP payload 消费。
- `P1 / CROSS_TICKET_INTERACTION`：`regular-platform-preparation-port` 会先经 `platform-account-inspector` 调用列举网 `ensureAccountInspectionReady()`。现有实现因此启动并持有与 HTTP 相同 storageState 的 browser lease；紧接的 HTTP-first prepare 必然返回 `BROWSER_SESSION_STATE_LEASE_UNAVAILABLE`。这既阻断正常入口的 HTTP-first，也违反 19-F `auto` 正常路径 Browser launch=0。
- Resolution owner：19-F transport/mode policy。账号核验必须纳入 HTTP / Playwright 的同一选择：`auto` 先以独立 HTTP session 核验；仅在 POST 前安全的 HTTP 准备失败时交给既有 browser lifecycle。不得在 browser 仍运行时释放 lease，也不得在 POST 后转 browser。
- 结论：19-E 的 HTTP POST 合同和直接定向矩阵 `PASS`；上述 P1 只在 19-E 与既有 inspection consumer 组合时出现，已作为 19-F 的首个阻塞 remediation 转交。19-E 可作为该串行后继包的 clean integration checkpoint；19-F 未闭合前，Wave 13 集成验收不得标记通过。

## 后续边界

- 19-E 已完成其 Primary Audit；Wave integration audit 仍属于 19-G。19-F 必须首先关闭上述 cross-ticket P1，之后才能进入 Wave 13 集成验收。
- 19-F 才能在 **POST 前** 对明确 HTTP prepare 不兼容接入 Playwright fallback 与平台级 mode policy；不得为 POST 后结果不确定建立 fallback 或 retry。
- 独立 HTTP client 的真实 multipart POST/带图验收仍需要用户对本次操作单独授权；现有探索授权不继承到本次验证。

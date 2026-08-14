# Thread 1：列举网账号检查与自动暂停修复

日期：2026-08-14  
基线：`fadc2f93a6e6709cf48771d45efbbfecf7e353a7`  
分支：`codex/article-lifecycle-submission`  
实现提交：未提交；当前请求未授权 commit/merge

## 范围

仅处理列举网账号识别、Session readiness、普通平台提交前账号复核顺序、系统暂停原因投影与展示。未处理 Thread 2–7 的队列移除、客户档案、Runtime/字段输入、发布结果识别、图片、付费媒体或“需处理”页面。

## 实施结果

- 列举网账号身份检查改为由 `page.evaluate()` 执行 DOM 查询，Node/Playwright 回调不再直接访问 `document`。
- UID 与展示名从同一浏览器页面身份节点提取，并保留未验证时的 fail-closed 结果。
- 最终账号复核移动到准备阶段、`beginRegularRemoteSubmission()` 之前；账号漂移或复核失败返回可恢复的 `REGULAR_ACCOUNT_PROFILE_UNVERIFIED`，不生成 `uncertain`，也不触发真实提交。
- 可恢复 `group_blocked` 的最后错误码保存在既有 recovery intent 中，队列快照通过 `actions.reasonCode` 投影，系统暂停 UI 展示实际暂停原因。
- claim 重试时清理旧暂停原因，避免旧错误码污染新的尝试。

## 验证

以下命令均在当前工作树执行并通过：

- `node --test --test-concurrency=1 tests/regular-platform-adapter-outcomes.test.js`：11/11
- `node --test --test-concurrency=1 tests/article-lifecycle-ticket-08.test.js`：29/29
- `node --test --test-concurrency=1 tests/regular-platform-outcomes.test.js`：25/25
- `node --test --test-concurrency=1 tests/phase-08-platform-media-settings-workspace-renderer-slice.test.mjs`：9/9
- 账号运行时、浏览器会话、普通平台结果服务、队列、编排、生命周期与 25-C 接受路径定向集合：64/64
- `npm run typecheck:main`
- `npm run typecheck:renderer`
- `npm run typecheck:bridge`
- Thread 1 修改 JS 的 `npx eslint ...` 定向检查
- `git diff --check`

新增回归覆盖真实页面上下文行为：测试通过可调用的 `page.evaluate` 与 DOM fixture 执行列举网账号识别，不仅匹配脚本文本。

## 未执行与状态

- 未执行真实列举网登录、真实账号、真实投稿或最终发布；这些操作需要本次明确外部操作授权，且 Thread 1 本身不要求确认发布成功。
- 未执行正式 Primary Audit、commit、merge、push 或下一线程调度。
- 当前工作树保留上述 Thread 1 实现、测试及本 handoff 的未提交变更。

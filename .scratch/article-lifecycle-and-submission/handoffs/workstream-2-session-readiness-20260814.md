# Workstream 2 — 普通平台 Session Readiness 与账号预检

日期：2026-08-14

## 范围

本线程只实现普通平台在账号身份检查前的 Session readiness 与账号预检：

```text
普通平台准备开始
→ 确保平台 Session 已启动
→ 冷启动时恢复该平台保存的登录态
→ 进入可识别当前账号 UID 的页面
→ inspectAccount()
→ 校验 accountProfile 与 remote fingerprint
→ 通过后才进入平台 preparation
```

提交前的第二次账号检查携带 `preserveCurrentPage=true`。如果当前发布页不能直接识别账号身份，检查 fail-closed，不导航离开已填好的表单。

## 实现

- `desktop/services/platform-account-inspector.js`
  - 统一调用 adapter 的 `ensureAccountInspectionReady()`；无该能力的平台保留 `ensureSession()` 兜底。
  - readiness 失败或未验证统一返回 `{ verified: false }`，不会调用 `inspectAccount()`，也不会触发提交。
- `desktop/services/regular-platform-preparation-port.js`
  - 首次检查允许进入身份页。
  - 提交边界前的复检要求保留当前页面，避免破坏已准备的表单。
- `src/platforms/lieju/adapter.js`、`src/platforms/toutiao/adapter.js`
  - 复用现有 `browser-session-lifecycle`，实现 Session probe/start、冷启动 state-load、身份页导航和 UID 可识别性探测。
  - 未登录时不自动打开登录交互，最终稳定返回未验证。

## 测试证据

- `node --test --test-concurrency=1 tests/platform-account-inspector.test.js tests/platform-account-runtime.test.js tests/platform-browser-session-lifecycle.test.js tests/regular-platform-adapter-outcomes.test.js tests/article-lifecycle-ticket-08.test.js tests/phase-08-publication-submission-orchestration.test.js tests/phase-03-publication-workflow.test.js`
  - PASS：70/70。
- `npx eslint desktop/services/platform-account-inspector.js desktop/services/regular-platform-preparation-port.js src/platforms/lieju/adapter.js src/platforms/toutiao/adapter.js tests/platform-account-inspector.test.js tests/article-lifecycle-ticket-08.test.js tests/regular-platform-adapter-outcomes.test.js`
  - PASS。
- `git diff --check`
  - PASS。
- `npm test`
  - 在 120 秒和 300 秒工具窗口内均未完成并超时，未获得全量通过证据；不能将其记为 PASS。超时后已清理本线程启动的 Node 测试进程。

## 未执行与遗留边界

- 未执行真实登录、真实发布或任何外部平台操作；这些需要本次明确授权。
- 未修改账号档案数据模型、文章生命周期/队列状态机、客户投稿档案、Lieju 表单字段或提交结果判断。
- 未执行 Workstream 4 的 runtime adapter 工厂/显式依赖对齐；本线程只复用当前已有 Session/profile 方案并补齐账号检查 readiness。
- 全量 `npm test` 仍缺少完成证据，需后续按测试运行器 owner 继续诊断。

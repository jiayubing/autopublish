# Thread 2：移出投稿队列后的文章管理状态刷新修复

日期：2026-08-14  
基线：`f819067`  
分支：`codex/article-lifecycle-submission`  
实现提交：未提交；当前请求未授权 commit/merge

## 范围

仅处理普通平台移出投稿队列后的生命周期投影缓存失效与 revision 通知。未处理 Lieju Adapter、账号检查、客户列举网投递档案、文章生命周期整体设计、需处理 UI、图片或付费媒体。

## 实施结果

- `regular-queue-application.removePendingQueueItems()` 在底层真实取消至少一个队列项（`removedCount > 0`）后，复用现有 `onDataInvalidated` owner 发出 `SUBMISSION_BATCH_CANCELLED`。
- 现有 workspace invalidation 将该原因映射到 `articleManagement`、`articleAttention` 和 `platformQueue`，因此移除后文章管理和普通平台队列读取可立即使用新 revision。
- 幂等重放或冲突结果不会伪造新的移除事实，也不会发送本次新增的 invalidation。

## 验证

- `node --test tests/phase-07-regular-queue.test.js tests/article-management-snapshot.test.js tests/workspace-runtime-lifecycle.test.js`
  - PASS：30/30。
- `npx eslint desktop/services/regular-queue-application.js tests/phase-07-regular-queue.test.js`
  - PASS。
- `git diff --check`
  - PASS；仅有现有 Windows 行尾转换提示，无 whitespace error。

新增回归先建立文章管理缓存并确认文章为 `queued`，再执行移除；验证 `SUBMISSION_BATCH_CANCELLED`、revision 从 1 变为 2、队列项消失，以及同一 snapshot 读取到 `pending_submission` 且恢复编辑/重新入队能力。

## 未执行与 Git 状态

- 未执行真实登录、真实投稿、付费或任何外部平台操作。
- 未执行全量 `npm test`；本线程按风险运行定向测试，未扩大到全量门禁。
- 未执行 Primary Audit、commit、merge、push 或 Thread 3 调度。
- 当前工作树保留本线程 2 个 production/test 文件及本 handoff 的未提交变更。

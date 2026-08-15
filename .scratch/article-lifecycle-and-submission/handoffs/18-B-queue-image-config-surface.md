# 18-B — 队列组图片数量应用面与 UI 接线：Closure Handoff

## 状态与范围

- 工作包：`18-B-queue-image-config-surface`。
- 开始 integration HEAD：`444375986b27431b65169a293109c782a02d8d33`；implementation commit：`4862919b4e71df2fb50d7fb889dec253e1cfe148`。
- 原 Manual Dispatch 完成 implementation 与定向验证后，已在 implementation HEAD 完成 Primary Audit 与 Bounded Re-audit；本 handoff 和 Wave Plan 状态回填另见 closure commit。
- 未进行真实登录、上传、发布、付费或生产数据库操作。

## 已实现

- `regular-queue-application` 的 admission `queueConfig` 现在是闭合字段集，只接受可选 `queueGroupId` 与 `imageCount: 0..5`。新组继续由 18-A 使用其默认值，追加到既有 group 不会改写已持久化的值。
- 新增具名应用命令 `updateRegularQueueGroupImageCount({ queueGroupId, imageCount, expectedRevision })`，唯一写入经 18-A 的 `regularQueueGroupImageCountTransitions.setRegularQueueGroupImageCount`；成功后返回刷新后的 group snapshot 并发出 `REGULAR_QUEUE_GROUP_IMAGE_COUNT_UPDATED`。
- group snapshot 暴露安全标量 `imageCount` 与 `imagePublishingSupported`，没有图片路径、字节或选中列表。
- adapter/catalog capability 只接受显式 `imagePublishingCapability: { supported: true }`；缺失或畸形声明一律投影为不支持。现有生产 adapter 没有新增声明，因此生产 UI 默认隐藏图片配置入口；后续 19–21 只能在 adapter/catalog 层显式开启。
- 新 IPC capability 为 `content.updateRegularQueueGroupImageCount` / `content:update-regular-queue-group-image-count`，请求严格限制为 queue group、0–5 整数和 revision；preload、bridge、Renderer types 与 production IPC fixture matrix 同步更新为 114 项。
- Renderer 仅在 `imagePublishingSupported === true` 时显示“每篇图片数量”输入。它支持 0–5、非法输入本地禁用、保存 busy/错误/成功反馈、revision CAS 与窄屏纵向布局。保存后的快照同步不会立即清掉成功反馈。

## 验证证据

在 `auto—publish/` 实际通过：

```text
node --test --test-concurrency=1 tests/ticket-18-b-queue-image-config-surface.test.js tests/phase-06-content-operations-typed-ipc.test.js tests/phase-07-regular-queue.test.js
# 26 passed, 0 failed

node --test --test-concurrency=1 tests/renderer-platform-queue-refresh-lifecycle.test.js
# 3 passed, 0 failed

node --test --test-concurrency=1 tests/phase-06-production-ipc-fixture-matrix.test.js
# 33 passed, 0 failed (114 production capabilities)

node --test --test-concurrency=1 tests/phase-06-typed-ipc-production.test.js tests/production-preload-sandbox.electron.test.js tests/content-submission-ipc.test.js
# 分别 15、2、10 passed，均 0 failed

npm --prefix media-workbench run typecheck:strict
npx --no-install eslint <本工作包 production 与 test 文件>
git diff --check
# 均通过
```

`tests/phase-08-renderer-contract-layout.test.js` 与 `tests/phase-08-renderer-contract-artifact-absence.test.js` 也通过（6 passed）。Vite Renderer 构建仅输出既有 bundle-size 和外部临时 outDir 警告。

限定 Prettier check 对 17 个所选既有文件报格式不匹配；抽样对 HEAD 的 application、preload、Renderer component 与 phase-07 测试运行同一 check 也均为 exit 1，因此没有为本 Ticket 全文件重格式化。新增 `ticket-18-b-queue-image-config-surface.test.js` 未在该命令中报格式问题。

## Audit closure

- **Primary Audit scope：** `4443759..4862919` 的 application、唯一 image-count transition 接线、typed IPC/preload/bridge、Renderer capability gate 及其直接测试。
- **Checked invariants：** `imageCount` 仍只有 18-A transition 写入；admission/更新输入均为闭合字段集且限制为 `0..5`；IPC/bridge snapshot 只有标量、无路径/二进制/选中图；没有 adapter 明确 `supported: true` 时 production UI 不显示入口；显式更新使用 revision 并在重启后重读持久化值。
- **Findings：** 无。没有 `INTRODUCED_BY_CHANGE`、`CROSS_TICKET_INTERACTION` 或阻塞的证据缺口。
- **Bounded Re-audit：** 仅复核上述 diff、直接调用链和已运行回归；没有 remediation diff 或 escalation 条件，结论 `PASS`。

## Current-HEAD verification

在 `auto—publish/` 实际通过：

```text
node --test --test-concurrency=1 tests/ticket-18-b-queue-image-config-surface.test.js tests/phase-06-content-operations-typed-ipc.test.js tests/phase-07-regular-queue.test.js
# 26 passed, 0 failed

node --test --test-concurrency=1 tests/phase-06-production-ipc-fixture-matrix.test.js
# 33 passed, 0 failed

node --test --test-concurrency=1 tests/phase-06-typed-ipc-production.test.js tests/production-preload-sandbox.electron.test.js tests/content-submission-ipc.test.js
# 15 + 2 + 10 passed, 0 failed

node --test --test-concurrency=1 tests/renderer-platform-queue-refresh-lifecycle.test.js
# 3 passed, 0 failed

npm --prefix media-workbench run typecheck:strict
npx --no-install eslint <18-B changed production and test files>
git diff --check
# all passed
```

`phase-06-production-ipc-fixture-matrix` 的 TypeChecker identity assertion 在本机耗时约 107 秒，但以 33/33 正常退出；不是测试挂起或失败。

## 后续边界

- 18-B 已 `COMPLETE`；18-C 可以从 closure commit 的 clean integration HEAD 串行开始。
- 不得由本票据推进图片选择、图片库、prepare port、平台上传或修改现有 adapter 的 capability 声明；这些属于后续 Wave gate。

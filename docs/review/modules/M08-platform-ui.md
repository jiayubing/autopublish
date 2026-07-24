# M08 平台工作台深审

> 深度审查状态：已完成（生产文件、直接 bridge/IPC/worker 契约与相关测试已检查）。

## 模块职责和边界

`PlatformWorkbench` 展示普通平台队列、选择和任务快照；`platform-submission-controller.js` 管理提交/暂停/停止/残留清理命令生命周期；`platform-task-store.tsx` 负责跨页面任务快照；主进程 platform IPC/worker 执行实际投稿。

## 已检查范围与关键调用链

检查 `components/PlatformWorkbench.tsx`、`PlatformTaskIndicator.tsx`、`controllers/platform-submission-controller.js`、`hooks/use-platform-workbench-controller.ts`、`platform-task-store.tsx`、platform bridge/preload、`desktop/ipc/platform-ipc.js`、`desktop-task-service.js` 与平台任务测试。

## 发现列表

### TEMP-M08-1：暂停命令使提交请求失去完成权，可能永久保持 busy

- 分类：并发/生命周期
- 所属模块：M08
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`controllers/platform-submission-controller.js:55-81`、`components/PlatformWorkbench.tsx:203-206`
- 问题描述：`submit` 保存 requestId；`pause` 调用 `begin({ pausing:true })` 递增同一 requestId，却不把 `submitting` 置回 false。提交 Promise 之后完成时 `current(requestId)` 为 false，finally 不清理 submitting。
- 触发条件：提交请求尚未 resolve 时点击“暂停”。
- 可达路径或调用链：`handleSubmit` → controller.submit → `handlePause` → controller.pause 递增 requestId → submit resolve → 第 66 行跳过清理。
- 实际影响：`taskBusy` 长期为真，提交按钮、残留处置等持续禁用，直到离开并重新挂载工作台。
- 影响范围：普通平台投稿 UI。
- 现有测试是否覆盖：仅有静态 seam 与平台队列生命周期测试，未覆盖 submit/pause 交错。
- 验证方法与结果：最小复现（注入 pending submit，调用 pause 后 resolve）输出 `{"submitting":true,"pausing":false,"requestId":2}`。
- 修复方向：拆分命令序列号与提交 busy 生命周期，或在暂停终态显式收敛提交状态。
- 关联发现：无

### TEMP-M08-2：残留清理确认绕过统一模态宿主

- 分类：契约/可访问性
- 所属模块：M08
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`components/PlatformWorkbench.tsx:111-119`
- 问题描述：删除文章队列残留使用 `window.confirm`，未经过统一 `ConfirmationHost`，与项目“所有确认对话框由独立模态宿主负责焦点/Escape”的契约不一致。
- 触发条件：发现可清理残留并点击安全收尾。
- 可达路径或调用链：`repairQueueResidue` → `window.confirm` → `cleanupResidue`。
- 实际影响：原生对话框无法纳入统一焦点、可访问性和自动化测试；Electron/浏览器行为不一致。
- 现有测试是否覆盖：未覆盖该确认路径。
- 验证方法与结果：源码命中 `window.confirm`，而 `ConfirmationHost` 只包裹 App 的统一 context。
- 修复方向：改用 `useConfirmation`。
- 关联发现：TEMP-M07-2

## 测试情况

- `node --test tests/renderer-platform-queue-refresh-lifecycle.test.js tests/renderer-platform-cross-page-progress.test.js tests/renderer-workbench-controller-seams.test.js`：队列/跨页测试通过；seam 测试 2 项失败，仍断言旧 hook/view 结构。
- `npm --prefix media-workbench run lint`：通过。

## 未覆盖区域

未做真实 worker 暂停时序、窗口切换期间命令竞态及 runId 过期交互。

## 模块审查结论

任务快照跨页设计通过已有回归，但生产 controller 的暂停生命周期有可复现 busy 卡死；M08 深审已完成，结论为不通过。

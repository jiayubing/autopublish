# M06 Renderer gates 与应用壳深审

> 深度审查状态：已完成（生产文件、直接 bridge/preload 契约与相关测试已检查）。

## 模块职责和边界

`main.tsx` 组装 AuthGate 与 WorkspaceBootstrapGate；AuthGate 控制认证/恢复/授权状态；WorkspaceBootstrapGate 控制工作区就绪后才挂载 App；App 组合全局数据 provider、导航和 lazy workbench。

## 已检查范围与关键调用链

检查 `main.tsx`、`App.tsx`、`components/AuthGate.tsx`、`components/WorkspaceBootstrapGate.tsx`、`workspace-ui-logic.js`、`workspace-data-store.tsx`、`article-attention-store.tsx`、`platform-task-store.tsx` 及对应 bridge/preload。

## 发现列表

### TEMP-M06-1：初始媒体加载可覆盖失效刷新后的新快照

- 分类：并发/请求身份
- 所属模块：M06
- 严重程度：中
- 置信度：高
- 验证状态：部分验证
- 位置：`media-workbench/src/App.tsx:83-106,262-277`
- 问题描述：挂载时 `loadData()` 的 `Promise.all` 不带 request id；失效事件触发的 `refreshMediaWorkbenchData()` 带 id，但不会使初始请求失效。
- 代码证据：初始请求完成后无条件 `setArticles/setResources/setOrders/setBalance`；只有后续刷新在 265、270 行检查 `mediaRefreshRequestId`。
- 触发条件：启动期间初始资源/订单请求较慢，同时投稿或其他窗口触发 `mediaWorkbench` invalidation。
- 可达路径或调用链：App mount → `loadData` pending → `workspace:data-invalidated` → `refreshMediaWorkbenchData` 写入新文章/订单 → 初始 `Promise.all` 返回旧结果并覆盖。
- 实际影响：媒体工作台显示已被消费/更新前的文章或订单，用户可能对过期稿件继续操作。
- 影响范围：M09 媒体稿件、订单视图。
- 现有测试是否覆盖：`renderer-platform-queue-refresh-lifecycle` 只覆盖 platform queue；未覆盖 App 初始媒体请求与 invalidation 交错。
- 验证方法与结果：静态调用链核验；初始写入没有 `requestId`/mounted 检查，风险可达但未做网络延迟现场复现。
- 修复方向：让初始加载纳入同一请求序列/取消令牌，并在每个状态写入前校验当前请求与挂载状态。
- 关联发现：TEMP-M09-1

## 测试情况

- `npm --prefix media-workbench run lint`：通过。
- `node --test tests/renderer-platform-queue-refresh-lifecycle.test.js tests/renderer-workspace-contract.test.js`：全部通过。

## 未覆盖区域

未运行认证服务恢复状态真实网络场景；未验证 React StrictMode 下 provider 初始化与卸载交错。

## 模块审查结论

认证/工作区门控和 platform queue 外部 store 设计清晰，但 App 顶层媒体初始请求没有并发身份保护；M06 深审已完成，结论为部分通过。

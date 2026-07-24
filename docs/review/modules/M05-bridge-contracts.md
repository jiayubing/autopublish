# M05 Preload 与 renderer bridge 契约深审

> 深度审查状态：已完成（生产文件、直接 IPC 契约与相关测试已检查）。

## 模块职责和边界

Preload 通过 `desktopConsole` 暴露白名单 IPC；renderer bridge 负责响应 DTO、错误和浏览器环境降级；主进程 `desktop/ipc/*` 是命令实现与认证边界。bridge 不拥有业务状态。

## 已检查范围与调用链

- `desktop/preload.js`、`desktop/ipc/register.js`、`desktop/ipc/{media,platform,ai-content,content-generation-batch,content-submission,doubao-collection,publication,article-attention,article-management}.js`、`desktop/services/ipc-response.js`。
- `media-workbench/src/bridge/{transport,auth,workspace,settings,media,platform,publication,content}.ts`、`types.ts`。
- 典型链路：React → bridge → preload `ipcRenderer.invoke` → authenticated registrar → service；状态事件经 preload listener 返回 renderer。

## 发现列表

### TEMP-M05-1：发布日志事件发送后没有 renderer 能力面

- 分类：API/事件契约
- 所属模块：M05
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`desktop/ipc/platform-ipc.js:228-229`、`desktop/workspace-runtime.js:89`、`desktop/preload.js:1-202`
- 问题描述：主进程及 worker 将日志发送到 `publish-log`，preload 没有对应 `onPublishLog`/订阅 API，renderer 源码也没有该事件消费者。
- 代码证据：`sendToRenderer("publish-log", entry)` 仅出现于主进程；preload 仅暴露 auth、workspace、platform-state、content 等事件。
- 触发条件：普通平台投稿运行并产生日志。
- 可达路径或调用链：`platforms:submit-selected` → `desktop-task-service`/worker → `onLog` → `sendToRenderer("publish-log")` → 无桥接订阅。
- 实际影响：实时投稿日志无法到达 UI，故障诊断只能依赖文件日志；新增日志消费方容易误以为事件已契约化。
- 影响范围：M08 平台工作台、运行观测。
- 现有测试是否覆盖：未见 preload/renderer `publish-log` 契约测试；IPC response 测试通过但不覆盖事件。
- 验证方法与结果：`rg -n "publish-log|onPublishLog" desktop media-workbench/src tests` 仅命中发送端；确认无接收端。
- 修复方向：决定性地暴露并消费带 DTO 的日志事件，或删除发送路径并统一文件日志。
- 关联发现：TEMP-M08-2

## 测试情况

- `npm --prefix media-workbench run lint`：通过。
- 定向 IPC/renderer 契约测试：29/29 通过；其余见 validation-results 汇总。

## 未覆盖区域

未运行 Electron 真窗口下的 preload 事件注入；未验证生产日志订阅需求。

## 模块审查结论

命令白名单和响应包装总体一致（127 个 preload 命令与 128 个注册 handler，仅 `content:recover-article-removals` 未在 preload 暴露），但日志事件契约存在明确断裂；M05 深审已完成，结论为有条件通过。

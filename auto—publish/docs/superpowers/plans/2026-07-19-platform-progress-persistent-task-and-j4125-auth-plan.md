# 投稿任务进度持久化、跨页面恢复与 J4125 登录验证计划

**日期：** 2026-07-19

**发布包：** `F:\官媒投稿\auto—publish\release-alpha\win-unpacked\AutoPublish.exe`

**源代码：** `F:\官媒投稿\auto—publish`

**认证服务器参考：** `E:\闲聊\J4125_SERVER_NOTES.md`

**基线：** 前置“问题编辑会话、免审核投稿与批量入队交接”计划已执行；当前工作树包含该计划的实现改动，实施本计划前先建立可追溯提交或快照，禁止用 reset/checkout 覆盖现有改动。

**目标：** 在“其他平台投稿”中显示可恢复的任务进度；切换页面后任务、进度、暂停/停止能力和结果摘要不丢失；软件启动后必须先通过 J4125 的登录验证，未登录时不挂载业务功能，且所有业务 IPC 也拒绝未认证调用。

**已确认的认证决策：** 认证 API 使用 `https://auth.jiayubing.xyz`；第一版只创建一个管理员账号，不开放公开注册、不实现多角色和账号管理网页后台。

本计划只定义实现、测试和部署边界，不直接操作真实文章、投稿队列、发布账本、J4125 Docker 容器或 Cloudflare Tunnel 配置。

---

## 1. 结论摘要

| 问题/需求 | 已确认事实 | 方案 | 优先级 |
| --- | --- | --- | --- |
| 投稿没有清晰进度 | Worker 只有阶段事件和心跳，没有统一的完成数、总数、结果计数。 | 建立带 `runId` 的发布任务快照，显示总任务、已处理、当前任务、阶段和结果计数。 | P0 |
| 切换页面状态丢失 | `PlatformWorkbench` 在 `App` 的 `currentView === 'platforms'` 分支中卸载；进度和结果在组件 `useState`。 | 状态提升到主进程快照 + Renderer 外部 store；页面只是订阅者，卸载不影响执行。 | P0 |
| 重新进入页面无法恢复 | `platforms:get-state` 只返回 `isBatchRunning/isStopPending/isPlatformRunning`，不返回当前批次进度。 | `getState` 返回安全的完整快照，订阅初始化先读快照再监听事件。 | P0 |
| 启动后必须登录 | 当前没有认证服务、认证 IPC 或业务 IPC 守卫。 | J4125 提供独立 HTTPS 认证 API；Electron 主进程持有会话，AuthGate 通过后才挂载工作区和业务 UI。 | P0 |
| 只做前端登录容易绕过 | Renderer/Preload 可被直接调用，单纯隐藏页面不是安全边界。 | 主进程对所有业务 IPC 统一执行 `AUTH_REQUIRED` 检查，只有认证、诊断和必要的退出操作例外。 | P0 |
| J4125 数据边界 | J4125 已有 Docker 和 Cloudflare Tunnel。 | 新增独立 auth 容器和域名路由，只保存账号/会话/授权，不接管内容库和发布数据。 | P0 |

---

## 2. 已完成的排查与反馈信号

### 2.1 当前执行链

```text
PlatformWorkbench
  -> platforms:submit-selected-plan
  -> main process DesktopTaskService
  -> child worker platform-submit
  -> PlatformWorkbenchService.submitSelectedPlanSerially
```

主进程的 `platformChild` 在切换页面时不会因为 Renderer 卸载而结束，因此用户观察到的“任务实际继续”是正确的。问题是 Renderer 只订阅短暂事件，不能在重新挂载时恢复细节。

Worker 已经发出：

- `before-remote`；
- `remote-started`；
- `remote-finished`；
- `waiting-interval`；
- 250ms 心跳。

但事件没有统一的 `runId`、`total`、`processed`、`succeeded`、`failed`、`skipped`、`uncertain` 和安全的最终摘要。

### 2.2 当前只读探针与基线测试

已运行只读结构探针，当前结果为：

```text
FAIL platform progress snapshot has completed and total
FAIL getPlatformState restores current task details
FAIL main-process auth gate exists
FAIL server auth client exists
```

当前专项测试基线：

```text
node --test tests/desktop-task-service.test.js tests/platform-ipc-boundary.test.js \
  tests/react-workbench-regression.test.js tests/renderer-platform-queue-refresh.test.js \
  tests/renderer-platform-queue-refresh-lifecycle.test.js tests/desktop-workbench-flow.test.js

20 passed, 0 failed
```

这些测试证明现有平台命令和队列刷新契约正常，但没有验证切页后快照恢复，也没有认证边界。

### 2.3 J4125 部署事实

服务器说明显示：

- J4125 已运行 Docker；
- 已有 Cloudflare Tunnel 和域名入口；
- 现有服务各自有独立容器和数据目录；
- 当前没有 AutoPublish 专用认证服务。

本计划不把 SSH 私钥、公共 IP、Cookie 或其他凭证写入代码、计划、安装包或日志。认证 API 通过现有 Tunnel 的 HTTPS 域名访问，不让客户端直连家庭公网 IP 或暴露新的公网端口。

---

## 3. 领域决策

### 3.1 发布任务快照是执行事实，不是发布账本

快照只记录当前一次执行的安全摘要：

```text
runId
phase
total
processed
succeeded
failed
skipped
uncertain
currentTask
startedAt
updatedAt
terminalResult
```

它不替代 publication ledger、submission batch 或队列文件。远端结果仍由发布账本记录，快照只帮助 UI 恢复进度和操作按钮。

### 3.2 进度计数规则

- `total`：启动时确认的计划任务数，启动后不可改变；
- `processed`：已得到终态结果的任务数，等于 `succeeded + failed + skipped + uncertain`；
- `succeeded`：远端发布成功或平台明确接受的任务，按最终结果摘要展示；
- `failed`：明确失败任务；
- `skipped`：停止、删除、重复或明确跳过任务；
- `uncertain`：远端结果无法确认的任务；
- `currentTask`：仅包含平台 ID、文件名和阶段，不包含绝对路径、正文或 Cookie。

等待蓝色河畔发布间隔时，`processed` 不增加，显示倒计时和下一篇；远端调用完成后才计入结果。

### 3.3 页面切换不影响正在运行的任务

- 执行器只由主进程/Worker 控制；
- Renderer 页面可以卸载和重新挂载；
- 任务快照在主进程内存中持续维护；
- Renderer 外部 store 在 App 根部订阅，不随平台页面卸载；
- 重新进入平台页先调用 `getState()` 获取快照，再订阅后续事件；
- 暂停、继续或停止始终通过主进程当前 `runId` 操作；
- 页面切换不触发取消、不重建 Worker、不重置进度。

应用进程完全退出时不承诺继续运行当前 Worker。退出/崩溃后的任务必须通过队列和账本重新核对，不能伪造“仍在运行”；下次启动显示 `interrupted` 或根据已有账本派生真实状态。

### 3.4 登录是应用使用门槛，不是平台登录

必须区分：

- **应用认证会话**：用户是否有权使用 AutoPublish，由 J4125 判断；
- **平台登录状态**：蓝色河畔、头条等远端平台的 Cookie/浏览器会话，由各平台适配器判断。

应用认证成功不能代替平台登录；平台登录失效也不能注销应用账号。

### 3.5 未登录时的最小可用面

未认证时只允许：

- 显示登录页；
- 读取安全的认证状态；
- 登录、刷新会话、退出登录；
- 显示固定错误和重试按钮；
- 关闭应用。

未认证时不初始化工作区业务服务、不读取客户目录、不读取文章/队列、不打开平台设置、不启动 Worker。

---

## 4. 低耦合架构

### 4.1 发布任务状态模块

**主进程：** `platform-task-state-store`

职责：

- 生成一次执行的 `runId`；
- 接收 Worker 进度事件并累计计数；
- 保存当前快照和终态摘要；
- 向 Renderer 广播最小安全快照；
- 为 `getState()` 提供当前快照；
- 校验暂停/停止命令属于当前 `runId`。

它不写 publication ledger、不解析文章正文、不决定发布结果；这些仍由平台工作台服务和账本负责。

**Renderer：** `platform-task-store.tsx`

职责：

- App 根部只创建一次；
- 初始化读取 `getPlatformState()`；
- 订阅 `onPlatformState`；
- 忽略旧 `runId` 或更旧 `updatedAt` 事件；
- 为 Sidebar、PlatformWorkbench 和全局提示提供同一只读快照。

### 4.2 任务状态事件契约

事件格式建议：

```json
{
  "runId": "opaque-run-id",
  "phase": "running",
  "total": 20,
  "processed": 7,
  "succeeded": 6,
  "failed": 1,
  "skipped": 0,
  "uncertain": 0,
  "currentTask": {
    "sourcePlatformId": "hepan",
    "filename": "article-07.md",
    "targetPlatformId": "hepan"
  },
  "waitRemainingMs": 0,
  "startedAt": "2026-07-19T00:00:00.000Z",
  "updatedAt": "2026-07-19T00:01:00.000Z",
  "terminalResult": null
}
```

禁止字段：绝对路径、文章正文、Cookie、API Key、完整远端响应、Prompt。

### 4.3 J4125 认证 API

J4125 新增独立认证服务，例如内部监听 `127.0.0.1:31xx`，通过 Cloudflare Tunnel 暴露固定的 `auth.jiayubing.xyz` HTTPS 主机名。认证服务与现有下载、文件、AI 服务隔离，不复用 Alist、Open WebUI 或首页容器的账号表。

认证服务固定使用域名 `auth.jiayubing.xyz`，建议端点：

```text
GET  /healthz
POST /v1/auth/login
POST /v1/auth/refresh
POST /v1/auth/logout
GET  /v1/auth/session
GET  /v1/auth/entitlements
```

最小服务端数据：

- 用户 ID、登录名、密码哈希、启用状态；
- refresh token 哈希、设备 ID、创建/过期/撤销时间；
- 产品授权状态和版本策略；
- 登录失败次数、最近登录时间和必要审计事件。

不保存：客户资料、文章正文、生成 Prompt、投稿队列、publication ledger、平台 Cookie、AI Key。

### 4.4 Electron 认证边界

**主进程：** `auth-service`

- 通过 Node 主进程发起 HTTPS 请求，不让 Renderer 直接处理 refresh token；
- access token 只保存在主进程内存；
- refresh token 使用 Electron `safeStorage` 加密后存于应用 `userData`；
- 服务器返回错误只转换成固定错误码和中文文案；
- 登录、刷新、退出和会话状态通过专用 IPC 暴露。

**IPC：**

- `auth:get-state`
- `auth:login`
- `auth:refresh`
- `auth:logout`

所有业务 IPC 通过统一 `requireAuthenticated` 包装。禁止只在 React 中隐藏按钮而不保护主进程。

### 4.5 启动门禁顺序

```text
Electron ready
  -> 初始化 AuthService 和认证 IPC
  -> AuthGate 读取会话
  -> 未认证：只显示登录页
  -> 认证成功
  -> 初始化 WorkspaceBootstrap
  -> 工作区 ready 后初始化内容、投稿和平台服务
  -> 挂载 App 业务界面
```

工作区路径选择是否展示在登录前需要保持一致：本计划采用登录优先，避免未登录时探测客户目录；登录成功后再进入原有工作区选择流程。

---

## 5. 用户交互设计

### 5.1 其他平台投稿进度卡

任务运行时显示：

```text
平台投稿进行中
7 / 20 已处理                         35%
成功 6 · 失败 1 · 跳过 0 · 待确认 0
当前：蓝色河畔 · article-07.md
阶段：等待下一篇 · 还需 12 秒
[暂停] [停止]
```

任务结束显示：

```text
投稿任务已完成
20 个任务 · 成功 17 · 失败 2 · 待确认 1
[查看失败/待确认] [刷新队列] [关闭摘要]
```

如果当前页面不是“其他平台投稿”，Sidebar 显示小型全局状态：

```text
投稿中 7/20
```

点击后切回投稿页面。切页期间只读快照继续更新。

### 5.2 页面切换行为

- 切换到文章管理、内容生成、设置或订单页：任务继续；
- 回到其他平台投稿：进度卡显示当前快照，不重新开始；
- 暂停/停止按钮根据快照显示，不能依赖组件首次挂载时的本地布尔值；
- 终态摘要在用户主动关闭前保留；
- 队列刷新在终态事件后执行一次，不能因为重新进入页面重复提交或重复刷新；
- 如果主进程返回 `interrupted`，显示“应用上次退出时任务未完成，请核对队列和发布记录”，不自动重试。

### 5.3 登录页面

登录页只包含：

- 登录名；
- 密码；
- 登录按钮；
- 连接状态和安全错误；
- 服务器地址显示为只读产品配置，不允许用户把任意地址注入到业务调用；
- “记住本机登录”只保存加密 refresh token，不保存密码。

未登录页面不展示客户名称、文章标题、队列数量、平台配置或本地路径。

### 5.4 会话失效行为

- 启动时 refresh token 无效：显示重新登录；
- 服务器返回授权撤销：立即清除本地 token 并锁定新业务操作；
- access token 过期：主进程自动 refresh 一次；
- refresh 失败：显示登录页，但不强行杀死正在进行的远端调用；任务完成后进入安全终态并要求重新登录；
- 退出登录：撤销服务端 refresh token、清除本地 token、停止后续新任务，不删除工作区内容和发布记录。

---

## 6. 分阶段实施任务

### Task 0：建立红色回归和提交边界

**Create：**

- `tests/platform-task-progress.test.js`
- `tests/renderer-platform-task-store.test.js`
- `tests/renderer-platform-cross-page-progress.test.js`
- `tests/auth-service.test.js`
- `tests/auth-ipc-boundary.test.js`
- `tests/auth-gate.test.js`
- `tests/auth-protected-ipc.test.js`
- `tests/j4125-auth-contract.test.js`

**Modify：**

- `tests/desktop-task-service.test.js`
- `tests/platform-ipc-boundary.test.js`
- `tests/desktop-workbench-flow.test.js`
- `tests/react-workbench-regression.test.js`
- `scripts/verify.js`

实施：

- [ ] 构造 20 个任务，发出 7 个终态事件后断言当前实现不能恢复 `7/20`，先看到 RED。
- [ ] 挂载 App，启动任务，切换到文章管理，再回到投稿页，断言当前实现丢失进度卡和终态摘要，先看到 RED。
- [ ] 断言 `getPlatformState()` 缺少 `runId/total/processed`，先看到 RED。
- [ ] 断言无认证时业务 IPC 返回 `AUTH_REQUIRED`，先看到 RED。
- [ ] 使用内存 HTTP 假服务器验证登录、refresh、撤销和错误脱敏，禁止访问真实 J4125。

### Task 1：实现主进程发布任务快照

**Create：**

- `desktop/services/platform-task-state-store.js`

**Modify：**

- `desktop/services/desktop-task-service.js`
- `desktop/services/platform-workbench-service.js`
- `desktop/worker/run-task.js`
- `desktop/ipc/platform-ipc.js`
- `desktop/main.js`
- `desktop/preload.js`
- `media-workbench/src/types.ts`
- `media-workbench/src/electron-api.ts`

实施：

- [ ] 启动时生成不透明 `runId`，不使用文章正文或绝对路径作为 ID。
- [ ] 将 Worker 每次 `onTaskState` 转换为累计进度快照。
- [ ] 对 `remote-finished`、失败、跳过、待确认和停止路径各计数一次，避免重复事件双计数。
- [ ] 通过 `getState()` 返回当前运行或最近终态快照。
- [ ] 事件和快照都带 `runId`、`updatedAt`，Renderer 拒绝旧事件。
- [ ] 暂停/停止只操作当前运行任务，重复命令幂等。
- [ ] 快照只返回安全字段，不返回绝对路径和正文。
- [ ] 任务终态仍调用既有队列失效刷新，不把进度快照当作账本。

### Task 2：将 Renderer 任务状态提升到 App 根部

**Create：**

- `media-workbench/src/platform-task-store.tsx`
- `media-workbench/src/components/PlatformTaskIndicator.tsx`

**Modify：**

- `media-workbench/src/App.tsx`
- `media-workbench/src/components/PlatformWorkbench.tsx`
- `media-workbench/src/components/Sidebar.tsx`
- `media-workbench/src/index.css`

实施：

- [ ] App 根部只创建一个任务 store；PlatformWorkbench 不再独占运行状态。
- [ ] 页面进入时先读快照再订阅事件，避免先显示 idle 覆盖真实 running。
- [ ] 投稿页显示详细进度卡、百分比、结果计数、当前任务和间隔倒计时。
- [ ] Sidebar 显示进行中的小徽标，并可跳回投稿页。
- [ ] 切换页面不清空进度、结果摘要、暂停/停止能力。
- [ ] 终态摘要只由用户关闭，不因组件卸载丢失。
- [ ] 队列和导航徽标仍由既有 `workspace:data-invalidated` 快照负责，避免把两种状态合并。

### Task 3：补齐跨页面和终态恢复测试

**Modify：**

- `tests/renderer-platform-queue-refresh.test.js`
- `tests/renderer-platform-queue-refresh-lifecycle.test.js`
- `tests/renderer-platform-task-store.test.js`
- `tests/renderer-platform-cross-page-progress.test.js`
- `tests/desktop-task-service.test.js`

实施：

- [ ] running/waiting-interval/stopping/completed/failed/stopped/uncertain 全部覆盖。
- [ ] 事件乱序、重复心跳、旧 runId 和旧 updatedAt 不得倒退快照。
- [ ] 切页期间进度事件持续进入 store，回页显示最新值。
- [ ] 任务结束后队列刷新只发生一次。
- [ ] 页面回到投稿页可继续暂停/停止当前任务。
- [ ] 应用退出后不伪造继续运行，启动时显示 interrupted 或账本派生状态。

### Task 4：实现 J4125 认证服务契约

**Create（服务器项目，建议单独目录或独立仓库）：**

- `auth-server/package.json`
- `auth-server/src/server.js`
- `auth-server/src/auth-store.js`
- `auth-server/src/token-service.js`
- `auth-server/Dockerfile`
- `auth-server/docker-compose.yml`
- `auth-server/.env.example`
- `auth-server/migrations/001-auth.sql`
- `auth-server/tests/auth-api.test.js`

实施：

- [ ] 账号密码使用 Argon2id 或同等级内存硬密码哈希，不保存明文。
- [ ] refresh token 只存服务端哈希，客户端保存加密 token。
- [ ] access token 短期有效，refresh token 轮换并支持撤销。
- [ ] 登录失败限速、账号暂时锁定、设备会话上限和审计事件。
- [ ] 登录响应只返回最小用户/授权信息，不返回数据库路径或内部错误。
- [ ] `/healthz` 不泄露账号和授权数据。
- [ ] 不开放公共注册；第一版只创建一个 `admin` 管理员账号，使用 SSH 管理命令初始化、修改密码、禁用和撤销会话。
- [ ] 第一版不实现用户注册、多账号、多角色或网页管理后台。
- [ ] 授权字段至少包含 `enabled`、`product`、`expiresAt` 或明确的永久授权策略；唯一管理员账号默认授予 AutoPublish 使用权限。
- [ ] 服务端测试覆盖密码错误、禁用账号、过期 refresh、重复 refresh、撤销和并发登录。

### Task 5：J4125 Docker 与 Cloudflare Tunnel 部署

**只在用户明确授权部署后执行；本计划阶段只准备脚本和验收清单。**

实施：

- [ ] 在 J4125 上为认证服务创建独立目录和持久化数据卷，不复用 Alist/Open WebUI 数据目录。
- [ ] 容器只监听内部端口或回环地址，不新增家庭公网暴露端口。
- [ ] 通过现有 Cloudflare Tunnel 增加 `auth.jiayubing.xyz` ingress，强制 HTTPS。
- [ ] 认证服务的签名密钥、数据库密钥和管理员初始化凭证只存在服务器 secret，不进入 Git、镜像或客户端。
- [ ] 配置备份和恢复演练，备份只包含认证数据库和服务端密钥，不包含客户文章。
- [ ] 使用服务器 `/healthz` 和登录 API 做外部最小验证，不在服务器上启动发布 Worker。
- [ ] 记录容器日志保留策略，禁止日志输出密码、token、文章标题、Cookie 或完整请求体。
- [ ] 先用临时测试账号验证，再创建唯一正式 `admin` 账号并确认授权期限。

### Task 6：Electron 登录门禁和主进程授权

**Create：**

- `desktop/services/auth-service.js`
- `desktop/ipc/auth-ipc.js`
- `media-workbench/src/components/AuthGate.tsx`
- `media-workbench/src/auth-store.tsx`

**Modify：**

- `desktop/main.js`
- `desktop/ipc/register.js`
- `desktop/preload.js`
- `media-workbench/src/main.tsx`
- `media-workbench/src/App.tsx`
- `desktop/ipc/*.js`（统一业务 IPC 守卫）
- `desktop/security/navigation.js`
- `scripts/verify.js`

实施：

- [ ] Electron ready 后先初始化 AuthService 和认证 IPC，再显示窗口。
- [ ] `AuthGate` 通过 `auth:get-state` 判断是否展示登录页。
- [ ] 未认证时不挂载 WorkspaceBootstrapGate、App 和任何业务页面。
- [ ] 登录成功后才初始化工作区 bootstrap 和运行时服务。
- [ ] 每个业务 IPC 在主进程检查当前认证会话，未认证返回固定 `AUTH_REQUIRED`。
- [ ] 认证状态变化通过 `auth-state-changed` 广播，页面统一锁定/解锁。
- [ ] access token 只在主进程内存；refresh token 用 safeStorage 加密到 userData。
- [ ] 不把 token 放进 workspace、localStorage、URL、日志或错误对象。
- [ ] 退出登录撤销 refresh token、清除本地凭证并停止后续新任务，但不删除本地内容。
- [ ] 认证过期时不强杀正在进行的远端调用；任务完成后进入安全终态并禁止新操作。
- [ ] 认证服务器地址来自签名/打包配置或受控环境，不接受 Renderer 任意 URL。

### Task 7：安全、兼容和打包验收

**Modify：**

- `docs/clean-machine-installation.md`
- `docs/alpha-packaging-checklist.md`
- `docs/desktop-workbench.md`
- `docs/content-generation-operations.md`
- `docs/adr/`（仅在认证会话存储和在线门禁取舍需要长期解释时新增 ADR）
- `tests/electron-security.test.js`
- `tests/desktop-packaging.test.js`
- `tests/alpha-smoke-verifier.test.js`

实施：

- [ ] 安装包不包含 J4125 私钥、账号密码、refresh token、服务器数据库或客户数据。
- [ ] 未登录冷启动、错误密码、服务器不可达、会话撤销和权限过期均有明确 UI。
- [ ] 登录后工作区选择、文章管理、平台投稿和已有业务测试全部保持可用。
- [ ] 认证失败不泄露服务器内网地址、堆栈、数据库错误或 token 内容。
- [ ] 打包版通过外部域名登录，再验证断网、切页和任务继续。
- [ ] 用户未授权 J4125 部署前，只完成本地 mock/fixture 验收，不连接真实服务器。

---

## 7. 测试矩阵

### 7.1 发布进度与跨页面

| 场景 | 预期 |
| --- | --- |
| 20 个任务刚启动 | `0/20`，显示 running 和当前任务 |
| 7 个任务得到终态 | `7/20`，结果计数准确 |
| 河畔等待间隔 | processed 不增长，显示倒计时和下一篇 |
| 任务中切到文章管理 | Worker 继续；全局徽标显示进度 |
| 回到投稿页 | 读取同一个 runId 和最新快照 |
| 点击暂停/停止 | 命令作用于当前 runId，不启动第二个 Worker |
| 远端结果 uncertain | 计入 uncertain，不误报成功或失败 |
| 重复 heartbeat | 不重复增加 processed |
| 旧 runId 事件晚到 | 丢弃，不覆盖新任务 |
| 终态后刷新队列 | 只刷新一次，结果摘要保留 |
| 应用完全退出 | 下次不伪造运行中，提示核对未完成任务 |

### 7.2 登录门禁

| 场景 | 预期 |
| --- | --- |
| 首次冷启动 | 只显示登录页，不读取工作区 |
| `auth.jiayubing.xyz` 不可达 | 显示认证服务不可达和重试，不进入业务界面 |
| 正确账号密码 | 获取会话后进入原工作区选择/业务页面 |
| 错误密码 | 固定错误，不泄露服务端详情 |
| 禁用账号 | 拒绝进入业务界面，清理本地会话 |
| refresh token 过期 | 返回登录页，不能调用业务 IPC |
| 服务端撤销会话 | 下一次校验锁定业务操作 |
| 服务器暂时不可达 | 显示验证失败和重试，不伪造已登录 |
| 已登录后调用业务 IPC | 成功执行原有操作 |
| 未登录直接调用业务 IPC | 所有业务通道返回 `AUTH_REQUIRED` |
| 退出登录 | 撤销 token，工作区数据保留，重新登录后可继续使用 |
| 认证期间已有发布任务 | 不强杀远端调用，任务完成后进入安全终态 |

### 7.3 J4125 部署

| 检查 | 预期 |
| --- | --- |
| Docker 容器 | 认证服务独立、可重启、数据卷独立 |
| Tunnel | 只暴露 `auth.jiayubing.xyz` HTTPS 认证域名，无新增公网端口 |
| TLS | 证书由 Cloudflare/Tunnel 终止，客户端拒绝明文 HTTP |
| 日志 | 不含密码、token、文章、Cookie、完整请求体 |
| 备份 | 可恢复账号/会话数据，不包含本地内容库 |
| 服务异常 | 客户端显示安全错误，业务 IPC 不绕过认证 |

---

## 8. 验证命令

```powershell
node --test `
  tests/platform-task-progress.test.js `
  tests/renderer-platform-task-store.test.js `
  tests/renderer-platform-cross-page-progress.test.js `
  tests/desktop-task-service.test.js `
  tests/platform-ipc-boundary.test.js `
  tests/auth-service.test.js `
  tests/auth-ipc-boundary.test.js `
  tests/auth-gate.test.js `
  tests/auth-protected-ipc.test.js `
  tests/j4125-auth-contract.test.js
```

```powershell
npm test
npm run build:renderer
npm run verify
npm run pack:alpha
```

服务器授权部署后，再执行受控的外部验收：

```powershell
# 仅示意，域名、账号和密码不得写入脚本或仓库
Invoke-WebRequest https://<auth-domain>/healthz
```

最终专项信号：

```text
GREEN platform-progress: 7/20 restored after page switch
GREEN platform-controls: pause/stop use the active runId
GREEN platform-terminal-summary: retained after remount
GREEN auth-gate: unauthenticated app mounts no business UI
GREEN auth-ipc: unauthenticated business calls return AUTH_REQUIRED
GREEN j4125-auth: HTTPS contract and secret-free errors
GREEN package: no tokens, passwords, keys, or server data
```

---

## 9. 建议提交顺序

1. `test: reproduce lost platform progress and missing auth boundary`
2. `feat: persist platform task progress snapshots across renderer views`
3. `fix: restore platform progress and controls after page remount`
4. `test: add J4125 authentication API contract with mock server`
5. `feat: add Electron authentication gate and protected IPC`
6. `chore: prepare isolated J4125 auth container and tunnel contract`
7. `docs: document login gate, task progress, and server data boundaries`
8. `chore: package and verify authenticated platform workbench`

---

## 10. 最终验收标准

- [ ] 其他平台投稿显示总任务、已处理、成功、失败、跳过、待确认、当前任务和阶段。
- [ ] 切换页面不停止投稿任务，回到投稿页后显示同一个 runId 的最新快照。
- [ ] 暂停/停止和倒计时在切页回来后仍然准确可用。
- [ ] 任务结束后的结果摘要和队列刷新状态不因页面卸载丢失。
- [ ] 任务快照不替代 publication ledger，不返回正文、Cookie、绝对路径或完整响应。
- [ ] 软件首次启动只显示登录页；未登录不挂载 WorkspaceBootstrap、App 或业务功能。
- [ ] 未认证业务 IPC 无法被 Renderer、Preload 或开发者工具绕过。
- [ ] J4125 认证服务只保存唯一管理员账号、会话和授权信息，不保存文章、队列、账本或平台 Cookie。
- [ ] J4125 认证服务通过 HTTPS Tunnel 访问，不暴露新的公网端口。
- [ ] refresh token 轮换、撤销、过期和错误脱敏全部有测试。
- [ ] 认证失效不强杀正在进行的远端调用，避免制造 uncertain 之外的错误重试。
- [ ] 打包验收不含密码、token、私钥、数据库、Cookie 或客户数据。
- [ ] 专项测试、全量测试、Renderer build、verify 和 alpha 打包全部通过。

---

## 11. 非目标与数据保护

- 不把 J4125 做成文章、队列或发布账本的中心存储。
- 不上传客户资料、文章正文、Prompt、AI Key、平台 Cookie 或远端完整响应。
- 不在 Renderer 中保存 refresh token 或明文密码。
- 不只依赖前端隐藏按钮实现登录保护。
- 不允许客户端把认证服务器地址替换成任意地址。
- 不在认证服务器上运行平台发布 Worker。
- 不在未得到用户明确部署授权前修改 J4125 Docker、Tunnel、DNS 或防火墙。
- 不因为页面切换而取消、重启或重复提交平台任务。
- 不把心跳或 UI 进度当作远端发布成功证据。
- 不在应用退出后伪造任务继续运行；恢复必须基于队列和账本事实。

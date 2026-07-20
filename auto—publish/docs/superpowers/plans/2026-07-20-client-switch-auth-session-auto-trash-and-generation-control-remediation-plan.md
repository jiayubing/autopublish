# AutoPublish 客户切换、登录会话、发布后回收与生成控制修复计划

**日期：** 2026-07-20  
**范围：** `F:\官媒投稿\auto—publish` 及其 `release-alpha\win-unpacked` 打包验证  
**目标：** 修复入队后客户切换失效、正常登录被异常退出、发布成功后自动回收失败，以及批量生成运行态误报和控制按钮不可用。修复必须保持认证、本地文章、投稿执行、发布账本和回收事务之间的低耦合，不调用真实 AI 或真实投稿接口。

---

## 一、诊断结论

| 问题 | 已定位原因 | 证据 | 优先级 |
| --- | --- | --- | --- |
| 入队后不能切换客户 | 成功交接后 `GenerationSubmissionHandoffDrawer` 仍保持全屏模态；普通文章入队流程也缺少“入队后切换客户”的行为测试和旧请求隔离。撤销队列不会改变抽屉或 Renderer 会话状态，所以不能恢复；离开模块或重启会卸载状态。 | `GenerationBatchDetail.tsx` 只在人工 `onClose` 时关闭；`onCommitted` 仅刷新文章。`GeneratedArticlesView.tsx` 的异步刷新也没有 client request id。 | P0 |
| 登录一段时间后掉出 | access token 到期时，多个受保护 IPC 可以同时调用 `refresh()`，同一个轮换 refresh token 被消费两次。服务端按安全设计把第二次识别为 `AUTH_TOKEN_REUSE_DETECTED` 并撤销整个 token family。客户端还会在临时断网、限流或 5xx 时直接删除本地 refresh token。 | 打包软件已显示“检测到异常会话，请重新登录”；并发诊断得到 refresh 调用 `2` 次，预期 `1` 次。服务端测试明确规定旧 token 重放会撤销 family。 | P0 |
| 发布成功后自动移入回收站总失败 | Worker 成功后先把正文和 `.submission.json` 从待投稿目录归档到 `published`，`applyPostPublishDisposition()` 随后才从原队列路径读取文章身份，因此 selection 为空并返回 `auto_trash_blocked`。 | 归档夹具稳定得到 `auto_trash_blocked`，预期 `auto_trash_requested`；现有测试未模拟 Worker 归档，属于假绿。 | P0 |
| 生成中仍提示“继续未完成”，暂停等按钮不可用 | 运行器虽然内部状态为 `running`，事件却发送持久批次的 `batch.status=pending`；Renderer 因而判断为非 active。与此同时 `startGenerationBatch()` 要等整个批次结束才返回，Renderer 的 `loading=true` 会贯穿 50 篇生成全过程，所有控制按钮均被 `busy` 禁用。 | 运行器诊断首个事件为 `pending`，预期 `running`；`GenerationBatchDetail` 以 `busy || !active` 禁用暂停/停止。 | P0 |

### 已建立的红色诊断信号

以下行为已通过临时、已删除的诊断测试稳定复现，实施时应迁移为正式回归测试：

```powershell
node --test tmp/diagnose-2026-07-20-regressions.test.js
```

结果为 3 项失败：

1. 并发认证刷新：实际 2 次，预期 1 次。
2. Worker 归档后的自动回收：实际 `auto_trash_blocked`，预期 `auto_trash_requested`。
3. 生成启动事件：实际 `pending`，预期 `running`。

临时文件已经删除，正式实施不得依赖临时诊断脚本。

---

## 二、设计约束

1. **认证只决定软件使用资格。** J4125 不保存客户、文章、模板、队列或发布记录。
2. **短暂网络错误不等于退出登录。** 只有账号禁用、授权到期、设备撤销、会话明确失效或真实 token 重放等终结错误才清除本地会话。
3. **不弱化 refresh token 轮换。** 修复客户端并发，不允许服务端忽略真正的重放攻击。
4. **文章身份在 Worker 执行前由主进程捕获。** 不信任 Renderer 或 Worker 回传的 clientId/articleId，也不把正文、绝对路径或敏感 sidecar 内容发送给 Worker。
5. **运行事实只有一个权威来源。** 持久批次状态用于恢复，主进程运行快照用于按钮和“正在运行”展示；Renderer 不自行拼装第三套状态机。
6. **投稿成功与本地回收是两个阶段。** 回收失败不得把远端发布改成失败，也不得删除发布账本。
7. **客户选择属于父级工作台会话。** 子模块入队、撤销、发布或刷新不得锁定或回写全局 `clientId`。
8. **测试替换假绿，不叠加源码字符串断言。** 新的接口行为测试建立后，删除覆盖同一行为的浅层字符串测试。

---

## 三、目标模块与接口

### 1. 认证会话模块

保留现有外部接口：

```text
login()
requireAuthenticated()
logout()
getState()
onStateChanged()
```

并发合并、提前续期、错误分类、退避重试和凭证轮换全部隐藏在 `auth-service` 实现内。调用方不需要知道 refresh token，也不自行重试。

### 2. 发布后处置模块

在主进程形成一次不可变的本地上下文：

```text
taskKey -> { clientId, articleId }
```

该上下文在 Worker 开始前生成，Worker 结束后只依据任务结果判断是否调用文章回收模块。平台适配器不直接操作文章库。

### 3. 生成运行协调模块

统一向 IPC 和 Renderer 暴露：

```ts
type GenerationRuntimeSnapshot = {
  batchId: string | null;
  status: 'idle' | 'starting' | 'running' | 'pausing' | 'paused' | 'stopping' | 'completed' | 'failed';
  counts: GenerationBatchCounts | null;
  updatedAt: string;
  error?: SafeError | null;
};
```

启动/继续/重试命令只等待“命令已接受”，不等待 50 篇全部生成完毕；完成结果通过快照订阅和批次查询获得。

---

## 四、实施任务

## Task 0：建立正式回归基线

**Modify:**

- `tests/auth-service.test.js`
- `tests/platform-ipc-boundary.test.js`
- `tests/generation-batch-runner.test.js`
- `tests/content-generation-batch-service.test.js`
- `tests/renderer-batch-generation.test.js`
- `tests/renderer-generation-submission-handoff.test.js`

**Create:**

- `tests/renderer-content-client-switch.test.js`

实施要求：

- [ ] 将三个临时诊断场景迁入对应正式测试文件，并先观察失败。
- [ ] 新增真实 Renderer 行为测试：两个客户、至少一篇文章、一次普通入队、一次批次交接；两种路径结束后都能切换客户。
- [ ] 测试撤销刚入队项目后仍能切换客户，证明客户交互不依赖队列最终状态。
- [ ] 不调用 `auth.jiayubing.xyz`、真实 AI、真实投稿接口。
- [ ] 删除或替换 `renderer-generation-submission-handoff.test.js` 中只匹配源码文本、却不能发现模态层残留的断言。

**Red verification:**

```powershell
node --test tests/auth-service.test.js tests/platform-ipc-boundary.test.js tests/generation-batch-runner.test.js tests/content-generation-batch-service.test.js tests/renderer-content-client-switch.test.js
```

预期：新增用例在修复前失败，且失败原因分别对应并发刷新、归档后身份丢失、错误运行态和客户切换阻断。

---

## Task 1：修复登录会话并发与临时网络错误

**Modify:**

- `desktop/services/auth-service.js`
- `desktop/ipc/register.js`
- `desktop/main.js`
- `media-workbench/src/auth-store.tsx`
- `media-workbench/src/components/AuthGate.tsx`
- `media-workbench/src/types.ts`
- `tests/auth-service.test.js`
- `tests/auth-protected-ipc.test.js`
- `tests/auth-gate.test.js`

实施要求：

- [ ] 在 `auth-service` 内增加唯一 `refreshPromise`；所有同时到达的 `refresh()` 和 `requireAuthenticated()` 共享同一次网络请求与同一个结果。
- [ ] 以 refresh token 快照或会话 generation 防止“旧请求后返回”清除已经由新请求更新的会话。
- [ ] 只有以下终结错误调用 `clearSession()`：`AUTH_ACCOUNT_DISABLED`、`AUTH_LICENSE_EXPIRED`、`AUTH_NOT_ENTITLED`、`AUTH_DEVICE_REVOKED`、`AUTH_SESSION_EXPIRED`、`AUTH_TOKEN_REUSE_DETECTED`。
- [ ] `AUTH_SERVICE_UNAVAILABLE`、`AUTH_SERVER_ERROR`、`AUTH_RATE_LIMITED` 和超时不得删除加密 refresh token，也不得切回密码登录页。
- [ ] 临时错误时保留账号展示，进入“授权连接恢复中”状态；受保护的新操作可以返回明确的暂不可用错误，但恢复网络后自动续期，无需重新输入密码。
- [ ] 在 access token 到期前 60 秒主动续期；失败按 5 秒、15 秒、30 秒、最长 60 秒退避。定时器使用 `unref()`，退出、注销和终结失效时清理。
- [ ] `desktop/ipc/register.js` 保留认证错误码，不再把所有失败压成 `AUTH_REQUIRED`。
- [ ] 不增加无限离线使用：access token 过期且服务端不可达时禁止新的受保护操作，但保持可恢复会话，不删除本地凭证。
- [ ] 多个 Renderer 初始化、窗口聚焦和业务 IPC 同时发生时，只能产生一次 refresh 请求。

**Verification:**

```powershell
node --test tests/auth-service.test.js tests/auth-protected-ipc.test.js tests/auth-ipc-boundary.test.js tests/auth-gate.test.js
npm --prefix auth-server test
```

验收：

- 20 个并发 `requireAuthenticated()` 只请求一次 `/v1/auth/refresh`。
- 单次临时断网后 refresh token 文件仍存在，恢复后无需密码重新登录。
- 真正复用旧 token 时仍显示异常会话并退出。
- 管理员禁用账号、撤销设备或授权到期仍能按既有安全规则退出。

---

## Task 2：在归档前捕获自动回收所需文章身份

**Modify:**

- `desktop/ipc/platform-ipc.js`
- `desktop/services/platform-workbench-service.js`
- `desktop/services/submission-workflow.js`（若任务键已在此集中生成，则复用，不重复实现）
- `media-workbench/src/components/PlatformWorkbench.tsx`
- `media-workbench/src/types.ts`
- `tests/platform-ipc-boundary.test.js`
- `tests/submission-workflow.test.js`
- `tests/renderer-published-trash-flow.test.js`

实施要求：

- [ ] `startPlatformSubmit()` 前从已验证的队列 sidecar 读取 `{ clientId, generatedArticleId/articleId }`，按稳定 task key 保存于主进程内存。
- [ ] 传给 Worker 的计划仍只含必要的来源/目标引用；不得加入正文、绝对路径、Cookie、clientId 或 articleId。
- [ ] Worker 返回后，`applyPostPublishDisposition()` 使用执行前快照，不再从已被移走的 input 路径重新读 sidecar。
- [ ] 同一文章有多个目标时，只有本次计划内所有目标均 `published` 且没有 `archiveError` 才可自动回收；部分成功必须保留本地文章并给出阻断原因。
- [ ] 调用正式 `previewArticleRemovalImpact()` 和 `trashArticles()`，继续保留发布账本、attempt、远端 URL 和标题快照。
- [ ] 修复缺少 `aiContentService` 分支引用未定义变量 `published` 的问题。
- [ ] 不再吞掉回收异常；对 Renderer 返回安全的 reasonCode 汇总，例如 `IDENTITY_MISSING`、`REMOVAL_BLOCKED`、`REMOVAL_NEEDS_REPAIR`，日志不得包含正文或 sidecar 内容。
- [ ] 自动回收成功或进入恢复事务后触发 `platformQueue`、`navigationSummary`、`articleAttention` 刷新；远端发布结果保持成功。

**Verification:**

```powershell
node --test tests/platform-ipc-boundary.test.js tests/submission-workflow.test.js tests/published-article-trash.test.js tests/renderer-published-trash-flow.test.js
```

必须覆盖：

- TXT、DOCX、MD 各一篇成功发布并先归档，再自动回收。
- 单篇多目标全部成功、部分失败、`uncertain`、归档失败。
- sidecar 原本缺少文章身份时只阻断回收，不篡改远端发布成功记录。
- 回收事务 `needs_repair` 时给出可追踪状态，不重复发布。

---

## Task 3：统一批量生成运行快照并释放控制按钮

**Modify:**

- `src/content/generation-batch-runner.js`
- `desktop/services/content-generation-batch-service.js`
- `desktop/ipc/content-generation-batch-ipc.js`
- `desktop/preload.js`
- `media-workbench/src/electron-api.ts`
- `media-workbench/src/types.ts`
- `media-workbench/src/components/content/BatchGenerationView.tsx`
- `media-workbench/src/components/content/GenerationBatchDetail.tsx`
- `tests/generation-batch-runner.test.js`
- `tests/content-generation-batch-service.test.js`
- `tests/content-generation-batch-ipc.test.js`
- `tests/renderer-batch-generation.test.js`

实施要求：

- [ ] `generation-batch-runner` 的 `setState(batch, status)` 必须把参数 `status` 发给订阅者，不能退回 `batch.status`。
- [ ] 事件 DTO 同时携带 live status 和持久 counts；所有事件均包含 `batchId`、`status`、`updatedAt`。
- [ ] 主进程协调模块拥有唯一 active run promise，拒绝第二个并发批次。
- [ ] 启动、继续和重试 IPC 在任务被接受并进入 `running` 后立即返回，不等待整个批次完成。
- [ ] 后台 run promise 的失败被捕获并转成安全终态事件，禁止未处理 Promise rejection。
- [ ] `BatchGenerationView` 将 `commandPending` 与 `batchRunning` 分离；前者只覆盖命令往返，不能覆盖 50 篇生成全过程。
- [ ] 生成运行时暂停和停止按钮可用；“继续未完成”仅在 live status 非 active 且确有 pending/failed/interrupted 时显示。
- [ ] 暂停命令定义为“停止领取新任务并安全中断/收尾当前任务”，继续只处理未完成项，不重复生成 succeeded。
- [ ] 去掉 `command()` 对所有动作都乐观写成 `running` 的逻辑，改为显示 `pausing`、`stopping` 等命令态或等待权威快照。
- [ ] 页面切换、客户切换和重新进入生成页后，仍从同一快照恢复进度与控制能力。

**Verification:**

```powershell
node --test tests/generation-batch-runner.test.js tests/content-generation-batch-service.test.js tests/content-generation-batch-ipc.test.js tests/renderer-batch-generation.test.js
```

必须覆盖一个带可控延迟的 50 任务夹具：

- 第一篇运行时不显示“继续未完成”。
- 暂停和停止按钮可点击，命令能作用于当前 batchId。
- 暂停后继续不重复成功项。
- Renderer 切页再回来仍显示相同进度。
- IPC 启动命令在任务完成前已经返回。

---

## Task 4：解除入队流程对客户切换的 UI 阻断

**Modify:**

- `media-workbench/src/components/ContentWorkbench.tsx`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/components/content/GenerationBatchDetail.tsx`
- `media-workbench/src/components/content/GenerationSubmissionHandoffDrawer.tsx`
- `tests/renderer-content-client-switch.test.js`
- `tests/renderer-generation-submission-handoff.test.js`

实施要求：

- [ ] 普通入队成功后只清空当前客户的文章选择并刷新队列/文章数据，不修改父级 `clientId`。
- [ ] 为文章、投稿批次和发布记录加载增加 client request id；旧客户的迟到响应不得覆盖新客户页面。
- [ ] `clientId` 改变时清理旧客户的 selected、feedback、详情抽屉和删除预检；投稿目标选择可以作为工作区级偏好保留。
- [ ] 批次交接全部成功时关闭全屏模态抽屉，并把“新增/跳过/阻断”摘要显示在 `GenerationBatchDetail` 的非模态状态区。
- [ ] 部分客户失败时可以保留抽屉用于重试，但关闭按钮、Escape 和返回客户列表始终可用；`busy` 只在单次请求期间禁用重复提交。
- [ ] 撤销入队只改变队列事实，不承担解锁 UI 的职责；无论队列处于 queued、cancelled、published 或 failed，客户选择器都能工作。
- [ ] 切换客户不应关闭正在主进程运行的投稿或生成任务；任务进度由各自 store 保持。

**Renderer verification:**

```powershell
node --test tests/renderer-content-client-switch.test.js tests/renderer-generation-submission-handoff.test.js tests/renderer-history-editor-flow.test.js
```

交互矩阵：

| 入口 | 操作 | 预期 |
| --- | --- | --- |
| 文章管理普通入队 | 客户 A 入队一篇后选客户 B | 下拉值变为 B，列表只显示 B，队列 A 保持 |
| 批次交接 | A/B 成功文章一次交接后切客户 C | 成功摘要非模态，客户 C 可立即选择 |
| 部分交接失败 | 关闭抽屉后切客户 | 能切换，失败组仍可稍后重试 |
| 撤销最近入队 | 撤销前后分别切客户 | 两次都能切换 |
| 主进程正在投稿 | 切换客户和页面 | 投稿继续，进度不丢 |

---

## Task 5：错误文案、运行文档与清理

**Modify:**

- `CONTEXT.md`
- `docs/test-suite-inventory.md`
- 相关运维/发布说明

实施要求：

- [ ] 在业务词汇中区分“认证有效”“授权服务暂不可达”“认证终结失效”。
- [ ] 说明自动回收失败不影响远端发布成功，用户可在文章管理中重试本地回收。
- [ ] 说明批次持久状态与实时运行快照的职责，不允许 Renderer 以任务数量猜测运行态。
- [ ] 更新测试清单，删除被新行为测试替代的源码字符串断言。
- [ ] 检查并删除所有临时诊断文件、调试日志和测试生成目录。

---

## 五、验证顺序

### 快速回归

```powershell
node --test tests/auth-service.test.js tests/auth-protected-ipc.test.js tests/platform-ipc-boundary.test.js tests/submission-workflow.test.js tests/generation-batch-runner.test.js tests/content-generation-batch-service.test.js tests/content-generation-batch-ipc.test.js
```

### Renderer 与类型

```powershell
npm --prefix media-workbench run lint
npm --prefix media-workbench run typecheck:strict
node --test tests/renderer-content-client-switch.test.js tests/renderer-batch-generation.test.js tests/renderer-generation-submission-handoff.test.js tests/renderer-published-trash-flow.test.js
```

### 全量与认证服务

```powershell
npm test
npm run test:auth
npm run lint
npm run verify
```

### 打包验证

```powershell
npm run pack:alpha:dirty
```

从 `release-alpha\win-unpacked\AutoPublish.exe` 验证：

1. 登录并持续运行超过一个 access token 周期，同时执行多个并发列表刷新，不再出现异常会话退出。
2. 临时断开认证网络再恢复，不要求重新输入密码；恢复前新操作明确提示授权连接不可用。
3. 客户 A 文章入队后立即切换 B、C；撤销、发布或不处理队列均不影响切换。
4. 勾选“发布成功后自动移入回收站”，使用 TXT、DOCX、MD 测试夹具确认文章进入回收站，远端记录和标题保留。
5. 启动 50 篇批量生成，运行中无“继续未完成”提示，暂停/停止可用，切页返回后状态一致。

真实账号只用于最终登录验证；不得在验收中调用真实 AI 或真实媒体投稿，平台发布使用本地 fake adapter/测试环境。

---

## 六、完成标准

- [ ] 入队、撤销、发布和客户选择相互独立，不再通过重启恢复 UI。
- [ ] 同一会话任何时刻最多一个 refresh 请求；临时网络错误不删除 refresh token。
- [ ] 服务端真正的 token 重放、账号禁用、设备撤销和授权到期仍按安全规则退出。
- [ ] 发布后自动回收在 Worker 已归档正文和 sidecar 后仍能定位文章。
- [ ] 自动回收失败不会把远端发布改成失败，且有可执行的中文原因。
- [ ] 批量生成 live status 与按钮一致；运行中不显示恢复提示，暂停/停止可操作。
- [ ] 50 篇生成期间页面切换和客户切换不终止任务、不丢进度。
- [ ] 新测试通过模块接口验证行为，不依赖源码字符串或真实外部服务。
- [ ] 全量测试、认证测试、Lint、Renderer 严格类型检查、verify 和 alpha 打包全部通过。


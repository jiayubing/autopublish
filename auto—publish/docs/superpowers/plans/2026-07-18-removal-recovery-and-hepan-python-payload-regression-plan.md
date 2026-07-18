# 删除事务恢复、残留清理与河畔 Python Payload 回归修复计划

**日期：** 2026-07-18

**发布包：** `F:\官媒投稿\auto—publish\release-alpha\win-unpacked\AutoPublish.exe`

**源代码：** `F:\官媒投稿\auto—publish`

**内容工作区：** `F:\1`

**基线提交：** `a9b1663 docs: document configuration patch and queue recovery workflows`

**实现状态：** 上一计划的实现仍在工作树中，尚未提交；当前发布包与这些工作文件一致。

**目标：** 修复已删除文章残留清理的静默失败、失败文章删除事务永久停在 `needs_repair`、蓝色河畔 Markdown payload 在真实 Python 中必然失败的三个回归，并安全处理现有 1 个残留和 3 个重复待恢复事务。

本计划只定义修复、数据恢复和验收工作。诊断阶段未确认真实清理、未改写文章/队列/账本/事务、未触发河畔 POST。所有自动化测试必须使用临时工作区、假远端和无敏感 payload。

> 实施前提：不得 reset/checkout 当前未提交实现。开始修复前先将上一计划实现提交或建立可追溯快照，再以独立提交实施本计划。

---

## 1. 结论摘要

| 问题 | 已确认根因 | 实际状态 | 优先级 |
| --- | --- | --- | --- |
| “检查并清理已删除文章残留”无效果 | 预检按账本当前 `failed` 判定可清理，执行却额外要求旧 batch/sidecar attempt 等于账本最新 attempt；异常被空 catch 吞掉。 | 预检 1 项；真实副本执行后 `cleanedCount=0`、仍残留 1 项。 | P0 |
| 页面像一直转圈 | 后端副本清理仅 10ms、重扫仅 11ms，不是真正长任务；Renderer 没有独立 repairing 状态、完整 catch/finally 和“0 项失败原因”反馈。 | 用户看到刷新/忙碌感，但没有成功、失败或可操作原因。 | P0 |
| 失败文章移入回收站一直“自动推进” | 同一个 attempt mismatch 让事务进入 `phase=needs_repair`；返回 DTO 却仍叫 `status=pending_recovery`，Renderer错误承诺会自动推进。 | 工作区已有 3 份重复事务，全部 `PUBLICATION_ATTEMPT_MISMATCH`，不会自行前进。 | P0 |
| 重复点击产生更多事务 | 删除模块没有按选择/动作 fingerprint 复用现有开放事务。 | 同一文章已留下 3 个结构相同的待修复事务。 | P0 |
| 河畔 Markdown 全部失败 | Python `read_payload()` 对 `Path.lstat()` 返回的 `os.stat_result` 调用了不存在的 `is_file()`。 | 6 个 `.md` 发布记录全部失败；2 个 DOCX 已成功。 | P0 |
| Markdown 测试误绿 | 测试的 fake runner 只读取 JSON，不执行 `hepan_publish.py` 的 `read_payload()`。 | 32 项专项测试全部通过，真实 Python 契约仍为红色。 | P0 |
| 同队列文件重试造成 attempt 漂移 | worker 为失败记录 reserve 新 attempt 后，没有把 batch item/sidecar 原子重绑到新 attempt。 | 旧队列 pair 指向早期 attempt，账本已有 3–4 次 attempts。 | P1 |

---

## 2. 已完成的复现与证据

### 2.1 发布包与工作文件一致

以下关键文件的打包版与当前工作文件 SHA-256 一致：

- `desktop/services/content-submission-service.js`
- `src/content/article-removal-service.js`
- `src/platforms/hepan/adapter.js`
- `src/platforms/hepan/article-source.js`
- `src/platforms/hepan/hepan_publish.py`
- Renderer `dist/index.html`

因此本计划针对用户实际启动的 2026-07-18 22:51:50 发布包。

### 2.2 打包版界面复现

真实打包版“其他平台投稿”显示：

```text
检查并清理已删除文章残留 (1/1)
```

点击后预检立即返回，并弹出：

```text
发现 1 项可安全清理的已删除源文章队列残留……确认清理？
```

诊断在此取消，没有确认真实删除。说明第一段“按钮 -> 预检 -> 确认框”正常，问题位于确认后的执行/反馈。

### 2.3 真实状态副本复现残留清理

将 `F:\1` 的 input、submission records 和 article trash 复制到临时目录，在副本中执行真实模块：

```json
{
  "before": { "cleanableCount": 1, "reportedCount": 0 },
  "result": { "cleanedCount": 0, "cleanableCount": 1, "reportedCount": 0 },
  "cleanupMs": 10,
  "scanMs": 11,
  "queueCount": 8
}
```

结论：它是快速返回的静默 no-op，不是持续运行。用户看到“转圈没有效果”是服务错误被吞掉和 Renderer 反馈不足共同造成。

### 2.4 真实删除事务状态

只读取事务安全字段，不读取正文：

```text
事务数：3
status：pending_recovery
phase：needs_repair
errorCode：PUBLICATION_ATTEMPT_MISMATCH
每个事务：1 篇文章、1 个 cleanup 动作
对应发布记录：failed、共 4 次 attempts
事务 action attempt 是否等于最新 attempt：否
```

`recoverPendingRemovals()` 对 `needs_repair` 没有状态迁移分支，因此重复调用只会原样返回；页面“队列和文章状态会继续自动推进”与事实不符。

### 2.5 残留项的身份漂移

真实已删除文章残留：

```text
batch item：queued
batch publicationStatus：queued
账本：failed
账本 attempts：3
batch/sidecar attempt 是否为最新：否
```

预检 `articleSubmissionItems()` 采用账本聚合状态 `failed`，所以把它列为 cleanable；执行 `applyArticleSubmissionItem()` 又强制比较最新 attempt 并抛出 `PUBLICATION_ATTEMPT_MISMATCH`。预检与执行使用了两套不兼容规则。

### 2.6 Markdown 的确定性 Python 错误

当前 Python：

```python
stat = payload_path.lstat()
if not stat.is_file() or payload_path.is_symlink():
    ...
```

`Path.lstat()` 返回 `os.stat_result`，没有 `is_file()` 方法。用当前 Node parser 为真实 6 个 Markdown 生成 payload，再只调用 Python `read_payload()`，六个都得到：

```text
AttributeError: 'os.stat_result' object has no attribute 'is_file'
```

该错误发生在 Cookie、图片上传和 HTTP POST 之前。DOCX 不进入 `read_payload()`，所以能正常发布。

### 2.7 真实发布结果分布

不输出标题和正文，仅按扩展名与安全错误码汇总：

```text
.md：6 个，全部 failed
  HEPAN_PUBLISH_FAILED：3
  REMOTE_REJECTED：3（较早尝试）

DOCX/已归档：2 个，published
```

当前 Python 将未分类异常统一映射为 `HEPAN_PUBLISH_FAILED`，没有向界面说明这是本地 payload runtime 错误。

### 2.8 红色反馈命令

使用真实状态副本和真实 Python，连续运行两轮：

```text
RUN 1 RED 残留清理应从1项变为0项：cleanedCount 0
RUN 1 RED pending_recovery事务应完成：仍有3项
RUN 1 RED 真实Python应读取Node生成的Markdown payload：AttributeError

RUN 2 RED：同上
SUMMARY 6/6 RED
```

单轮小于 1 秒，无真实远端调用，临时副本自动删除。它已满足快速、确定、无人值守和精确捕获用户症状的条件。

### 2.9 现有测试为什么没有拦截

以下 32 项新旧专项测试全部通过：

```powershell
node --test `
  tests/article-trash-submission-lifecycle.test.js `
  tests/hepan-article-source.test.js `
  tests/hepan-publish-contract.test.js `
  tests/hepan-publish-interval.test.js `
  tests/renderer-article-history.test.js `
  tests/platform-workbench-service.test.js `
  tests/content-submission-ipc.test.js `
  tests/platform-ipc-boundary.test.js
```

覆盖缺口：

- 删除测试只有“创建批次后直接删除”，attempt 从未漂移。
- stale batch 测试仍使用 batch attempt 等于账本唯一 attempt。
- 重试测试通过创建第二个批次获得新 attempt，没有覆盖“同一个队列 pair 在其他平台投稿页再次执行”。
- 事务恢复测试注入普通中断，没有固定 `needs_repair` 的可恢复/不可恢复语义。
- Renderer 测试做源码断言，没有驱动 residue cleanup 的 0 项/异常/busy 生命周期。
- 河畔 payload 测试用 fake runner 读取 JSON，没有启动真实 Python。

---

## 3. 根因链路

### 3.1 预检与执行不共享同一 interface

```text
previewArticleRemovalImpact / previewTrashedArticleQueueResidue
  -> record.status == failed + pair unchanged
  -> cleanable

cleanupArticleSubmissionItem
  -> 再增加 latestAttemptId == action.attemptId
  -> PUBLICATION_ATTEMPT_MISMATCH
```

调用方无法从预检结果知道执行必然失败。这是浅 interface：调用方看到了“可清理”，但真正的必要条件藏在另一个实现分支。

### 3.2 failed cleanup 错用了 queued cancellation 的约束

取消 `queued` 会改变账本状态，必须保证操作的是当前最新 attempt。

清理 `failed` 只删除未修改的本地运行副本并把旧 batch item 标为 `failed-cleaned`；它不改变账本 `failed` 状态，也不删除 attempts。只要：

- publicationId、文章、目标、batch/sidecar 身份一致；
- sidecar attempt 确实存在于该发布记录；
- pair hash 未修改；
- 账本当前没有 active/uncertain 状态且最终为 `failed`；

就不应因为 pair 指向较早的失败 attempt 而拒绝清理。

### 3.3 重试没有更新队列身份

同一队列文件失败后从“其他平台投稿”再次执行：

```text
sidecar supplied attempt = attempt-1 (failed)
-> ledger.reserve() 追加 attempt-2
-> worker 用 attempt-2 发布
-> sidecar/batch 仍为 attempt-1
```

worker 结果回写和以后清理都可能失配。现有“第二批重试”测试绕开了这条真实路径。

### 3.4 事务状态把自动恢复和人工修复混为一类

当前同时存在：

```text
status = pending_recovery
phase = needs_repair
```

Renderer 只看 status，告诉用户会自动推进；恢复器只处理 intent/queue-actions/articles/committed，不处理 needs_repair。重复点击又没有复用开放事务，于是无限制造相同 journal。

### 3.5 Python 契约测试停在 adapter seam 之前

Node adapter factory 可注入 fake runner，这对测试 payload 创建/清理有价值，但它不能证明真实 Python 能读取 payload。真正失败点位于 adapter 之后的 Python seam，当前没有任何测试跨过去。

---

## 4. 目标设计

### 4.1 投稿队列动作成为一个深模块

在 `content-submission-service` 内收敛为一个 interface：

```text
evaluateItemAction(identity, action)
  -> { allowed, action, reasonCode, resolvedState }

applyItemAction(evaluation)
  -> { status, batchId, publicationId, attemptId, idempotent }
```

预检、文章删除、旧残留清理和批次清理都调用同一个 evaluator。`allowed=true` 后，只要绑定状态未变化，apply 不得再引入另一套隐藏条件。

动作规则：

| 动作 | 账本要求 | attempt 要求 | 数据后果 |
| --- | --- | --- | --- |
| cancel queued | 当前状态 queued | 必须是最新 attempt | pair 删除，最新 attempt -> cancelled |
| cleanup failed | 当前状态 failed，且无 active/uncertain | sidecar attempt 必须存在且为该记录历史 attempt，不要求最新 | pair 删除，旧 batch item -> failed-cleaned；账本不变 |

所有 evaluator 结果使用稳定 reason code，不向 Renderer暴露路径或正文。

### 4.2 同一队列 pair 重试时原子重绑 attempt

当 `reservePublication()` 为现有失败记录创建新 attempt：

```text
reserve new attempt
-> submissionBatchStore.rebindAttempt(...)
-> 原子更新 batch item + sidecar attemptId
-> 再 markSubmitting / 调用远端
```

- 重绑前重新校验 publicationId、文章、目标、contentHash 和 pair。
- batch 与 sidecar 任一写入失败：取消新 queued reservation，绝不开始远端。
- worker outcome 只写回新 attempt。
- 旧 attempts 保持不变。
- 新增“同一 pair 失败后重试”集成测试，不再只测创建第二个批次。

### 4.3 残留清理返回逐项结果，不吞异常

新结果：

```text
cleanupTrashedArticleQueueResidue()
  -> cleanedCount
  -> failedCount
  -> remainingCount
  -> items[] { publicationId, targetPlatformId, status, reasonCode }
```

- 删除 `catch (_) {}`。
- 单项失败可以继续处理其他项，但必须记录安全 reason code。
- `cleanedCount=0 && failedCount>0` 是明确失败，不得显示成功。
- 执行后重新预检；返回的 remainingCount 必须与磁盘一致。
- IPC 对结果做路径/正文剥离，但不丢 reason code。

### 4.4 删除事务采用明确状态机

```text
pending_auto_recovery
  -> committed
  -> needs_repair

needs_repair
  -> revalidated -> pending_auto_recovery
  -> superseded
```

- `status` 表达用户可见状态，`phase` 只表达内部游标，不能互相矛盾。
- transient I/O/lock 错误进入 `pending_auto_recovery`，由有界退避调度器自动重试。
- identity/hash/active-state 冲突进入 `needs_repair`，不声称会自动推进。
- 修复 evaluator 后，历史 `PUBLICATION_ATTEMPT_MISMATCH + failed cleanup` 可重新验证为安全动作并恢复。
- main 创建 removal module 后执行一次恢复；运行期间新 pending transaction 通过调度器或 transaction status 查询继续推进。
- Renderer 按 transactionId 查询/订阅到 terminal 状态，不用一条静态提示代替状态机。

### 4.5 重复删除复用开放事务

删除预检/提交按以下 fingerprint 查找开放事务：

```text
sorted(clientId + articleId)
+ sorted(publicationId + target + action)
```

- 已存在 pending/needs_repair 时返回同一 transactionId，不新建 journal。
- 对现有 3 个重复事务选择最早一个为 canonical。
- 后两个在确认动作完全相同且没有额外进度时标为 superseded，再由 store 安全归档/删除。
- canonical 完成后，文章进入回收站、队列 pair 清理、所有重复 journal 消失。

### 4.6 Renderer 区分检查、清理和修复

PlatformWorkbench：

- 独立 `repairingResidue`，不复用队列 loading 或投稿 isSubmitting。
- 按钮显示“检查中…”/“清理中…”，try/catch/finally 必须复位。
- 0 项清理、部分失败和全失败显示就近 `role=alert`，包含安全原因。
- 只有 cleanedCount > 0 才显示“已清理 N 项”。
- 清理结束后重新加载队列和 residue preview；失败时仍允许重试。

GeneratedArticlesView：

- `pending_auto_recovery` 显示正在恢复和最近更新时间。
- `needs_repair` 显示“删除事务需要修复：原因”，提供重试/修复入口。
- `committed` 刷新历史、回收站、批次和发布摘要。
- 同一开放事务禁用重复提交按钮或直接打开现有状态。

### 4.7 修复真实 Python 文件校验

正确实现之一：

```python
import stat as stat_module

stat_result = payload_path.lstat()
if not stat_module.S_ISREG(stat_result.st_mode) or payload_path.is_symlink():
    raise PayloadError("HEPAN_PAYLOAD_NOT_FILE", ...)
```

也可先拒绝 symlink 后使用 `payload_path.is_file()`；必须测试普通文件、目录、symlink 和缺失文件。

### 4.8 提供真实 Python 的无网络验证 seam

为 `hepan_publish.py` 增加只验证本地 payload 的 CLI：

```text
--validate-payload <path>
-> { ok: true, titleLength, contentHtmlLength }
```

- 不需要 Cookie。
- 不上传图片、不访问网络。
- 不输出标题、HTML、路径或正文。
- Node 测试用真实 Python 3.10–3.13 执行此入口。
- 河畔“测试登录”在网络检查前先运行一个临时安全 fixture 的 payload self-test，确保打包脚本与配置 Python 兼容。
- Python 不可用时普通应用功能仍不受影响；Hepan 专项 CI/发布验收必须配置 Python，不能把此测试静默跳过后仍宣称河畔已验证。

### 4.9 错误码区分本地输入与远端失败

- payload 文件/JSON/HTML校验：现有 `HEPAN_PAYLOAD_*`。
- payload 实现异常：`HEPAN_PAYLOAD_RUNTIME_FAILED`。
- Cookie/login：`HEPAN_LOGIN_INVALID` / `LOGIN_REQUIRED`。
- HTTP/远端拒绝：`HEPAN_REMOTE_REQUEST_FAILED` / `REMOTE_REJECTED`。
- 未知远端结果才使用 `REMOTE_RESULT_UNKNOWN`。

不得把本地 `AttributeError` 标成远端拒绝，也不得在错误中回显正文、Cookie、完整响应或临时路径。

---

## 5. 分阶段实施任务

### Task 0：固化三个正式红色回归

**Create：**

- `tests/submission-attempt-rebind.test.js`
- `tests/article-removal-recovery-regression.test.js`
- `tests/hepan-python-payload-runtime.test.js`
- `tests/renderer-residue-cleanup-flow.test.js`

**Modify：**

- `tests/article-trash-submission-lifecycle.test.js`
- `tests/submission-batch-worker-integration.test.js`
- `tests/hepan-publish-contract.test.js`
- `scripts/verify.js`

实施：

- [ ] 构造 ledger 有 3 个 attempts、batch/sidecar 指向 attempt-1、当前账本 failed 的最小 fixture。
- [ ] 断言 preview cleanable 后 execute 必须清理，不能再出现预检/执行矛盾。
- [ ] 固定 `needs_repair/PUBLICATION_ATTEMPT_MISMATCH` journal 可重新验证并完成。
- [ ] 固定同一文章重复提交只产生一个开放事务。
- [ ] 用真实 Python 执行普通 payload、目录、symlink、缺失和非法 JSON。
- [ ] Renderer 驱动 cleanup 返回 0、reject、部分成功、成功，断言 busy 总能结束且反馈准确。
- [ ] 先记录全部红色输出，再进入实现。

### Task 1：统一队列动作 evaluator

**Modify：**

- `desktop/services/content-submission-service.js`
- `src/content/submission-batch-store.js`
- `tests/content-submission-batch.test.js`
- `tests/article-trash-submission-lifecycle.test.js`
- `tests/submission-batch-worker-integration.test.js`

实施：

- [ ] 提取 `evaluateItemAction()`，供 preview、trash、residue、batch cleanup 共用。
- [ ] queued cancellation 保留最新 attempt 强约束。
- [ ] failed cleanup 接受属于同一记录的历史 failed attempt，同时要求当前聚合状态 failed、pair 未修改。
- [ ] evaluator 结果绑定状态 fingerprint；apply 前重新验证 fingerprint。
- [ ] 移除执行路径隐藏的新条件和空 catch。
- [ ] 所有结果返回稳定 reason code 且不含本地路径。

### Task 2：修复同队列文件重试身份

**Modify：**

- `desktop/services/platform-workbench-service.js`
- `src/content/submission-batch-store.js`
- `src/content/submission-export-service.js`
- `tests/submission-attempt-rebind.test.js`
- `tests/submission-batch-worker-integration.test.js`

实施：

- [ ] reserve 新 attempt 后、远端开始前原子重绑 batch item 与 sidecar。
- [ ] sidecar 写使用随机临时文件和 rename，保留原文件直到成功。
- [ ] batch/sidecar 任一失败时取消新 reservation，禁止远端调用。
- [ ] worker outcome 通过新 attempt 写回。
- [ ] 覆盖连续失败、失败后成功、重绑写失败、进程中断和旧 outcome 晚到。

### Task 3：修复残留清理结果合同

**Modify：**

- `desktop/services/content-submission-service.js`
- `desktop/ipc/content-submission-ipc.js`
- `desktop/preload.js`
- `media-workbench/src/electron-api.ts`
- `media-workbench/src/types.ts`
- `tests/content-submission-ipc.test.js`
- `tests/article-removal-recovery-regression.test.js`

实施：

- [ ] 返回 cleaned/failed/remaining 和逐项 reason code。
- [ ] 处理其他项时保留单项失败，不吞异常。
- [ ] 执行后重新读取磁盘生成 remaining，不返回旧 preview。
- [ ] IPC 剥离路径但保留诊断字段。
- [ ] 对 0/1 清理失败返回稳定业务失败，而不是无效果的成功 DTO。

### Task 4：修复删除事务状态机与去重

**Modify：**

- `src/content/article-removal-service.js`
- `src/content/article-removal-transaction-store.js`
- `src/content/article-trash-service.js`
- `desktop/services/ai-content-service.js`
- `desktop/main.js`
- 对应 IPC/preload/electron-api/types
- `tests/article-removal-recovery-regression.test.js`
- `tests/article-trash-submission-lifecycle.test.js`

实施：

- [ ] 分离 `pending_auto_recovery/needs_repair/committed/superseded`。
- [ ] `needs_repair` 不再标为 pending 或承诺自动推进。
- [ ] evaluator 修复后重新验证可恢复的 failed cleanup 并重置 queue-action 游标。
- [ ] 按 selection/action fingerprint 复用开放事务。
- [ ] 启动时规范化/去重旧 journal，选择 canonical 并安全 supersede 重复项。
- [ ] transient 错误使用有界退避和最大次数；确定性冲突停止自动重试。
- [ ] 提供 get/list/retry/repair transaction interface，所有操作幂等。

### Task 5：修复 Python payload runtime

**Modify：**

- `src/platforms/hepan/hepan_publish.py`
- `src/platforms/hepan/adapter.js`
- `desktop/services/platform-settings/hepan-settings-adapter.js`
- `tests/hepan-python-payload-runtime.test.js`
- `tests/hepan-publish-contract.test.js`
- `tests/hepan-provider-settings.test.js`

实施：

- [ ] 使用正确的普通文件判定，继续拒绝目录和 symlink。
- [ ] 增加无网络 `--validate-payload`。
- [ ] 测试实际 Node 生成的 Markdown/TXT payload 能被真实 Python 读取。
- [ ] 测试 Python 3.10–3.13 语法/运行要求并在文档声明最低版本。
- [ ] 配置测试先执行 payload self-test，再执行依赖/login 检查。
- [ ] 将本地 payload runtime、远端失败和 uncertain 映射为不同稳定错误码。

### Task 6：修复两个 Renderer 操作生命周期

**Modify：**

- `media-workbench/src/components/PlatformWorkbench.tsx`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/electron-api.ts`
- `media-workbench/src/types.ts`
- `tests/renderer-residue-cleanup-flow.test.js`
- `tests/renderer-history-editor-flow.test.js`

实施：

- [ ] residue 使用独立 repairing state、try/catch/finally。
- [ ] cleanup 0 项/部分失败显示原因，不刷新成假成功。
- [ ] 事务按 ID 查询/订阅到 terminal 状态。
- [ ] needs_repair 显示可见错误和修复入口；pending 才显示自动恢复。
- [ ] 开放事务存在时复用并禁止重复创建。
- [ ] 页面卸载清理 poll/timer，失败后允许重试。

### Task 7：安全恢复当前工作区

**Create：**

- 可选一次性 dry-run 工具：`scripts/repair-article-removal-regressions.js`

实施：

- [ ] 先备份 `input/hepan`、submission records、article trash 和 removal transactions。
- [ ] dry-run 只报告 action fingerprint、状态、reason code 和计数，不输出正文/路径/标题。
- [ ] 预期识别 1 个 trashed residue 和 3 个重复 removal transactions。
- [ ] 在完整副本上运行：residue 可清理；canonical transaction 完成；重复 journal 被 supersede；文章进入回收站；账本 attempts 保留。
- [ ] 真实工作区的 3 个已确认删除事务可在修复版启动后前向完成。
- [ ] residue 清理仍需用户在界面再次确认，不在升级时静默删除。
- [ ] 修复后再次 dry-run 必须为 0 个可操作异常且可重复执行。

### Task 8：文档、验证和新包验收

**Modify：**

- `docs/content-generation-operations.md`
- `docs/platform-workbench-react-ui.md`
- `docs/clean-machine-installation.md`
- `docs/alpha-packaging-checklist.md`
- `scripts/verify.js`

实施：

- [ ] 记录 pending 与 needs_repair 的区别和用户动作。
- [ ] 记录残留清理逐项结果与独立修复流程。
- [ ] 记录 Hepan Python 最低版本和无网络 payload self-test。
- [ ] 将真实 Python payload 测试加入 Hepan 发布验收 gate。
- [ ] 从 clean commit 构建新发布包，并验证源码/打包文件哈希一致。

---

## 6. 建议提交顺序

1. `test: reproduce stale attempt cleanup and Python payload failures`
2. `fix: unify submission item preview and apply rules`
3. `fix: rebind queue pairs when reserving retry attempts`
4. `fix: report residue cleanup failures without swallowing errors`
5. `fix: recover and deduplicate article removal transactions`
6. `fix: validate Hepan payload files with the real Python runtime`
7. `fix: surface residue and transaction terminal states in the renderer`
8. `docs: document removal repair and Hepan payload diagnostics`

上一计划实现先独立提交或快照。本计划提交不得混入无关格式化或真实工作区数据。

---

## 7. 自动化验证命令

### 7.1 专项测试

```powershell
node --test `
  tests/submission-attempt-rebind.test.js `
  tests/article-removal-recovery-regression.test.js `
  tests/hepan-python-payload-runtime.test.js `
  tests/renderer-residue-cleanup-flow.test.js `
  tests/article-trash-submission-lifecycle.test.js `
  tests/submission-batch-worker-integration.test.js `
  tests/hepan-article-source.test.js `
  tests/hepan-publish-contract.test.js `
  tests/hepan-publish-interval.test.js `
  tests/content-submission-ipc.test.js `
  tests/platform-workbench-service.test.js `
  tests/renderer-history-editor-flow.test.js
```

### 7.2 全量与构建

```powershell
npm run build:renderer
npm test
npm run verify
```

### 7.3 数据副本 dry-run

```powershell
node scripts/repair-article-removal-regressions.js --workspace <测试副本> --dry-run
```

### 7.4 打包

```powershell
npm run pack:alpha
```

自动化不得使用真实 Cookie、真实正文输出或真实河畔 POST。

---

## 8. 打包版手工验收矩阵

| 场景 | 操作 | 期望结果 |
| --- | --- | --- |
| 残留预检 | 打开其他平台投稿 | 显示 1 个可清理项，不阻塞页面 |
| 残留清理成功 | 确认清理测试副本残留 | 按钮进入“清理中”；完成后 cleaned=1、remaining=0，队列行消失 |
| 残留清理失败 | 注入 attempt active/hash conflict | busy 必须结束；显示稳定原因，不显示假成功 |
| 清理取消 | 在确认框选择取消 | 不清理、不报错、不留下 busy |
| 失败文章移入回收站 | 选择旧 attempt pair、账本最新 failed 的文章 | failed pair 清理、文章进回收站、账本及全部 attempts 保留 |
| 事务状态 | 注入 transient I/O 错误 | 显示 pending 自动重试，恢复后转 committed |
| 事务需修复 | 注入真实冲突 | 显示 needs_repair 和原因，不声称自动推进 |
| 重复点击 | 同一文章连续点击移入回收站 | 返回同一 transactionId，不新增 journal |
| 旧重复事务 | 加载 3 个同 fingerprint journal | 选出 canonical，其他 superseded，最终无重复开放事务 |
| 同 pair 重试 | 同一队列 Markdown 失败后再次投稿 | batch/sidecar 更新到新 attempt，结果正常回写 |
| 重绑失败 | 注入 sidecar rename 失败 | 新 attempt 取消，不发生远端调用，旧 pair 保持完整 |
| Python payload self-test | 配置中心测试河畔 | 本地 payload 验证通过后再测试登录，不发布文章 |
| Markdown 发布 | 用测试账号/栏目发布一篇 `.md` | Python payload 通过，远端收到非空标题和正文，结果为 published |
| Markdown 非文件 | payload 为目录/symlink | 本地稳定拒绝，不访问远端，不泄露路径 |
| DOCX 回归 | 发布既有测试 DOCX | 继续成功，不进入 payload 路径 |
| 错误区分 | 制造 payload invalid 与远端拒绝 | 两者显示不同安全错误码和建议 |

---

## 9. 完成标准

- [ ] 原始副本反馈由 `6/6 RED` 转为 `6/6 GREEN`。
- [ ] 预检报告 cleanable 的项目在绑定状态未变化时一定可执行。
- [ ] failed cleanup 支持历史 failed attempt，且不改变/删除发布账本 attempts。
- [ ] 同一队列 pair 重试后 batch、sidecar、账本 latest attempt 一致。
- [ ] 残留清理不吞异常，0 项和失败原因在界面可见，busy 必定结束。
- [ ] pending 与 needs_repair 状态准确，用户不再等待一个永远不会推进的事务。
- [ ] 同一删除意图只有一个开放 transaction。
- [ ] 当前 3 个重复事务能在副本中安全合并/完成，真实恢复有备份和 dry-run。
- [ ] 真实 Python 能读取 Node 生成的 Markdown/TXT payload，目录和 symlink 被拒绝。
- [ ] Markdown 测试跨过真实 Python seam，不再只依赖 fake runner。
- [ ] 6 个现有 Markdown 失败的根因可解释；修复版测试 Markdown 能成功发布。
- [ ] DOCX、发布间隔、防重、停止和其他平台没有回归。
- [ ] 专项、全量、Renderer build、verify 和打包验收全部通过。

---

## 10. 非目标与数据保护

- 不在诊断或自动化阶段确认真实残留删除、恢复真实事务或发起真实河畔 POST。
- 不因为 attempt mismatch 删除发布账本、压缩 attempts 或伪造最新 attempt。
- 不对 queued/submitting/submitted/uncertain 放宽 failed cleanup 规则。
- 不让 needs_repair 无限自动重试或制造更多重复 journal。
- 不手工删除 `F:\1` 的 transaction JSON、sidecar 或 batch JSON。
- 不回显标题、正文、Cookie、临时 payload 路径或远端完整响应。
- 不把 Python 本地 runtime 错误误报为远端拒绝或 uncertain。
- 不改变上一计划已确认的回收站、不可变标题快照和发布记录保留语义。
- 不将此回归修复扩大为河畔远端 POST 协议重写。

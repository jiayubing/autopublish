# 已发布文章回收、删除阻断与文章管理筛选简化计划

**日期：** 2026-07-19

**发布包：** `F:\官媒投稿\auto—publish\release-alpha\win-unpacked\AutoPublish.exe`

**源代码：** `F:\官媒投稿\auto—publish`

**内容工作区：** `F:\1`

**基线提交：** `590a891 chore: package and verify attention remediation`

**前置计划：** `docs/superpowers/plans/2026-07-19-platform-queue-refresh-loop-and-attention-action-remediation-plan.md`

**实现状态：** 前置计划已经执行并打包，但当前工作树仍包含未提交实现。实施本计划前先建立提交或可追溯快照，禁止 reset/checkout 覆盖现有改动。

**目标：** 允许已发布文章在保留远端发布记录的前提下安全移入回收站；删除预检不再把终结的 published 目标错误报告为 `SUBMISSION_QUEUE_STATUS_CONFLICT`；文章管理只保留六种互斥筛选；回收站只保留一个入口；为发布成功后自动回收提供明确、可确认的策略。

本计划只定义修复、领域规则、测试和数据副本验收，不直接修改真实文章、队列、发布账本或回收站数据。

---

## 1. 结论摘要

| 问题 | 已确认根因 | 真实证据 | 优先级 |
| --- | --- | --- | --- |
| 4 篇已发布文章无法移入回收站 | 删除预检对 `publicationStatus=published && batchId` 无条件加入 `SUBMISSION_QUEUE_STATUS_CONFLICT`。 | 副本预检：4 篇文章、10 个发布目标、10 个阻止项，全部同一错误码。 | P0 |
| 已发布本地副本无法清理 | 当前模型只允许 queued cancel 和 failed cleanup，没有“published terminal local cleanup”；`deriveArticleWorkflow` 对 completed 设置 `canTrash=false`。 | `article-workflow.ts` 中 completed 的 `canTrash` 明确为 false。 | P0 |
| 筛选选项重复过多 | 同时存在文章 statusFilter、publicationFilter 和 workflow stage tabs，三套语义重叠。 | 当前 7 个阶段标签、4 个文章状态选项、9 个发布状态选项同时存在。 | P1 |
| 回收站入口重复 | workflow 有 `trash` 阶段标签，同时页面还有“打开回收站”按钮和独立渲染分支。 | 静态检查 `duplicateTrashEntrances=true`。 | P1 |
| 发布成功后是否自动回收没有明确策略 | 领域层不区分“远端已发布”和“本地文章源是否保留”；用户只能先手动删除，且被错误阻断。 | 4 篇已发布文章全部无法提交删除预检。 | P1 |

---

## 2. 已完成的复现与证据

### 2.1 真实副本删除预检

复制 `F:\1` 到临时工作区，只读取文章、批次和发布账本，使用真实 `ArticleRemovalService` 运行 `previewArticleRemovalImpact()`，未执行确认提交：

```json
{
  "publishedArticles": 4,
  "totalBlocked": 10,
  "reasonCounts": {
    "SUBMISSION_QUEUE_STATUS_CONFLICT": 10
  },
  "queued": 0,
  "failedToClean": 0
}
```

每篇文章分别包含 3、3、3、1 个 published 发布目标。阻断不是因为 queued、submitting 或 uncertain，而是 published 被错误当成不能删除的队列冲突。

### 2.2 筛选模型复现

当前 Renderer 统计：

```json
{
  "stageLabels": 7,
  "statusOptions": 4,
  "hasStatusFilter": true,
  "hasPublicationFilter": true,
  "duplicateFilterAxes": true,
  "duplicateTrashEntrances": true
}
```

用户希望保留的唯一六类为：

```text
待审核、待投稿、已入队、已发布、失败、回收站
```

### 2.3 现有相关测试为何没有拦截

当前以下测试全部通过：

```text
article-removal-recovery-regression：5/5
article-trash-submission-lifecycle：4/4
article-workflow：1/1
renderer-article-management-flow：1/1
```

覆盖缺口：

- 没有 published batch item 的删除预检 fixture。
- 没有验证 published ledger 保留、local pair 清理和文章进回收站的完整闭环。
- workflow 测试没有断言 completed 的可删除动作。
- 没有把六种筛选作为互斥集合测试。
- 没有断言回收站只有单一入口。
- 没有测试成功投稿后的一键/自动回收策略。

---

## 3. 领域决策

### 3.1 发布成功不等于本地文章必须永久保留

远端发布成功后，本地文章仍可能只是历史源文件。允许用户将其移入回收站，但必须保持：

- 远端已发布内容不被撤回；
- publication record、titleSnapshot、所有 attempts 保留；
- 回收站保留标题快照和必要引用；
- 恢复文章不会自动恢复旧投稿队列；
- 本地未归档队列副本按目标逐项清理。

### 3.2 终结状态与活动状态

终结状态：

```text
published / failed / cancelled
```

这些状态不会再产生新的远端结果，可以在删除文章时清理本地副本。`failed` 仍可由用户选择重新投稿，但不阻止删除。

活动或结果未确认状态：

```text
queued / submitting / submitted / uncertain
```

这些状态必须阻止回收，提示用户先取消、等待或核对远端结果。

### 3.3 已发布文章回收的默认策略

支持两种方式：

1. **手动一键回收（默认）**：投稿结果显示“已发布 4 篇，可移入回收站”，用户确认后统一执行删除预检和事务。
2. **明确勾选自动回收（可选）**：提交前或结果确认时勾选“全部目标发布成功后自动移入回收站”。默认关闭，设置按用户保存。

自动回收只在以下条件全部满足时执行：

- 本批次目标全部为 published；
- 没有 submitted、uncertain、submitting、queued；
- 本地归档没有失败；
- 删除预检通过且文章身份/标题快照未变化。

只要存在失败目标，文章进入“失败”筛选，不自动回收；用户仍可在明确提示下手动回收。只要存在 uncertain 或活动目标，禁止自动和手动回收，直到状态终结。

---

## 4. 目标设计

### 4.1 投稿动作 evaluator 增加 published/cancelled terminal cleanup

将当前动作扩展为：

| publication status | local action | ledger 后果 |
| --- | --- | --- |
| queued | cancel | latest attempt -> cancelled |
| failed | cleanup | ledger 保持 failed，batch -> failed-cleaned |
| published | cleanupPublishedLocal | ledger 保持 published，batch -> published-cleaned |
| cancelled | cleanupCancelledLocal | ledger 保持 cancelled，batch -> cancelled-cleaned |
| submitting/submitted/uncertain | block | 不删除、不改 ledger |

`cleanupPublishedLocal` 和 `cleanupCancelledLocal` 可以共用本地 pair 清理实现，但必须使用独立 reasonCode，不能伪装成 failed cleanup。

安全条件：

- batch/publication/attempt/target 身份一致；
- pair 为 intact、both_absent 或身份可验证的单缺失；
- publication 当前仍为终结状态；
- 不存在新 active attempt；
- evaluation fingerprint 未过期。

双缺失是幂等完成；完整 pair 删除主文件和 sidecar；单缺失只处理可验证的剩余副本。任何 content_changed、identity_conflict、unsafe_path 仍进入需处理，不自动删除。

### 4.2 删除预检改为“可清理目标 + 活动阻断目标”

预检返回：

```text
queuedToCancel
failedToClean
publishedToClean
cancelledToClean
blockedItems
```

`publishedToClean` 不再进入 `blockedItems`。阻止项只允许：

- `ARTICLE_SUBMISSION_ACTIVE`；
- `PUBLICATION_RESULT_UNCERTAIN`；
- `PUBLICATION_ATTEMPT_MISMATCH`；
- `SUBMISSION_QUEUE_CHANGED`；
- `SUBMISSION_IDENTITY_CONFLICT`；
- `ARTICLE_TRASH_PREVIEW_STALE`。

UI 预检摘要应显示：

```text
将移入回收站：4 篇
已发布本地副本：10 项
失败本地副本：0 项
仍在投稿/待确认：0 项
发布记录：保留
```

### 4.3 文章流程改成六种互斥筛选

删除 `statusFilter` 和 `publicationFilter` 两个独立下拉框，只保留一组阶段标签：

```text
待审核 | 待投稿 | 已入队 | 已发布 | 失败 | 回收站
```

派生分类优先级：

1. 回收站：tombstone 存在；
2. 失败：存在 failed、uncertain 或部分发布但有失败/待确认目标；
3. 已入队：存在 queued/submitting/submitted 且没有更高优先级失败；
4. 已发布：至少一个 published，其他目标只有 published/cancelled；
5. 待审核：article status=generated；
6. 待投稿：article status=saved 且没有上述发布结果。

同一篇文章只能进入一个筛选。目标级细节仍在发布详情中显示，例如“已发布 2 / 失败 1”，但不会让文章同时出现在已发布和失败两个列表。

“失败”标签下可包含待确认项目，但行内必须显示真实目标状态“待确认”，不能把 uncertain 写入 ledger 为 failed。

### 4.4 回收站只保留一个入口

保留六阶段标签中的“回收站”，删除：

- “打开回收站”按钮；
- 独立的 showTrash 二级入口；
- 回收站与文章管理列表并行出现的重复导航。

点击“回收站”后切换到唯一的回收站数据源。回收站页面只显示：

- 标题快照；
- 删除时间；
- 发布记录摘要；
- 恢复；
- 永久删除正文。

回收站页面隐藏文章审核、投稿平台、批量入队、发布状态下拉框和普通文章筛选，避免“回收站里还出现文章管理按钮”。

### 4.5 已发布文章的操作入口

在“已发布”列表提供：

- 发布详情；
- 复制为新版本；
- 移入回收站。

确认对话框明确说明：

```text
远端已发布内容不会撤回；
发布记录和标题快照会保留；
本地文章正文和投稿队列副本会进入回收站/被清理；
恢复文章不会自动恢复投稿队列。
```

### 4.6 自动回收作为独立 disposition

新增发布批次结果 disposition：

```text
keep_local
offer_trash
auto_trash_requested
auto_trash_blocked
```

远端发布 worker 不直接移动文章。任务完成后由主进程通过既有 article removal interface 执行预检和事务，避免 worker 同时写 ledger、batch 和 article store。

自动回收失败时：

- 不把发布结果改为 failed；
- 远端 published 保持不变；
- 文章进入失败/需处理摘要，显示删除事务原因；
- 用户可稍后从文章管理继续回收。

---

## 5. 分阶段实施任务

### Task 0：建立四个正式红色回归

**Create：**

- `tests/published-article-trash.test.js`
- `tests/article-management-filter-model.test.js`
- `tests/renderer-article-management-filters.test.js`
- `tests/renderer-published-trash-flow.test.js`

**Modify：**

- `tests/article-trash-submission-lifecycle.test.js`
- `tests/article-removal-recovery-regression.test.js`
- `tests/article-workflow.test.js`
- `tests/renderer-article-management-flow.test.js`
- `scripts/verify.js`

实施：

- [ ] 用真实副本形状构造 4 篇 published 文章、10 个终结目标，预检必须在修复前 RED。
- [ ] 断言 published 不再进入 blockedItems，ledger 保持 published。
- [ ] 断言四篇文章全部移入 trash，10 个本地 pair 清理或幂等完成。
- [ ] 断言筛选只返回六个互斥状态。
- [ ] 断言回收站没有第二个“打开回收站”入口。
- [ ] 断言 published 行可以打开回收站预检和确认流程。
- [ ] 先记录所有 RED 输出，再进入实现。

### Task 1：实现终结发布目标的本地清理动作

**Modify：**

- `desktop/services/content-submission-service.js`
- `src/content/submission-batch-store.js`
- `desktop/ipc/content-submission-ipc.js`
- `desktop/preload.js`
- `media-workbench/src/electron-api.ts`
- `tests/published-article-trash.test.js`

实施：

- [ ] 扩展 evaluator 支持 published/cancelled terminal local cleanup。
- [ ] 新增 `published-cleaned`、`cancelled-cleaned` batch item 状态或等价明确 reasonCode。
- [ ] ledger 不写入 cancelled/failed，不删除 attempts。
- [ ] 双缺失、完整 pair、单缺失分别测试幂等和身份保护。
- [ ] active/uncertain 仍阻止。
- [ ] `SUBMISSION_QUEUE_STATUS_CONFLICT` 只保留给真实身份/状态冲突，不再用于正常 published cleanup。
- [ ] IPC 继续剥离绝对路径，只返回数量、reasonCode 和 terminal summary。

### Task 2：扩展 ArticleRemovalService 的预检和事务

**Modify：**

- `src/content/article-removal-service.js`
- `src/content/article-removal-transaction-store.js`
- `desktop/services/ai-content-service.js`
- `tests/article-trash-submission-lifecycle.test.js`
- `tests/article-removal-recovery-regression.test.js`

实施：

- [ ] preview 将 published/cancelled local cleanup 纳入可执行动作。
- [ ] 阻断摘要只报告活动/待确认/身份冲突。
- [ ] queue action 按动作类型推进 cursor，支持中断恢复。
- [ ] 文章 move 成功后 transaction committed，发布账本完整保留。
- [ ] 重复确认复用同一开放 transaction。
- [ ] terminal local cleanup 的结果不会被错误标记为远端失败。

### Task 3：收敛文章筛选模型为六类

**Modify：**

- `media-workbench/src/article-workflow.ts`
- `media-workbench/src/components/ContentWorkbench.tsx`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/publication-status.ts`
- `tests/article-management-filter-model.test.js`
- `tests/article-workflow.test.js`

实施：

- [ ] 将 workflow stage 改为 pending_review、pending_submission、queued、published、failed、trash。
- [ ] 删除 `statusFilter` 和 `publicationFilter` 两套独立状态轴。
- [ ] 删除“全部、投稿中、需处理、已完成”等重复标签。
- [ ] 用统一 `deriveArticleManagementStatus()` 派生唯一筛选。
- [ ] 规定失败/待确认/部分发布的优先级和行内目标摘要。
- [ ] `completed.canTrash` 改为由终结目标能力决定，而不是固定 false。
- [ ] 每篇文章只能命中一个筛选。
- [ ] 已发布文章显示“移入回收站”动作。

### Task 4：合并回收站入口和视图

**Modify：**

- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/components/ContentWorkbench.tsx`
- `media-workbench/src/components/content/ArticleStageTabs.tsx`
- `tests/renderer-article-management-filters.test.js`

实施：

- [ ] 保留阶段标签“回收站”作为唯一入口。
- [ ] 删除“打开回收站”按钮和重复 showTrash 导航。
- [ ] 回收站视图隐藏普通文章筛选和投稿工具栏。
- [ ] 返回按钮回到上一次非回收站阶段，不创建第二个状态轴。
- [ ] 恢复/永久删除动作保持二次确认和发布记录保留语义。

### Task 5：发布成功后一键/自动回收

**Modify：**

- `desktop/services/desktop-task-service.js`
- `desktop/services/platform-workbench-service.js`
- `desktop/ipc/platform-ipc.js`
- `media-workbench/src/components/PlatformWorkbench.tsx`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/types.ts`
- `tests/renderer-published-trash-flow.test.js`

实施：

- [ ] 发布结果显示“已发布 N 篇，可移入回收站”操作。
- [ ] 自动回收选项默认关闭，开启必须有明确确认。
- [ ] 只有全部目标 published 且本地归档无错误才自动执行。
- [ ] failed/uncertain/active 目标阻止自动回收并显示原因。
- [ ] 通过 ArticleRemovalService 执行，不让 worker 直接操作文章 store。
- [ ] 回收成功后刷新文章管理、回收站、队列和导航摘要。
- [ ] 回收失败保留 published 结果，生成可处理删除事务。

### Task 6：副本恢复、全量测试与打包

- [ ] 备份真实工作区的 generated、article-trash、submission-records、input 和 publication records。
- [ ] 副本预检识别 4 篇 published、10 个 terminal targets，无 active 阻断。
- [ ] 副本确认回收后：文章进入 trash、ledger published/attempts 保留、local pairs 清理。
- [ ] 再次预检为 0 可变更项，证明幂等。
- [ ] 打包版验收六个筛选标签只有一组，回收站只有一个入口。
- [ ] 不在真实工作区自动勾选或确认删除。

---

## 6. 测试矩阵

### 6.1 发布目标与删除

| 场景 | 预期 |
| --- | --- |
| published + intact pair | 可清理本地 pair，ledger 不变 |
| published + both_absent | 幂等完成，ledger 不变 |
| cancelled + intact pair | 可清理本地 pair，ledger 不变 |
| failed + intact pair | 现有 failed cleanup 保持可用 |
| queued | cancel，不删除 ledger 以外的远端事实 |
| submitting/submitted | 阻断 |
| uncertain | 阻断并要求核对 |
| published + content_changed | 进入需处理，不自动删修改内容 |
| published + identity_conflict | 进入需处理，不自动删 |
| 4 articles / 10 published targets | 0 个 `SUBMISSION_QUEUE_STATUS_CONFLICT`，10 个 terminal cleanup |

### 6.2 六类筛选

| 文章事实 | 唯一筛选 |
| --- | --- |
| generated | 待审核 |
| saved、无发布记录 | 待投稿 |
| queued/submitting/submitted | 已入队 |
| all targets published/cancelled，至少一个 published | 已发布 |
| failed/uncertain/partial failure | 失败 |
| tombstone | 回收站 |

同一文章只能出现一次；目标级状态在详情展示。

### 6.3 回收站入口

| 检查 | 预期 |
| --- | --- |
| 阶段标签 | 恰好六个 |
| 独立 status/publication selects | 不存在 |
| “打开回收站”按钮 | 不存在 |
| 点击回收站标签 | 进入唯一回收站视图 |
| 回收站工具栏 | 只有恢复/永久删除 |

### 6.4 自动回收

| 场景 | 预期 |
| --- | --- |
| 全部 published + 归档成功 + 勾选自动回收 | 执行删除事务，ledger 保留 |
| 全部 published + 未勾选 | 显示一键回收，不自动移动 |
| published + failed | 不自动回收，进入失败 |
| published + uncertain | 阻止回收，先核对 |
| 远端 published、local archive failed | 不重复投稿，显示本地处理 |

---

## 7. 验证命令

```powershell
node --test `
  tests/published-article-trash.test.js `
  tests/article-trash-submission-lifecycle.test.js `
  tests/article-removal-recovery-regression.test.js `
  tests/article-management-filter-model.test.js `
  tests/article-workflow.test.js `
  tests/renderer-article-management-filters.test.js `
  tests/renderer-published-trash-flow.test.js
```

```powershell
npm test
npm run build:renderer
npm run verify
npm run pack:alpha
```

本轮红色反馈必须转为：

```text
GREEN published-trash-preview: blocked=0, terminalCleanup=10
GREEN published-ledger-preserved
GREEN article-management-filters: exactly 6, mutually exclusive
GREEN recycle-bin-entry: exactly 1
GREEN published-auto-trash-policy
```

---

## 8. 提交顺序

1. `test: reproduce published trash conflict and duplicate management filters`
2. `fix: allow terminal published local cleanup while preserving ledger`
3. `fix: resume article removal transactions for published targets`
4. `refactor: collapse article management into six exclusive filters`
5. `fix: make recycle bin a single management stage`
6. `feat: offer confirmed post-publish trash disposition`
7. `docs: document terminal publication and local article recovery`
8. `chore: package and verify published article trash flow`

---

## 9. 最终验收标准

- [ ] 4 篇已发布文章的 10 个终结发布目标不再被 `SUBMISSION_QUEUE_STATUS_CONFLICT` 阻断。
- [ ] 移入回收站后远端发布内容不变，发布记录、标题快照和 attempts 全部保留。
- [ ] 本地文章正文进入回收站，队列副本和 sidecar 被清理或幂等确认不存在。
- [ ] queued、submitting、submitted、uncertain 仍按各自风险阻断。
- [ ] 文章管理只显示待审核、待投稿、已入队、已发布、失败、回收站六类。
- [ ] 同一篇文章只进入一个筛选，不因多目标状态重复出现。
- [ ] 回收站只有一个入口，没有独立按钮和重复状态轴。
- [ ] 已发布文章有明确“移入回收站”动作和影响说明。
- [ ] 自动回收默认关闭，开启需明确确认；失败/待确认不会被自动回收。
- [ ] 发布成功、本地归档失败和文章回收失败三种结果分别呈现。
- [ ] 专项、全量、Renderer build、verify 和打包验收全部通过。

---

## 10. 非目标与数据保护

- 不撤回远端已发布内容。
- 不删除或压缩 publication ledger、titleSnapshot 和 attempts。
- 不把 published 伪装成 failed 或 cancelled。
- 不对 uncertain、submitting、submitted 或 identity/content conflict 自动回收。
- 不默认开启无确认的自动回收。
- 不为了减少筛选项而丢失目标级发布状态；详情必须保留真实状态。
- 不让回收站恢复操作自动恢复旧投稿队列。
- 不直接编辑真实工作区 JSON、batch、sidecar 或 transaction 文件。
- 不在日志、IPC 或界面输出正文、Cookie、绝对路径或完整远端响应。

# Ticket 10 交接记录：精简普通平台投稿队列界面

## 结果

Ticket 10 已在 Dependency-Resolution Lane 内完成实施、Primary Audit、finding remediation 与 bounded re-audit。普通平台页面现在只消费主进程拥有的队列组 snapshot/action projection；文章追加和 pending 移除继续由文章管理 feature 负责，没有建立第二个生命周期 owner。

实现提交：`9124f0148eb4b91ba83ead95203135f12b60b99a`

基线 integration HEAD：`fab8b56ce4935bb462e488e2cac3b5a395db884a`

## 组件与依赖方向

```text
OperationalStore regular queue-group projection
  -> regularQueueGroupOrchestrator
  -> content submission typed IPC / preload / content bridge
  -> platform feature (query identity, command owners, labels)
  -> PlatformWorkbench (layout)
       -> RegularQueueGroupsPanel (group display and start/pause intent)

Article management projection
  -> content feature
  -> GeneratedArticlesView / AccountProfileSelector
       -> single regular target admission
       -> append articles / remove pending items
```

- 主进程 projection 唯一拥有 `canStart`、`canPause` 与稳定 `reasonCode`。
- platform feature 拥有请求身份、loading/error、并发 command 状态、账号/平台展示名与 stale-query invalidation。
- `PlatformWorkbench` 只布局 queue-group controls、升级前活动任务的 pause/stop 安全收口及本地 residue preview/confirm cleanup。
- `RegularQueueGroupsPanel` 只展示 current/remaining 顺序并发送 start/pause 用户意图。
- `AccountProfileSelector` 在单账号时自动选择且隐藏组内账号层；多账号时保持空选择，必须由用户明确指定。
- 普通平台页面没有付费媒体动作，也没有 uncertain 直接重试。

## Feature 接口

只读状态：`regularQueueGroups`、`regularQueueGroupViews`、`accountProfiles`、`loginByPlatformId`、`run`、`residue` 与 `commands`。

队列组命令：

- `refreshRegularQueueGroups`
- `startGroup` / `pauseGroup`
- `startAllGroups` / `pauseAllGroups`

保留的安全命令：

- `pause` / `stop`：只用于升级前已启动的旧运行实例，不可创建旧任务。
- `inspectResidue` / `cleanupResidue`：只处理本地已删除文章队列残留，保持 preview + explicit confirmation。
- `openLogin` / `checkLogin` / `confirmAccountProfile`：账号档案选择链。

## Legacy surface 收口

- 删除 Renderer/IPC 的 `platform.submitSelected`。
- 删除不再有生产消费者的 `content.previewSubmissionBatch` / `content.createSubmissionBatch` Renderer capability；底层 preparation owner 未被重构或恢复为 compatibility path。
- 删除不可达的 `PlatformQueuePanel`、`PlatformSubmitPanel`、`PlatformSubmissionOverlays` 和 `platform-workbench-model`。
- 普通平台 admission 只使用 `previewRegularQueueAdmission` / `admitRegularQueueItems`，一次恰好一个平台和一个明确账号档案。
- production capability inventory 从 124 基线经 `+5` queue-group、`-1` submitSelected、`-2` obsolete batch UI surface 收敛为 126；strict TypeChecker evidence 全部闭合。

## 显著规模变化

| 文件/范围 | 变化 |
| --- | --- |
| `PlatformWorkbench.tsx` | 349 行降为 46 行，只保留页面布局与安全维护区 |
| `RegularQueueGroupsPanel.tsx` | 新增 46 行，独立负责组列表展示与组动作 |
| 4 个旧多目标 Renderer 文件 | 删除，共 902 行 |
| implementation commit | 934 insertions / 2043 deletions |

## Primary Audit 与 remediation

Scope：typed bridge/feature command、owner action projection、单/多账号、loading/error/disabled、start/pause 并发、窄屏/键盘原生控件、residue 安全、paid/uncertain absence。

已关闭 findings：

- `P1 INTRODUCED_BY_CHANGE`：单组 pause response 只返回一组并覆盖完整列表；改为 pause 后读取完整 snapshot，并增加 IPC 行为测试。
- `P1 INTRODUCED_BY_CHANGE`：旧页面重写使 residue preview/cleanup 失去用户入口；新增隔离的 preview → explicit confirm → cleanup 维护区，未恢复投稿 legacy path。
- `P1 INTRODUCED_BY_CHANGE`：start command pending 时总 busy 禁止 pause；改为分命令禁用，并在 start 后刷新 owner actions。
- `P1 INTRODUCED_BY_CHANGE`：in-flight queue-group query 可在 command 后覆盖新状态；四个 command 与 query identity 建立 invalidation，并增加 stale query 回归测试。
- `P2 INTRODUCED_BY_CHANGE`：账号字段误读及空队列/平台内部 ID 展示；改为 feature-owned `displayName`、`platformLabel` 与 `REGULAR_QUEUE_GROUP_EMPTY` 文案。
- `PROCESS_EVIDENCE_GAP`：strict inventory 的新消费者 owner/binding 元数据不准确；修正为真实 TypeChecker symbol，不修改 helper 或放宽 gate。

Bounded re-audit 只复核上述 findings、修复 diff、直接并发/安全不变量和定向 gates；全部关闭，无 escalation，无 deferred finding。结论：`PASS`。

## 验证 evidence

环境：Windows / PowerShell，Node `v24.16.0`，npm `11.13.0`。

- `node --test tests/article-lifecycle-ticket-08.test.js tests/regular-platform-outcomes.test.js tests/architecture-seams.test.js tests/renderer-workbench-controller-seams.test.js tests/phase-08-platform-media-settings-workspace-renderer-slice.test.mjs tests/renderer-responsive-layout.test.js tests/renderer-article-history.test.js`：84/84 PASS。
- `node --test tests/phase-06-production-ipc-fixture-matrix.test.js`：35/35 PASS；126/126 production capabilities、23 lifecycle consumers、5 events 与负向 guards 全部闭合。
- typed IPC、capability-specific inventory、platform controller 与相关 Renderer regression 组合：61/61 PASS。
- `npm run lint`（Renderer TypeScript）：PASS。
- changed-file ESLint：PASS。
- `npm run build`：PASS；只有既有 >500 kB chunk warning。
- `git diff --check`：PASS。
- `node --test tests/phase-02-migration.test.js`：4 PASS / 4 FAIL；四个失败仍全部为 `PUBLICATION_SUCCESS_WRITER_CLOSED`，数量、根因和公开行为合同与 lane inherited blocker 一致，没有新增 failure。

Ticket 10 合同不要求在本项运行完整 `npm test`；最终完整 gate 仍按 lane 在 Ticket 23 清除 migration blocker、所有改动进入最终 clean integration HEAD 后执行。

## 下一动作

从 Ticket 10 closure HEAD 重新执行 Git preflight，按固定串行顺序进入 Ticket 16。Wave 6 保持 `BLOCKED`，Wave 7 只标记 `RUNNING`，不得提前标记 `COMPLETE`。

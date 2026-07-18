# Platform Workbench React UI

## Entry

React component: `media-workbench/src/components/PlatformWorkbench.tsx`

Sidebar navigation item: "其他平台投稿" (`ViewMode: 'platforms'`)

## Data Flow

```
PlatformWorkbench
  → electron-api.ts (getPlatformQueue, buildPlatformPlan, submitPlatformPlan)
    → desktopConsole.platforms.* (contextBridge)
      → desktop/ipc/platform-ipc.js
        → desktop/services/platform-workbench-service.js
```

## Platform Identity

| Technical ID | Display Name | Input Directory |
|-------------|-------------|-----------------|
| `lieju` | 猎局 | `input/lieju` |
| `toutiao` | 头条 | `input/toutiao` |
| `hepan` | 蓝色河畔 | `input/hepan` |

`hepan` is the technical ID for 蓝色河畔. There is NO separate `lanse` adapter — if "lanse" is mentioned, it refers to the existing `hepan` platform.

Display name mapping is defined in `media-workbench/src/electron-api.ts` via `PLATFORM_DISPLAY_NAMES`.

## User Flow

1. Click "其他平台投稿" in the sidebar
2. Page loads article queue from `input/lieju`, `input/toutiao`, `input/hepan`
3. Click "刷新队列" to re-scan input directories
4. Select source articles from the grouped list (left panel)
5. Select target platforms with checkboxes (right panel)
6. Review task count preview: "已选 X 篇 × Y 个平台 = Z 个任务"
7. Click "确认提交" to open confirmation modal
8. Review article and platform selections in the confirmation
9. Click "确认提交" to execute via `desktopConsole.platforms.submitSelectedPlan()`
10. View result summary: success / fail / skipped counts with per-task details

## API Surface

### `getPlatformQueue()`
Returns `{ platforms: PlatformTarget[], queue: PlatformArticle[] }`. Calls `desktopConsole.platforms.getQueue()`.

### `buildPlatformPlan({ articles, platformIds })`
Returns `PlatformSubmitPlan`. Calls `desktopConsole.platforms.buildSelectedPlan()`.

### `submitPlatformPlan(plan)`
Returns `PlatformSubmitResult`. Calls `desktopConsole.platforms.submitSelectedPlan()`.

## IPC Contract

- `platforms:get-queue` — scans non-media platform input directories
- `platforms:build-selected-plan` — builds article × platform task matrix
- `platforms:submit-selected-plan` — submits tasks serially, continues after failures

The workbench also receives target-level runtime state. For Hepan, the batch
startup snapshot contains `publishIntervalSeconds`; it is not re-read while a
batch is running. A batch with multiple Hepan tasks displays the configured
interval and minimum waiting time before confirmation. The first Hepan call is
immediate; subsequent calls show `waiting-interval` and a live remaining
countdown. Stop is honored during the wait and no next remote call is started.

Queue items with `sourceArticleState: trashed` are visibly marked “源文章已删除，禁止投稿”,
cannot be selected, and expose the independent repair flow. The repair flow
can preview and confirm safe cancellation/failed cleanup but does not
force-delete conflicts or infer uncertain remote results.

Residue inspection and cleanup use an independent `repairingResidue` state.
The UI always clears it in `finally`, reloads the queue after execution, and
shows zero-item, partial-failure, and full-failure results with stable reason
codes. Removal transactions are queried/subscribed by ID: only
`pending_auto_recovery` promises automatic retry; `needs_repair` shows the
reason and a repair action. An existing selection/action fingerprint is
reused and duplicate confirmation is disabled while it remains open.

## States

| State | Behavior |
|-------|----------|
| Loading | Spinner while fetching queue |
| Error | Error banner with retry option |
| Idle | Articles grouped by platform, collapsible |
| Selecting | Click articles/platforms to toggle selection |
| Confirming | Modal with article/platform summary |
| Submitting | "提交中..." disabled all buttons |
| Waiting interval | Shows the next Hepan article and remaining seconds; stop remains available |
| Result | Overlay with success/fail/skipped breakdown |
| Residue checking/cleaning | Independent check/cleanup feedback; failures remain retryable |
| Removal pending | Shows last update while bounded automatic recovery runs |
| Removal needs repair | Shows reason code and an explicit repair/retry action |


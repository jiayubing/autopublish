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

## States

| State | Behavior |
|-------|----------|
| Loading | Spinner while fetching queue |
| Error | Error banner with retry option |
| Idle | Articles grouped by platform, collapsible |
| Selecting | Click articles/platforms to toggle selection |
| Confirming | Modal with article/platform summary |
| Submitting | "提交中..." disabled all buttons |
| Result | Overlay with success/fail/skipped breakdown |


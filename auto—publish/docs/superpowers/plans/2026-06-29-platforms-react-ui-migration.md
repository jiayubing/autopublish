# Other Platforms React UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把非付费媒体投稿平台（lieju / toutiao / hepan 或用户确认后的 lanse）接入当前 `media-workbench/` React 新 UI，让所有投稿入口都在同一个桌面前台里完成。

**Architecture:** 继续复用现有 Electron preload、`platforms:*` IPC 和 `desktop/services/platform-workbench-service.js`，React 只负责平台队列展示、文章选择、目标平台选择、提交确认和结果反馈。不要重写平台发布适配器；如果 `lanse` 是 `hepan` 的新名称或别名，先在平台配置/文档中明确映射，再接 UI。

**Tech Stack:** Electron 33, React 19, TypeScript, Vite 6, Tailwind CSS v4, existing `desktopConsole.platforms`, `node:test`.

---

## Required Reading

Read these before changing code:

- `docs/media-workbench-repair-record.md`
- `docs/desktop-workbench.md`
- `config/platforms.json`
- `src/core/platforms.js`
- `desktop/preload.js`
- `desktop/ipc/platform-ipc.js`
- `desktop/services/platform-workbench-service.js`
- `desktop/renderer/platform-workbench.js`
- `desktop/renderer/platform-batch-drawer.js`
- `media-workbench/src/App.tsx`
- `media-workbench/src/electron-api.ts`
- `media-workbench/src/types.ts`
- `media-workbench/src/components/Sidebar.tsx`
- `tests/platform-workbench-service.test.js`
- `tests/desktop-workbench-flow.test.js`
- `tests/media-workbench-flow.test.js`

---

## Current State

- 付费媒体投稿已经在 React UI 中成功使用。
- 其他平台投稿的真实能力仍在旧链路中：`desktopConsole.platforms.getQueue()`、`buildSelectedPlan()`、`submitSelectedPlan()`。
- 当前启用平台来自 `config/platforms.json`，实际代码中是 `lieju`, `toutiao`, `hepan`, `media`。
- 用户提到的 `lanse` 当前没有独立 adapter 目录；代码里的“蓝色河畔”能力对应 `src/platforms/hepan/adapter.js`。
- 旧 renderer 的其他平台工作台只作为行为参考，不再作为生产 UI 扩展目标。

---

## Product Behavior Target

- 新 UI 里有一个清晰的“其他平台投稿”入口。
- 用户能看到来自 `input/lieju`, `input/toutiao`, `input/hepan` 或确认后的 `input/lanse` 的待发文章。
- 用户能选择一篇或多篇文章，再选择一个或多个目标平台。
- UI 能展示将要产生的任务数，例如 `3 篇文章 × 2 个平台 = 6 个任务`。
- 提交前必须有确认步骤，确认后走真实 `desktopConsole.platforms.submitSelectedPlan()`。
- 提交结果要展示成功、失败、待处理数量和逐项错误，不要静默失败。
- 操作逻辑不需要复刻旧 renderer，只要适配新 UI 且流程合理。

---

## Task 1: Clarify platform identity and contract

**Priority:** P0

**Files:**
- Modify: `docs/desktop-workbench.md`
- Modify: `config/platforms.json` only if `lanse` should become a real platform id
- Modify: `src/core/platforms.js` only if alias support is needed
- Test: `tests/platform-workbench-service.test.js`

- [ ] **Step 1: Confirm the platform ids used by code**

Run:

```powershell
Get-ChildItem src/platforms -Directory | Select-Object -ExpandProperty Name
Get-Content config/platforms.json -Raw
```

Expected: code currently exposes `hepan`, `lieju`, `media`, `toutiao`; config currently enables `lieju`, `toutiao`, `hepan`, `media`.

- [ ] **Step 2: Decide how to handle `lanse`**

Use this rule:

```text
If "lanse" means the existing 蓝色河畔 publisher, keep adapter id "hepan" and add displayName "蓝色河畔" in UI/docs.
If "lanse" must be a new technical id, create src/platforms/lanse/adapter.js or add a deliberate alias layer before changing config.
```

Recommended first implementation: keep `hepan` as the technical id and show it as `蓝色河畔` in React UI. This avoids breaking `loadPlatforms()`, which requires `adapter.id === config id`.

- [ ] **Step 3: Add a test for enabled non-media platforms**

Update `tests/platform-workbench-service.test.js` so it preserves the expected non-media scan behavior and documents `hepan` as the current technical id for 蓝色河畔.

Example assertion:

```js
assert.deepStrictEqual(
  queue.map(function(group) { return group.platformId; }),
  ["lieju", "toutiao", "hepan"]
);
```

- [ ] **Step 4: Run the service test**

Run:

```powershell
node --test tests/platform-workbench-service.test.js
```

Expected: PASS.

**Acceptance Criteria:**
- 新线程不会把 `lanse` 和 `hepan` 当成两个未定义平台混用。
- 文档说明技术 id 与中文显示名的关系。
- 平台服务测试仍通过。

---

## Task 2: Add typed platform APIs to the React boundary

**Priority:** P0

**Files:**
- Modify: `media-workbench/src/types.ts`
- Modify: `media-workbench/src/electron-api.ts`
- Test: `tests/media-workbench-flow.test.js`

- [ ] **Step 1: Add platform types**

Add these types to `media-workbench/src/types.ts`:

```ts
export interface PlatformTarget {
  id: string;
  scanDir: string;
  displayName?: string;
}

export interface PlatformArticle {
  filename: string;
  filePath: string;
  title: string;
  platformId: string;
  sourcePlatformId: string;
  sourceArticle?: unknown;
}

export interface PlatformQueueResult {
  platforms: PlatformTarget[];
  queue: PlatformArticle[];
}

export interface PlatformSubmitPlan {
  taskCount: number;
  tasks: unknown[];
}

export interface PlatformSubmitResult {
  ok: number;
  fail: number;
  pending: number;
  skipped?: number;
  results: Array<{
    task?: unknown;
    status: "success" | "failed" | "pending" | string;
    error?: string;
    result?: unknown;
  }>;
}
```

- [ ] **Step 2: Extend the `DesktopConsole` type**

In `media-workbench/src/electron-api.ts`, add:

```ts
interface DesktopConsolePlatforms {
  getQueue(): Promise<{ ok: boolean; data?: PlatformQueueResult; error?: string }>;
  buildSelectedPlan(input: {
    articles: PlatformArticle[];
    platformIds: string[];
  }): Promise<{ ok: boolean; data?: PlatformSubmitPlan; error?: string }>;
  submitSelectedPlan(plan: PlatformSubmitPlan): Promise<{ ok: boolean; data?: PlatformSubmitResult; error?: string }>;
}
```

and add `platforms: DesktopConsolePlatforms;` to `DesktopConsole`.

- [ ] **Step 3: Add normalization and fallback helpers**

Add helper functions that mirror the existing media API style:

```ts
function platformDisplayName(id: string): string {
  const names: Record<string, string> = {
    lieju: "猎局",
    toutiao: "头条号",
    hepan: "蓝色河畔",
    lanse: "蓝色河畔",
  };
  return names[id] || id;
}

function normalizePlatformTarget(raw: Record<string, unknown>): PlatformTarget {
  const id = String(raw.id || "");
  return {
    id,
    scanDir: String(raw.scanDir || id),
    displayName: platformDisplayName(id),
  };
}

function normalizePlatformArticle(raw: Record<string, unknown>): PlatformArticle {
  return {
    filename: String(raw.filename || ""),
    filePath: String(raw.filePath || ""),
    title: String(raw.title || raw.filename || ""),
    platformId: String(raw.platformId || ""),
    sourcePlatformId: String(raw.sourcePlatformId || raw.platformId || ""),
    sourceArticle: raw.sourceArticle,
  };
}
```

- [ ] **Step 4: Export platform API functions**

Add:

```ts
export async function getPlatformQueue(): Promise<PlatformQueueResult> {
  if (isElectron()) {
    const result = await window.desktopConsole!.platforms.getQueue();
    if (!result.ok) throw new Error(result.error || "getPlatformQueue failed");
    const data = result.data || { platforms: [], queue: [] };
    return {
      platforms: (data.platforms || []).map((item) =>
        normalizePlatformTarget(item as unknown as Record<string, unknown>)
      ),
      queue: (data.queue || []).map((item) =>
        normalizePlatformArticle(item as unknown as Record<string, unknown>)
      ),
    };
  }
  return { platforms: [], queue: [] };
}

export async function buildPlatformPlan(input: {
  articles: PlatformArticle[];
  platformIds: string[];
}): Promise<PlatformSubmitPlan> {
  if (isElectron()) {
    const result = await window.desktopConsole!.platforms.buildSelectedPlan(input);
    if (!result.ok) throw new Error(result.error || "buildPlatformPlan failed");
    return result.data || { taskCount: 0, tasks: [] };
  }
  return { taskCount: input.articles.length * input.platformIds.length, tasks: [] };
}

export async function submitPlatformPlan(
  plan: PlatformSubmitPlan
): Promise<PlatformSubmitResult> {
  if (isElectron()) {
    const result = await window.desktopConsole!.platforms.submitSelectedPlan(plan);
    if (!result.ok) throw new Error(result.error || "submitPlatformPlan failed");
    return result.data || { ok: 0, fail: 0, pending: 0, results: [] };
  }
  return { ok: 0, fail: 0, pending: 0, skipped: plan.taskCount, results: [] };
}
```

- [ ] **Step 5: Add contract coverage**

Update `tests/media-workbench-flow.test.js` to assert `electron-api.ts` exports `getPlatformQueue`, `buildPlatformPlan`, and `submitPlatformPlan`, and that `desktop/preload.js` exposes `platforms.getQueue`, `platforms.buildSelectedPlan`, and `platforms.submitSelectedPlan`.

- [ ] **Step 6: Verify**

Run:

```powershell
node --test tests/media-workbench-flow.test.js
cd media-workbench
npm run lint
```

Expected: PASS.

**Acceptance Criteria:**
- React 侧所有平台投稿调用都经过 `electron-api.ts`。
- Browser dev fallback 不会伪造成功提交。
- TypeScript 编译通过。

---

## Task 3: Build the React Other Platforms workspace

**Priority:** P0

**Files:**
- Create: `media-workbench/src/components/PlatformWorkbench.tsx`
- Modify: `media-workbench/src/App.tsx`
- Modify: `media-workbench/src/components/Sidebar.tsx`
- Modify: `media-workbench/src/types.ts`
- Test: `tests/media-workbench-flow.test.js`

- [ ] **Step 1: Add a new view mode**

Change `ViewMode` in `types.ts`:

```ts
export type ViewMode = 'workbench' | 'platforms' | 'resources' | 'orders' | 'settings';
```

- [ ] **Step 2: Add sidebar navigation**

In `Sidebar.tsx`, add a menu item:

```ts
{ id: 'platforms' as ViewMode, label: '其他平台投稿', icon: FolderOpen, badge: totalPlatformArticles }
```

Add `totalPlatformArticles: number;` to `SidebarProps`.

- [ ] **Step 3: Create `PlatformWorkbench.tsx`**

Create a focused component with these props:

```tsx
import React, { useMemo, useState } from "react";
import { PlatformArticle, PlatformSubmitResult, PlatformTarget } from "../types";

interface PlatformWorkbenchProps {
  articles: PlatformArticle[];
  platforms: PlatformTarget[];
  isLoading: boolean;
  isSubmitting: boolean;
  submitResult: PlatformSubmitResult | null;
  onRefresh: () => void;
  onSubmit: (articles: PlatformArticle[], platformIds: string[]) => void;
}
```

The UI should include:

```text
Header: 其他平台投稿 + 刷新队列
Left: article queue grouped or labeled by source platform
Right: target platform checklist
Bottom/top summary: selected article count, selected platform count, task count
Primary action: 预检并提交
Result panel: ok / fail / pending / skipped
```

- [ ] **Step 4: Implement local selection state**

Inside `PlatformWorkbench.tsx`, track selected articles and target platform ids:

```tsx
const [selectedArticleKeys, setSelectedArticleKeys] = useState<string[]>([]);
const [selectedPlatformIds, setSelectedPlatformIds] = useState<string[]>([]);

function articleKey(article: PlatformArticle): string {
  return `${article.sourcePlatformId}:${article.filename}`;
}

const selectedArticles = useMemo(
  () => articles.filter((article) => selectedArticleKeys.includes(articleKey(article))),
  [articles, selectedArticleKeys]
);

const taskCount = selectedArticles.length * selectedPlatformIds.length;
const canSubmit = taskCount > 0 && !isSubmitting;
```

- [ ] **Step 5: Wire the component in `App.tsx`**

Add state:

```ts
const [platformArticles, setPlatformArticles] = useState<PlatformArticle[]>([]);
const [platformTargets, setPlatformTargets] = useState<PlatformTarget[]>([]);
const [isLoadingPlatforms, setIsLoadingPlatforms] = useState(false);
const [isSubmittingPlatforms, setIsSubmittingPlatforms] = useState(false);
const [platformSubmitResult, setPlatformSubmitResult] = useState<PlatformSubmitResult | null>(null);
```

Add a loader:

```ts
const handleRefreshPlatformQueue = async () => {
  setIsLoadingPlatforms(true);
  try {
    const result = await getPlatformQueue();
    setPlatformArticles(result.queue);
    setPlatformTargets(result.platforms);
  } finally {
    setIsLoadingPlatforms(false);
  }
};
```

Call it during initial load or when the user opens the view.

- [ ] **Step 6: Render the new view**

Add a title:

```tsx
{currentView === 'platforms' && '其他平台投稿'}
```

Add the view body:

```tsx
{currentView === 'platforms' && (
  <PlatformWorkbench
    articles={platformArticles}
    platforms={platformTargets}
    isLoading={isLoadingPlatforms}
    isSubmitting={isSubmittingPlatforms}
    submitResult={platformSubmitResult}
    onRefresh={handleRefreshPlatformQueue}
    onSubmit={handleSubmitPlatformSelection}
  />
)}
```

- [ ] **Step 7: Add structural test coverage**

Update `tests/media-workbench-flow.test.js` to assert:

```js
assert.ok(read("media-workbench/src/components/PlatformWorkbench.tsx").includes("其他平台投稿"));
assert.ok(read("media-workbench/src/components/Sidebar.tsx").includes("platforms"));
assert.ok(read("media-workbench/src/App.tsx").includes("PlatformWorkbench"));
```

- [ ] **Step 8: Verify**

Run:

```powershell
node --test tests/media-workbench-flow.test.js
cd media-workbench
npm run lint
npm run build
```

Expected: PASS.

**Acceptance Criteria:**
- 侧边栏出现“其他平台投稿”入口。
- 新页面能展示平台文章队列和目标平台。
- 选择文章/平台后能看到任务数。
- 没有文章或没有目标平台时不能提交。

---

## Task 4: Add confirmation and real submission flow

**Priority:** P0

**Files:**
- Create: `media-workbench/src/components/PlatformSubmitModal.tsx`
- Modify: `media-workbench/src/components/PlatformWorkbench.tsx`
- Modify: `media-workbench/src/App.tsx`
- Test: `tests/media-workbench-flow.test.js`

- [ ] **Step 1: Create confirmation modal**

Create `PlatformSubmitModal.tsx` with props:

```tsx
import React from "react";
import { PlatformArticle, PlatformTarget } from "../types";

interface PlatformSubmitModalProps {
  isOpen: boolean;
  articles: PlatformArticle[];
  platformIds: string[];
  platforms: PlatformTarget[];
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}
```

The modal should show:

```text
文章数量
平台数量
任务数量
文章清单
目标平台清单
确认真实提交
取消
```

- [ ] **Step 2: Open modal before real submit**

In `PlatformWorkbench.tsx`, keep selected article/platform state local, and call `onSubmit` only after `PlatformSubmitModal` confirms.

- [ ] **Step 3: Implement submit handler in `App.tsx`**

Add:

```ts
const handleSubmitPlatformSelection = async (
  selectedArticles: PlatformArticle[],
  selectedPlatformIds: string[]
) => {
  setIsSubmittingPlatforms(true);
  setPlatformSubmitResult(null);
  try {
    const plan = await buildPlatformPlan({
      articles: selectedArticles,
      platformIds: selectedPlatformIds,
    });
    const result = await submitPlatformPlan(plan);
    setPlatformSubmitResult(result);
    await handleRefreshPlatformQueue();
  } catch (error) {
    setPlatformSubmitResult({
      ok: 0,
      fail: 1,
      pending: 0,
      results: [{ status: "failed", error: error instanceof Error ? error.message : String(error) }],
    });
  } finally {
    setIsSubmittingPlatforms(false);
  }
};
```

- [ ] **Step 4: Show submission results**

In `PlatformWorkbench.tsx`, render `submitResult` as a compact status panel:

```tsx
{submitResult && (
  <section>
    <span>成功 {submitResult.ok}</span>
    <span>失败 {submitResult.fail}</span>
    <span>待处理 {submitResult.pending}</span>
    {submitResult.skipped ? <span>跳过 {submitResult.skipped}</span> : null}
  </section>
)}
```

Also render failed result errors if present.

- [ ] **Step 5: Guard double submission**

Disable all submit buttons while `isSubmitting` is true and show a loading label such as `提交中...`.

- [ ] **Step 6: Verify**

Run:

```powershell
node --test tests/media-workbench-flow.test.js tests/platform-workbench-service.test.js
cd media-workbench
npm run lint
npm run build
```

Expected: PASS.

**Acceptance Criteria:**
- 真实提交前一定出现确认界面。
- 确认后调用 `buildPlatformPlan()` 再调用 `submitPlatformPlan()`。
- 成功/失败/待处理结果在新 UI 中可见。
- 提交中不能重复点击提交。

---

## Task 5: Preserve platform service behavior and improve tests

**Priority:** P1

**Files:**
- Modify: `tests/platform-workbench-service.test.js`
- Modify: `tests/desktop-workbench-flow.test.js`
- Modify: `tests/media-workbench-flow.test.js`
- Modify: `desktop/ipc/platform-ipc.js` only if tests reveal a missing contract

- [ ] **Step 1: Keep service tests focused on business behavior**

Ensure `tests/platform-workbench-service.test.js` still covers:

```text
scan non-media queues
exclude media
build selected article x target platform plan
submit serially
continue after one target fails
return ok/fail/pending counts
```

- [ ] **Step 2: Update old renderer topology tests**

Change `tests/desktop-workbench-flow.test.js` so it no longer requires old `desktop/renderer/platform-workbench.js` as the active UI. It may still verify old scripts as fallback references, but React is now production.

Add assertions like:

```js
assert.ok(read("desktop/main.js").includes("media-workbench"));
assert.ok(read("media-workbench/src/App.tsx").includes("PlatformWorkbench"));
```

- [ ] **Step 3: Add IPC contract assertions**

In `tests/media-workbench-flow.test.js`, assert:

```js
assert.ok(read("desktop/preload.js").includes("platforms:"));
assert.ok(read("desktop/ipc/platform-ipc.js").includes("platforms:get-queue"));
assert.ok(read("desktop/ipc/platform-ipc.js").includes("platforms:build-selected-plan"));
assert.ok(read("desktop/ipc/platform-ipc.js").includes("platforms:submit-selected-plan"));
```

- [ ] **Step 4: Run tests**

Run:

```powershell
node --test tests/platform-workbench-service.test.js tests/desktop-workbench-flow.test.js tests/media-workbench-flow.test.js
```

Expected: PASS.

**Acceptance Criteria:**
- 测试不再把旧 renderer 当成唯一 UI 入口。
- 服务层发布行为仍被测试保护。
- IPC 合同被测试锁定。

---

## Task 6: Update docs and final verification

**Priority:** P2

**Files:**
- Modify: `docs/desktop-workbench.md`
- Create: `docs/platform-workbench-react-ui.md`
- Modify: `docs/media-workbench-repair-record.md` only if adding a follow-up note is useful

- [ ] **Step 1: Update `docs/desktop-workbench.md`**

Update Workspaces:

```md
- **付费媒体投稿:** React UI in `media-workbench/`, uses `desktopConsole.media.*`.
- **其他平台投稿:** React UI in `media-workbench/`, uses `desktopConsole.platforms.*`.
```

Document enabled platform ids:

```md
Current non-media technical ids: `lieju`, `toutiao`, `hepan`.
Display name: `hepan` is shown as `蓝色河畔` in the UI.
```

- [ ] **Step 2: Create `docs/platform-workbench-react-ui.md`**

Include:

```md
# Platform Workbench React UI

## Entry
React component: `media-workbench/src/components/PlatformWorkbench.tsx`

## Data Flow
`PlatformWorkbench` -> `electron-api.ts` -> `desktopConsole.platforms.*` -> `desktop/ipc/platform-ipc.js` -> `platform-workbench-service.js`

## User Flow
1. Open 其他平台投稿
2. Refresh queue
3. Select source articles
4. Select target platforms
5. Confirm task count
6. Submit
7. Review result summary
```

- [ ] **Step 3: Run full verification**

Run:

```powershell
node --test tests/*.test.js
cd media-workbench
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

Use a focused commit:

```powershell
git add config desktop docs media-workbench tests
git commit -m "feat: add other platforms to react workbench"
```

**Acceptance Criteria:**
- 文档能告诉新维护者其他平台投稿从哪里进、数据怎么走。
- 全量测试、TypeScript 检查、React 构建都通过。
- 提交只包含其他平台接入新 UI 的相关改动。

---

## Self-Review

- Spec coverage: includes platform identity, API boundary, React UI, confirmation submit flow, service tests, docs, and final verification.
- Placeholder scan: no TBD/TODO placeholders; every task has files, steps, commands, expected output, priority, and acceptance criteria.
- Type consistency: platform terms use `PlatformTarget`, `PlatformArticle`, `PlatformSubmitPlan`, and `PlatformSubmitResult` consistently.
- Risk control: does not rewrite platform adapters; explicitly avoids accidental `lanse`/`hepan` id mismatch.
- Scope: keeps this plan focused on adding other platforms to the current React desktop UI.

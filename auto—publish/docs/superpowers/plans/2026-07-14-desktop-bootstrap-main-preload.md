# Desktop Bootstrap Main/Preload Integration Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with TDD checkpoints. Preserve unrelated user and worker changes.

**Goal:** Gate Electron runtime and business IPC behind the existing workspace bootstrap service and expose only the approved workspace preload API.

**Architecture:** Keep orchestration in `desktop/main.js`. Create bootstrap dependencies after Electron ready, register bootstrap IPC before calling `bootstrap()`, and use deferred runtime references plus one idempotent disposer for startup, relaunch, and quit. Pass the bootstrap workspace path explicitly through `desktop/runtime-paths.js` so runtime initialization cannot fall back to cwd/Documents. Keep the existing workspace service, validator, React renderer, and business IPC implementations unchanged.

**Tech Stack:** Node.js test runner, Electron harness mocks, CommonJS Electron main/preload scripts.

---

### Task 1: Prove the startup gate and ordering with a main-process harness

**Files:**
- Modify: `tests/desktop-packaging.test.js`

- [ ] **Step 1: Add one failing harness test** that mocks Electron, workspace bootstrap service, runtime/config-dependent modules, task/Doubao services, workspace IPC, and business IPC; assert non-ready bootstrap creates a window and workspace IPC only, while runtime/task/Doubao/business IPC/logger are not loaded.
- [ ] **Step 2: Run `node --test tests/desktop-packaging.test.js` and confirm the new test fails because `main.js` does not create/register the bootstrap service.
- [ ] **Step 3: Add the smallest main startup gate needed for the test, keeping all config-dependent `require()` calls inside the ready branch.
- [ ] **Step 4: Re-run the focused test and confirm it passes.

### Task 2: Prove ready initialization order and runtime dependency injection

**Files:**
- Modify: `tests/desktop-packaging.test.js`

- [ ] **Step 1: Add a failing ready-state harness test** that records `workspace-service -> workspace IPC -> bootstrap -> configure runtime -> task -> Doubao -> business IPC -> queue/logger subscriptions`, and asserts Electron paths/env plus deferred task/queue references are passed to bootstrap.
- [ ] **Step 2: Run the focused test and confirm the expected failure is missing integration/order.
- [ ] **Step 3: Implement the minimal ready branch and dependency wiring in `desktop/main.js`.
- [ ] **Step 4: Re-run the focused test and confirm it passes.

### Task 3: Prove relaunch and quit disposal are idempotent

**Files:**
- Modify: `tests/desktop-packaging.test.js`

- [ ] **Step 1: Add failing tests for relaunch with and without a runtime, and for repeated `before-quit`; assert subscriptions/service dispose once and `app.relaunch()` precedes `app.quit()`.
- [ ] **Step 2: Run the focused tests and confirm they fail before the disposer is shared.
- [ ] **Step 3: Implement one idempotent runtime disposal callback used by relaunch and `before-quit`.
- [ ] **Step 4: Re-run focused startup/quit tests and confirm all pass.

### Task 4: Add the restricted preload workspace contract

**Files:**
- Modify: `tests/desktop-packaging.test.js` or a dedicated preload contract test
- Modify: `desktop/preload.js`

- [ ] **Step 1: Add failing tests that execute the preload with a contextBridge/ipcRenderer harness, assert exactly the seven workspace methods, preserve existing namespaces, and ensure confirmation forwards only `{ token }` while rejecting malformed/non-token input without exposing `setPath`.
- [ ] **Step 2: Run the focused preload test and confirm it fails because `desktopConsole.workspace` is absent.
- [ ] **Step 3: Add the minimal `workspace` namespace and token boundary while leaving all existing preload methods unchanged.
- [ ] **Step 4: Re-run the focused preload tests and confirm they pass.

### Task 5: Verify the complete change and commit only worker-owned files

**Files:**
- Modify: `desktop/main.js`
- Modify: `desktop/preload.js`
- Modify: `tests/desktop-packaging.test.js` and/or the dedicated preload contract test

- [ ] **Step 1: Run related tests covering desktop packaging and workspace bootstrap IPC.
- [ ] **Step 2: Run `npm test` from the repository root.
- [ ] **Step 3: Run `git diff --check` and inspect `git diff`/`git status`; leave the pre-existing design-document modification untouched and unstaged.
- [ ] **Step 4: Commit only the main/preload/test changes with a clear message.

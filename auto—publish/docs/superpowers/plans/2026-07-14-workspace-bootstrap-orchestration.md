# Workspace Bootstrap Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Add a dependency-injected, Electron-free workspace bootstrap service and thin IPC adapter for startup selection and safe workspace switching.

**Architecture:** `workspace-bootstrap-service.js` owns source precedence, validator-backed classification, in-memory single-use selection tokens, busy-state rechecks, safe marker/subdirectory initialization, atomic location persistence, and relaunch decisions. `workspace-bootstrap-ipc.js` registers exactly seven handlers, invokes an injected directory dialog for choose/request-switch, rejects renderer paths, and wraps all results with the existing IPC envelope. Existing location store, validator, and workspace path helpers remain unchanged.

**Tech Stack:** Node.js CommonJS, `node:test`, `node:assert/strict`, existing workspace validator/location store/path helpers, injected filesystem and callbacks.

---

### Task 1: Add service and IPC contract tests first

**Files:**
- Create: `tests/workspace-bootstrap-service.test.js`
- Create: `tests/workspace-bootstrap-ipc.test.js`

- [ ] **Step 1: Write service tests for startup precedence and safe DTOs**

Cover valid environment override, valid saved location, no source, corrupted/unknown saved configuration, invalid saved path, invalid environment path, and ensure the service never chooses Documents, cwd, or a default directory. Assert returned DTOs expose only stable state/error fields and no stack, API key, or file listing.

- [ ] **Step 2: Write service tests for selection classification and cancellation**

Use temporary directories and injected validator/location store. Assert empty and existing candidates return pending selection DTOs, nonempty candidates return `confirmation_required`, invalid candidates return stable errors, and dialog cancellation returns `WORKSPACE_SELECTION_CANCELLED` without directory creation, persistence, or relaunch.

- [ ] **Step 3: Write service tests for token binding and confirmation**

Assert tokens are single-use, expire through the injected clock/TTL, become invalid after cancellation/reselection, bind to the service-owned realpath/kind, and reject renderer path substitution. Verify existing workspaces are not modified; empty/nonempty confirmation writes only the version-1 marker and missing helper directories while preserving unrelated files.

- [ ] **Step 4: Write service tests for relaunch, busy-state, and environment override behavior**

Assert relaunch occurs once after successful persistence, relaunch failure returns `WORKSPACE_RELAUNCH_FAILED` while keeping the new saved path, same-path confirmation is stable and non-destructive, final confirmation re-queries both task and Doubao queue state, active/stopping states return `WORKSPACE_SWITCH_BUSY`, and environment-controlled switching returns `WORKSPACE_ENV_OVERRIDE`.

- [ ] **Step 5: Write IPC tests for all seven handlers and input boundaries**

Register fake `ipcMain`, fake dialog, and fake service. Assert exactly these channels are registered: `workspace:get-bootstrap-state`, `workspace:choose-directory`, `workspace:confirm-selection`, `workspace:cancel-selection`, `workspace:get-current`, `workspace:open-current`, `workspace:request-switch`. Verify choose/request use `{ properties: ["openDirectory"] }`, confirm/request only pass token or restricted options, absolute renderer paths are rejected, open-current calls only injected `openPath`, and every success/error is `{ok,data}` or `{ok,error}` without stack or sensitive message content.

- [ ] **Step 6: Run only the new tests and verify the expected red failure**

Run `node --test tests/workspace-bootstrap-service.test.js tests/workspace-bootstrap-ipc.test.js`. Expected: fail because the two new production modules do not exist yet, with no unrelated test errors.

### Task 2: Implement the minimum service behavior

**Files:**
- Create: `desktop/workspace-bootstrap-service.js`

- [ ] **Step 1: Implement injected dependencies and stable error/DTO helpers**

Default only safe library dependencies (`node:fs`, `node:path`, token generation, and existing workspace helpers when not injected). Keep internal candidates and exceptions private; expose only the documented state, path, envOverride, kind, token, and stable error code/message fields.

- [ ] **Step 2: Implement startup resolution**

Read `AUTO_PUBLISH_WORKSPACE` first, then `locationStore.read()`, validate each source through the same validator, set `envOverride` only for a valid nonempty environment path, and otherwise return `selection_required` or `invalid` according to the stable test contract without deleting or replacing the stored configuration.

- [ ] **Step 3: Implement choose/request-switch and token lifecycle**

Call only the injected dialog wrapper from service-facing choose/request orchestration, classify the selected directory with the validator, create a random in-memory token bound to normalized realpath and kind, invalidate prior tokens on every new selection/cancel/failed confirmation, and require token-only confirmation.

- [ ] **Step 4: Implement final confirmation and busy checks**

Look up the token, re-query `taskService.getState()` and `doubaoCollectionService.getQueueState()` immediately before a switch, reject active or stopping states, reject environment override, revalidate the token path/kind, and make same-path confirmation a stable non-switch result.

- [ ] **Step 5: Implement safe initialization, persistence, and relaunch**

For empty/nonempty candidates create only `.autopublish-workspace.json` with `version: 1` and injected clock timestamp plus missing directories from injected `ensureWorkspaceDirectories`/`createWorkspacePaths`. Never copy, move, delete, overwrite, or enumerate business files. Persist through the injected atomic location store, preserve a successfully written path on relaunch failure, and invoke relaunch at most once.

- [ ] **Step 6: Run the service tests and make them green**

Run `node --test tests/workspace-bootstrap-service.test.js`; expected result is all service tests passing. Fix production code rather than weakening assertions.

### Task 3: Implement the thin IPC adapter

**Files:**
- Create: `desktop/ipc/workspace-bootstrap-ipc.js`

- [ ] **Step 1: Register the seven handlers with strict inputs**

Use `wrap` from `desktop/services/ipc-response`. Reject unsupported fields and absolute paths at the IPC boundary; pass only service-approved token/restricted values. Adapt injected `showOpenDialog` to directory-picker options and translate canceled dialogs to the service cancellation path.

- [ ] **Step 2: Run IPC tests and make them green**

Run `node --test tests/workspace-bootstrap-ipc.test.js`; expected result is all IPC tests passing with no Electron import.

### Task 4: Full verification and commit

**Files:**
- Modify only newly added service, IPC, tests, and implementation plan; do not modify `desktop/main.js`, `desktop/preload.js`, React files, or existing location/validator files.

- [ ] **Step 1: Run new and related old tests**

Run `node --test tests/workspace-bootstrap-service.test.js tests/workspace-bootstrap-ipc.test.js tests/workspace-validator.test.js tests/workspace-location-store.test.js tests/desktop-ipc-response.test.js` and verify zero failures.

- [ ] **Step 2: Run the full suite**

Run `npm test` and verify exit code 0 and zero failures.

- [ ] **Step 3: Inspect the final diff and protected files**

Run `git diff --check`, `git status --short`, and `git diff -- desktop/main.js desktop/preload.js desktop/workspace-location-store.js desktop/workspace-validator.js docs/superpowers/specs/2026-07-14-workspace-selection-design.md`; confirm protected files contain no worker changes and no secrets or stack traces are introduced.

- [ ] **Step 4: Commit the implementation**

Stage only the new plan, service, IPC adapter, and tests, then commit with `git commit -m "feat(desktop): add workspace bootstrap orchestration"`.

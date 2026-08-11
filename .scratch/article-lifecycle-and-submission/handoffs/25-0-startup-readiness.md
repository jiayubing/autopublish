# Ticket 25-0 — Startup Readiness

**Status:** `COMPLETE`; Ticket 25 may move from `READY` to `RUNNING` when its execution is explicitly dispatched.

## Scheduling and Git baseline

- Preparation date: 2026-08-11 (Asia/Shanghai).
- Base integration HEAD: `292a2f4c693a60296ec29de1b31ce2901b6acc28`.
- Branch: `codex/article-lifecycle-submission`; no new branch or worktree was created.
- The worktree was clean before this docs-only preparation diff.
- Ticket 24, Wave 10, M04, M05, M06 and Maintenance 10.5 are all `COMPLETE`; Ticket 25's scheduling gate is satisfied.
- Ticket 18–21 remain out of scope and are not prerequisites.

## Execution baseline

- Runtime observed: Windows, Node `v24.16.0`, npm `11.13.0`.
- `npm run test:discover` completed successfully and collected 249 `.test.js`/`.test.mjs` files.
- Existing repository gates include full test discovery/runner evidence, architecture/legacy/typed IPC checks, Renderer/Preload builds, packaging verification, and separate dirty/clean production smoke commands.
- No Ticket 25 generated evidence exists yet. Future evidence must be regenerated against the exact execution commit/sourceState under `build/evidence/`; M06 evidence is provenance history only.
- No tracked Ticket 25 story matrix or query/scan budget exists yet. Creating their schemas, complete 85-story coverage and deterministic gates is the first execution deliverable, not evidence that acceptance already passed.

## Frozen execution order

1. Create the tracked 85-story matrix and mark image portions of stories 6, 29 and 78–85 as `DEFERRED_IMAGE_EXTENSION`.
2. Create the versioned query/scan budget and deterministic gate before collecting performance results; do not invent a wall-clock pass threshold from the current run.
3. Add or reconcile public-behavior coverage for six-entry exclusivity, regular-platform concurrency/FIFO/pause/restart/uncertain, paid-media confirmation/order/cancellation/history, text-only evidence, migration and deletion/recovery.
4. Generate module-owner/capability/caller/invariant evidence for the later independent audit.
5. Run targeted gates, full runner, builds and the explicitly separated dirty production smoke evidence on the exact Ticket 25 execution source state.
6. Produce the user-controlled external acceptance checklist without performing real login, publication, payment, order creation or refresh.
7. Stop for independent audit and user-controlled external acceptance; do not self-declare Wave 11 complete.

## Safety and evidence boundaries

- Automation uses synthetic data and fake transports only.
- Real regular-platform publication and website-media order refresh require a later, operation-specific user authorization.
- Missing real external evidence must be reported as `USER_EXTERNAL_ACCEPTANCE_REQUIRED`.
- Tracked source defines what is accepted; ignored generated evidence records what actually ran. Dirty and clean smoke evidence must use distinct output paths and provenance.
- Ticket 25 execution may fix defects only in their real owner; it must not create an acceptance-owned business state machine or implement Ticket 18–21 image paths.

## Preparation verdict

`READY` — scheduling prerequisites, repository baseline, test inventory, command surfaces, evidence ownership and stop conditions have been checked. No production/test/tooling implementation or acceptance gate was performed during preparation.

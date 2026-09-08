# AutoPublish UI Refresh Execution Plan

## Goal

Refresh the existing desktop renderer into a cleaner, professional, information-dense workbench without changing durable business semantics, IPC contracts, article lifecycle, submission state, or order action semantics.

## Baseline

- Base master: `6dd37408d932a32bc46c2f40ec80b095260e966b`
- Working branch: `codex/ui-refresh-20260909`
- This branch is for visual/product QA and MUST NOT be merged automatically.

## Product direction

- Dark navy application rail + light neutral workspace.
- Blue accent used sparingly for primary actions and selected states.
- Dense desktop productivity layout rather than KPI-heavy SaaS dashboard.
- Strong hierarchy, compact tables/lists, consistent status treatment, fewer decorative cards.
- No fake growth metrics or fabricated product capabilities.

## Invariants

Preserve existing behavior unless a directly related UI defect requires a bounded fix:

- six `ViewMode` navigation destinations and navigation badges;
- article dirty guard, `beforeunload`, pending navigation intent and focus/selection behavior;
- generation preview/start ordering and current disabled conditions;
- submission preview/confirm/execute semantics, queue start/pause/remove behavior;
- attention preview/confirmation/execution flow;
- order action sessions and manual resolution semantics;
- existing IPC/bridge DTOs and command names;
- loading, empty, error and disabled states;
- accessibility semantics and existing IDs/data attributes that current tests or automation consume.

## Work packages

### U1 — Visual foundation and app shell

- Add compact tokens and a small set of renderer-only primitives: Surface, Button, Field, StatusBadge, PageHeader.
- Refresh body, focus, selection, scrollbars and responsive shell styles.
- Refresh App shell/header and Sidebar while preserving navigation IDs/data attributes.

Gate: media renderer build + targeted renderer/static tests.

### U2 — Article library

- Refresh article-library header, filter toolbar, bulk actions, grouping/list presentation, details/drawer visuals and trash states.
- Do not change article selection eligibility, dirty guards, stage semantics or submission intake/removal sessions.

Gate: article-library and media renderer regressions + build.

### U3 — Submission center

- Refresh regular queue groups, paid batches, attention list/detail, filters, command surfaces and state density.
- Preserve queue, preview/confirm/execute and uncertain-result semantics.

Gate: submission-center renderer regressions + build.

### U4 — Remaining primary surfaces

- Content production (question collection, single generation, batch generation).
- Orders.
- Media resources.
- Settings and account/runtime/workspace panels.
- Confirmation/dialog visual wrappers without replacing their state/focus ownership.

Gate: media renderer regressions + build.

### U5 — Responsive, accessibility and closeout

- Validate compact widths, overflow, keyboard focus, aria/role semantics and disabled/error/loading states.
- Remove visual inconsistencies and obsolete one-off styles only when safely replaced.
- Run full repository CI on the final branch.
- Open a PR marked **DO NOT MERGE — visual QA branch**.

## Stop rules

- Do not redesign business workflows to match a mockup.
- Do not add backend endpoints, new durable states, new IPC contracts or a component-framework dependency.
- Do not mechanically rewrite every component merely to use primitives.
- If a visual improvement requires changing a business interaction contract, leave the interaction intact and document the limitation.

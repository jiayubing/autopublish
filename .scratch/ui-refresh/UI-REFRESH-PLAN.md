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

## Follow-up — 2026-09-09 UI polish and Lieju login review

- Branch: `codex/ui-polish-20260909`, based on `b07684bb`; local work only, no push or PR.
- Fixed overlapping search icons in article library, orders and resources with explicit field padding; moved the native-control font reset into the base cascade layer so utility typography takes effect.
- Removed decorative English page subtitles, reduced heading size, and joined article filters and bulk actions into one surface.
- Added rendered geometry regression for the three search fields and behavioral coverage for cancel/discard on sidebar navigation with unsaved article edits.
- Reviewed Lieju login separately from UI: verify the configured site before trusting visible logout links; inspect all matching logout links; keep the existing member-page profile fallback; try the home page if member-page navigation fails. No publication or account-binding semantics changed.
- Synthetic login tests cover visible/hidden/foreign evidence, public profile links, navigation failure and unreadable pages. These tests execute the adapter's browser evaluation code against a fake page; they do not prove current live-site compatibility.
- Validation: renderer build, ESLint, main/bridge type checks; 57 targeted tests across responsive layout, history editing, queue lifecycle, publication history and Lieju boundaries. Actual accounts and publishing were not used. Existing large-bundle warning remains.
- Remaining: real Lieju login verification and representative large-workspace UX evaluation; this follow-up does not claim a complete product layout redesign.

## Follow-up — 2026-09-09 Lieju reauthorization

- User explicitly authorized a live Lieju login/logout verification. No publication, paid action, direct database edit, or credential output was performed.
- Live reproduction found `ReferenceError: URL is not defined` in the CLI evaluation sandbox. The adapter converted the returned error text to `true`. This regression was introduced by the preceding login patch; the earlier fake evaluator incorrectly supplied the Node URL global.
- Fixed by reading location inside the browser page and accepting only boolean `true`. The regression evaluator now separates the CLI and page globals and covers returned error text and unexpected result types.
- Separately reproduced an existing live-session overwrite: reopening login loaded the saved account over a current account switch/logout. Saved state is now imported only when opening a new browser session; tests cover both live-session preservation and cold restoration.
- User reported that the saved profile name was the homepage navigation label. Live member-page inspection confirmed that the name is in the header beside logout. Account inspection now prefers that name and rejects homepage labels as fallback names. Synthetic fixtures reproduce the observed DOM structure without real account data.
- Clarified in settings and deletion confirmation that deleting a profile does not log out of the website. Account binding, deletion guards, history, and publication state remain unchanged.
- Live evidence: old code returned true after website logout; corrected adapter returned false in that same session, then true after the user logged in again. User confirmed session saving. Corrected HTTP account inspection returned verified identity with a non-navigation display name. After restarting the application and recreating the profile through its normal guarded UI, the user confirmed the displayed nickname is correct.
- Final targeted validation: 48 tests passed across Lieju browser/transport/HTTP outcome, account-profile service, browser lifecycle and renderer settings. ESLint and main/renderer type checks passed; renderer build passed with the existing bundle-size warning. Bounded review covered the adapter, its session/identity callers and the changed fixtures. No full CI or live publishing claim is made.

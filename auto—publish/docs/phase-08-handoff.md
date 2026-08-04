# Phase 8 handoff

Phase 7 leaves the repository with automated local evidence and explicit
release blockers. Start the next phase by reading:

- `docs/release-checklist.md` for stable required checks and manual gates;
- `build/release-evidence-manifest.json` for the latest safe evidence summary;
- `.scratch/phase-07-auth-build-observability/issues/06-production-packaging-smoke.md`;
- `.scratch/phase-07-auth-build-observability/issues/07-ci-release-checklist-handoff.md`.

The next phase must not infer platform TLS, proxy source headers, code signing,
installer ACL, SmartScreen, upgrade/rollback, or external E2E acceptance from
local fixtures. Those remain owner-controlled `PENDING_HUMAN` release gates.

Operational facts carried forward:

- Auth schema is version 2; readiness is a light probe and full integrity is a
  controlled operation.
- Content workspace schema is version 1; future or older markers fail closed
  until an explicit upgrade path exists.
- Installation, roaming configuration, local state, and content library roots
  must remain distinct.
- Diagnostic records use the structured schema and safe DTO projection; raw
  `publish-log` data is not a supported evidence source.
- The production directory smoke is offline and uses synthetic migration,
  schema, storage, JavaScript, and optional Hepan payload checks.

## Ticket 12 handoff: diagnostics, artifacts, and evidence

The implementation is complete at the source and contract level. Release
acceptance remains blocked until a clean, unsigned production artifact is
provided and the owner-controlled gates are completed. No production network,
code signing, or dirty-source packaging bypass was used.

### Module graph

```mermaid
flowchart LR
  D["diagnostic producer"] --> DS["diagnostic contract / factory"]
  DS --> MS["memory sink"]
  DS --> FS["file sink / rotation / startup cleanup"]
  MS --> DP["safe IPC projection"]
  FS --> DP
  RP["runtime path boundary / tool resolution"] --> RV["runtime resolver"]
  RV --> AV["artifact verifier"]
  AV --> AR["manifest reader / artifact reader"]
  AC["artifact contract / collector"] --> AV
  AC --> OE["offline smoke checks / runner"]
  OE --> OW["production smoke evidence writer"]
  EI["release evidence inputs"] --> EW["evidence writer"]
  EW --> CV["checklist validator"]
```

The retained facades are `diagnostic-schema.js`,
`runtime-diagnostics-service.js`, `artifact-verifier.js`,
`offline-self-test.js`, and `create-release-evidence-manifest.js`. Their
implementation-heavy branches now delegate to the single-purpose modules
shown above, preserving existing callers while keeping validation,
collection, verification, orchestration, and serialization separate.

### Frozen contracts

- Diagnostic records contain only `diagnosticId`, `occurredAt`, `code`,
  `module`, `category`, `operationId`, `runId`, and safe `metadata`. IPC
  projection exposes a bounded code/category summary and safe user message;
  raw `Error`, paths, stack traces, credentials, and account display data are
  not projected.
- The production artifact manifest is version `1`. Its required inventory is
  `electron-main`, `electron-preload`, `renderer-entry`, `playwright-node`,
  `playwright-node-license`, `playwright-node-manifest`, `playwright-cli`,
  `playwright-cli-license`, `playwright-license`, `playwright-core-license`,
  `hepan-script`, `hepan-vendor`, and `migration-cli`. Every entry carries a
  safe relative location/path and a SHA-256 hash; executable and version
  metadata are checked against the contract.
- Release evidence uses the fixed `REQUIRED_CHECKS` names:
  `required/root-tests`, `required/auth-tests`,
  `required/migration-roundtrip`, `required/backup-restore-fixture`,
  `required/rate-limit-capacity`, `required/diagnostics-static`,
  `required/production-directory-smoke`, `required/test-discovery`,
  `required/auth-container`, `required/auth-migration-roundtrip`,
  `required/health-semantics`, `required/media-transport`,
  `required/legacy-publish-log-absence`, `required/toolchain`,
  `required/packaging-contracts`, and `required/link-security`.
- The fixed manual gates are `phase4-platform-account-binding`,
  `phase4-hepan-reconciliation`, `phase4-media-http-risk`,
  `phase4-signed-browser-login`, `platform-endpoints-tls`,
  `proxy-source-headers`, `signing-certificate`,
  `installer-acl-upgrade-rollback`, `external-e2e-owner`, `auth-rpo-rto`,
  `auth-backup-policy`, and `auth-recovery-drill`.
- Release evidence preserves `PENDING_HUMAN` and `BLOCKED_RELEASE`. The
  checklist validator checks exact schema/gate completeness and never changes
  a release into an approved state.

### Split and deletion ledger

- Diagnostic schema/factory, sinks, rotation, startup cleanup, runtime
  snapshot, and IPC projection are now independently owned.
- Runtime boundary checks, Playwright tool resolution, artifact path/reader,
  manifest reader, verifier, offline checks, runner, and smoke evidence writer
  are independently owned.
- Release input collection, artifact/hash normalization, manifest writing, and
  checklist validation are independently owned.
- The packaged migration resolver no longer falls back to the source tree;
  the retired artifact-manifest `version` compatibility path is gone; raw
  runtime errors and unsafe absolute paths are not passed through evidence or
  IPC boundaries.

### Verification and blockers

- Passed: `npm run lint`; `npm run format:check`; main, renderer, and bridge
  type checks; renderer and preload builds.
- Passed: diagnostics `32/32`; packaging contracts `46/46`; release evidence
  `4/4`; CI workflow contract `1/1`; Ticket 12 parity/contract tests `7/7`.
- Discovery collected `230` root test files. The isolated 5,000-item handoff
  capacity test passed in approximately `92.2s`.
- The current `release-alpha/win-unpacked/resources/app.asar` is absent, so
  alpha physical-ASAR checks and the alpha smoke verifier cannot be accepted.
  The current `release-production-smoke/win-unpacked/resources` is also absent;
  no artifact hash or production smoke evidence is claimed.
- The formal production smoke command remains behind the clean-build gate
  while this worktree is dirty. A dirty-source override is intentionally not
  used. Signing, installer/upgrade/rollback, TLS/proxy, external E2E, and
  platform-owner gates remain `PENDING_HUMAN`.
- Local blocked evidence snapshot: `build/release-evidence-manifest.json`,
  SHA-256
  `d59e137fee2c2c07476f1f2e5bd28e238e4fe55a3d41453472808ff28b88ee12`;
  `validate-release-checklist --allow-blocked` returned `BLOCKED_RELEASE`.
  Its artifact section is `PENDING_HUMAN` with no entries because no
  production artifact exists; this snapshot is evidence of the blocker, not a
  release approval.

## Ticket 09 handoff: Platform, Media, Settings, Workspace Renderer slice

Ticket 09 is complete at the Renderer source and contract level. No IPC
channel name or public business interface was changed; the main-side media
DTO projections and submission rehydration were extended so every supported
resource type remains explicit across the boundary.

### Domain ownership and migration

- Platform/publication queue, PlatformRun projection, account-login state,
  residue inspection/cleanup, terminal queue refresh, selection, and command
  lifecycles are owned by
  `media-workbench/src/features/platform/platform-feature.js` and consumed by
  `platform-feature-context.tsx` and the platform Views.
- Media articles, drafts, bounded resource/pool pages, balance, orders,
  preflight, submission, and order sync are owned by
  `media-workbench/src/features/media/media-feature.js` and consumed through
  `use-media-feature.ts`. The media bridge normalizes selected resources and
  preserves the `image`, `video`, `audio`, and `document` media types.
- Settings remains independently owned by `settings-feature.js`; its named
  query and command owners are consumed by `SettingsView` and provider
  sections without secret state in the Renderer.
- Workspace bootstrap/runtime state remains owned by the workspace feature;
  authentication is an independent external store in `auth-store.tsx` with
  query state, per-command state, request sequence/lifecycle fencing,
  subscription cleanup, and stale response rejection.
- Renderer imports now use domain type files (`types/platform`, `types/media`,
  `types/publication`, `types/settings`, `types/workspace`, `types/auth`, and
  `types/view`). `media-workbench/src/types.ts` is now only the Ticket 10
  compatibility re-export and has no production caller.

### Lifecycle contracts

- Platform and media queries use `createQueryIdentity`; commands use
  `createCommandOwner`. Scope changes invalidate all affected requests and
  clear the old snapshot. Platform transport callbacks are fenced by
  `runLifecycle`; dispose invalidates subscriptions and owners.
- Media closes invalidate an in-flight article open, resource pages are
  bounded/deduplicated, and order sync uses a revision so a late response
  cannot clear a newer workspace indicator.
- Workspace changes clear platform residue/run/query state and media/order
  projections. Cleanup refreshes the queue only after its runtime identity
  guard passes.
- Diagnostics remain safe summaries; no raw error, URL credential, Cookie,
  filesystem path, or screenshot data is added to the Renderer surface.

### View and feature scale ledger

- `PlatformWorkbench.tsx` was reduced to a 353-line coordination View.
  `PlatformQueuePanel.tsx`, `PlatformSubmitPanel.tsx`, and
  `PlatformSubmissionOverlays.tsx` own only cohesive rendering and UI event
  forwarding; the feature remains the sole mutable business-state owner.
- `SettingsView.tsx`, `OrdersView.tsx`, and `App.tsx` remain cohesive View/root
  composition modules. App keeps navigation state in one root, while Settings
  and Orders are below the 400-line warning threshold.
- `media-feature.js` remains a deliberately deep 793-line media/order owner.
  Its query identities, command owners, projection mutations, and dispose
  contract are kept together so splitting them would require a broad mutable
  state interface or a second owner. This is an explicit Ticket 01 exception,
  not an unreviewed long file; a future split must preserve the single
  media/order snapshot owner.

### Verification

- Full root suite passed: `236` test files, `134` suites, `1593` tests,
  `1593` passed, `0` failed (`npm test`, approximately `589.7s`).
- Renderer/bridge type checks, lint, Renderer/preload builds, packaging
  contracts, and the Platform/Media/Settings/Workspace/Auth and Renderer
  acceptance tests passed.
- The client-switch acceptance test now avoids opening Chromium's native
  `<select>` popup before sending keyboard input; its layout hit check remains,
  and the production `onChange` path is exercised without the prior flaky
  pointer/keyboard timing.

### Remaining work and human gates

- Ticket 10 owns deletion of the compatibility `types.ts` re-export after a
  final repository-wide caller/fixture audit.
- `npm run format:check` passes across all configured files after formatting
  the 11 repository baseline files; `git diff --check` also passes. The
  current alpha ASAR copy of the operational store was synchronized with
  the formatted production source so the packaging parity check remains
  byte-exact.
- Real account login, provider HTTPS/TLS/redirect behavior, paid media orders,
  external publication E2E, signing, installer/upgrade/rollback, and physical
  Electron package smoke remain `PENDING_HUMAN` / `BLOCKED_RELEASE`.

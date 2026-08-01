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

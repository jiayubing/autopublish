# Release checklist

This checklist is a release gate, not an approval mechanism. The evidence
manifest records safe summaries, versions, relative artifact identifiers and
hashes. It never contains credentials, cookies, article content, raw errors,
absolute user paths, DOM, or screenshots. A dirty or unknown source state
cannot become release-ready.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `PASSED` | The named automated or human evidence is present and passed. |
| `PENDING_HUMAN` | An owner-controlled environment or operational result is still required. |
| `BLOCKED_RELEASE` | The aggregate release state or a prerequisite prevents formal release. |
| `NOT_APPLICABLE` | The capability is explicitly outside this release scope; it is never an implicit pass. |

## Fixed required checks

These 17 IDs are stable CI subcheck/evidence-contract names. GitHub branch
protection must require the seven job display names listed separately below;
step IDs are not GitHub status checks by themselves.

- `required/root-tests`
- `required/test-discovery`
- `required/migration-roundtrip`
- `required/toolchain`
- `required/packaging-contracts`
- `required/production-directory-smoke`
- `required/legacy-publish-log-absence`
- `required/auth-tests`
- `required/auth-container`
- `required/auth-migration-roundtrip`
- `required/backup-restore-fixture`
- `required/health-semantics`
- `required/rate-limit-capacity`
- `required/media-transport`
- `required/diagnostics-static`
- `required/link-security`
- `required/phase-08-gates`

The fixed CI job display names are:

- `required/desktop-node24`
- `required/auth-node22`
- `required/auth-container-node22`
- `required/auth-verification-node22`
- `required/desktop-security-node24`
- `required/link-security`
- `required/release-evidence`

Renaming a subcheck or job requires a migration note in the workflow,
manifest writer, validator, this checklist and the Phase 7 handoff.

## Automated evidence

- `required/root-tests`: desktop core suite; the four delegated packaging contract files run under `required/packaging-contracts`, so the two required checks together cover the full desktop suite without repeating a test file.
- `required/test-discovery`: both `.test.js` and `.test.mjs` collection.
- `required/migration-roundtrip`: desktop Content/OperationalStore migration suite; its independent report is `build/evidence/desktop-migration-roundtrip.json`.
- `required/toolchain`: lint, renderer/bridge/main typecheck, format, renderer build and preload build.
- `required/packaging-contracts`: production packaging, runtime and evidence contract tests.
- `required/production-directory-smoke`: non-signing `electron-builder --dir` plus Ticket 06 offline self-test.
- `required/legacy-publish-log-absence`: source and actual production archive absence scan.
- `required/auth-tests`: Auth Linux service test suite.
- `required/auth-container`: isolated Linux container smoke with no production data and no network.
- `required/auth-migration-roundtrip`: isolated Auth schema v1 to v2 roundtrip and idempotent retry; its independent report is `build/evidence/migration-roundtrip.json`.
- `required/backup-restore-fixture`: temporary destination verification, restore-check and corruption gate.
- `required/health-semantics`: liveness/readiness/integrity semantics and safe diagnostics.
- `required/rate-limit-capacity`: trusted proxy, source/identity/combination buckets, TTL/LRU and 100k identity capacity.
- `required/media-transport`: HTTPS/HTTP confirmation, redirect, TLS, timeout and sensitive payload gates.
- `required/diagnostics-static`: structured diagnostic schema, redaction, rotation/capacity and legacy interface absence.
- `required/link-security`: link capability and path-boundary checks.
- `required/phase-08-gates`: dependency direction, unique owner/writer, capability reachability, legacy absence, module-size and production package boundary checks.

The evidence manifest keeps desktop migration, Auth migration and Ticket 15
capacity as separate evidence fields (`migration`, `authMigration`, and
`capacity`); a required check cannot borrow a report from another boundary.

CI sets `CI_SYNTHETIC_ONLY=1`, uses pinned Node 24/22 runtimes, and never
uses production secrets or accesses a real database, workspace, account,
supplier, Cloudflare/Tunnel, posting or paid system. The container job uses
`network=none`; external E2E is not part of these automated checks.

## Human gates

Each item below remains `PENDING_HUMAN` until the named owner records a
reviewable result. Any incomplete item makes the aggregate state
`BLOCKED_RELEASE`:

The fixed manifest gate IDs for the human items are:

- `phase4-platform-account-binding`
- `phase4-hepan-reconciliation`
- `phase4-media-http-risk`
- `phase4-signed-browser-login`
- `platform-endpoints-tls`
- `proxy-source-headers`
- `signing-certificate`
- `installer-acl-upgrade-rollback`
- `external-e2e-owner`
- `auth-rpo-rto`
- `auth-backup-policy`
- `auth-recovery-drill`

Rollback evidence is a separate `rollback` manifest field and checklist
entry (`manual/rollback-evidence`); it is not one of the 12 `manualGates`.

- Phase 4 controlled platform account/profile binding and remote ID acceptance.
- Phase 4 Hepan disconnect/uncertain outcome remote reconciliation.
- Phase 4 media provider HTTP risk acceptance and test resource.
- Phase 4 signed artifact browser-login acceptance.
- Production endpoint, DNS, TLS certificate and hostname verification.
- Cloudflare/Tunnel direct-peer, source-header, trusted-hop and CIDR verification.
- Windows signing certificate, timestamp service and clean signed artifact.
- Installer ACL, upgrade, rollback, SmartScreen and clean-machine acceptance.
- Controlled external E2E owner and deployment confirmation.
- Auth backup cadence, destination retention, RPO/RTO numeric targets and recovery drill owner.
- A previous signed rollback package or an approved rollback procedure.

Missing `WIN_CSC_LINK` or `WIN_CSC_KEY_PASSWORD`, production DNS/certificate
or human acceptance blocks formal release only. It must not disable ASAR,
restore source fallback, permit implicit HTTP, or weaken proxy/diagnostic
security rules.

## Evidence commands

```powershell
npm test
npm run test:desktop-core
npm --prefix auth-server test
npm run test:discover
npm run test:migration
npm run test:packaging
npm run test:diagnostics
npm run test:media-transport
npm --prefix auth-server run test:health
npm --prefix auth-server run test:rate-limit
npm run lint
npm run typecheck:renderer
npm run typecheck:bridge
npm run typecheck:main
npm run format:check
npm run build:renderer
npm run build:preload
npm run pack:production:smoke
node scripts/create-release-evidence-manifest.js --artifact-manifest build/production-artifact-manifest.json --migration-report build/evidence/desktop-migration-roundtrip.json --auth-migration-report build/evidence/migration-roundtrip.json --capacity-report build/evidence/capacity.json
node scripts/validate-release-checklist.js build/release-evidence-manifest.json --allow-blocked
```

For a formal release review, run the validator without `--allow-blocked`
only after every required check, evidence item, manual gate and rollback
item is `PASSED` and the source state is clean. The validator never
approves, signs, publishes or deploys a release.

The local dirty evidence path is `build/release-evidence-manifest.json`; its
`sourceState.status=DIRTY` and `releaseState=BLOCKED_RELEASE` are expected.
The production smoke configuration is non-signing and is not evidence of a
signed installer, SmartScreen, ACL, DNS, TLS, proxy or external E2E result.

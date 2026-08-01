# Release checklist

The release evidence manifest is generated from structured command results. It
does not contain credentials, cookies, article content, raw errors, absolute
user paths, or screenshots. It records whether the source tree was clean and a
hash of the source-state summary; a dirty or unknown source state cannot be
marked ready for release.

## Required checks

These names are stable and are the required automated evidence inputs:

- `required/root-tests`
- `required/auth-tests`
- `required/migration-roundtrip`
- `required/backup-restore-fixture`
- `required/rate-limit-capacity`
- `required/diagnostics-static`
- `required/production-directory-smoke`

The production directory smoke uses the non-signing
`electron-builder.production-smoke.yml` configuration. It proves the real
ASAR, `app.asar.unpacked`, resource, resolver, migration CLI, and offline
self-test boundaries. It is not evidence that a signed installer passed.

## Manual release gates

Each gate remains `PENDING_HUMAN` or `BLOCKED_RELEASE` until the named owner
records an external acceptance result:

- platform endpoints and TLS certificate/hostname behavior;
- Cloudflare/Tunnel proxy source headers and trusted-hop configuration;
- Windows signing certificate and timestamp service;
- installer ACL, upgrade, rollback, SmartScreen, and clean-machine behavior;
- controlled external E2E and deployment owner confirmation.

Run the validator only after every required check and every manual gate has a
recorded `PASSED` state:

```powershell
node scripts/validate-release-checklist.js build\release-evidence-manifest.json
```

The validator reports readiness for human release review; it never approves or
publishes a release by itself.

## Evidence commands

```powershell
npm run test:migration
npm run test:diagnostics
npm run pack:production:smoke
node scripts/create-release-evidence-manifest.js --artifact-manifest build\production-artifact-manifest.json
```

Formal signed artifacts still require `WIN_CSC_LINK` and
`WIN_CSC_KEY_PASSWORD`. Missing signing variables block `pack:production` and
`dist:production`, but do not weaken local security checks or the directory
smoke configuration.

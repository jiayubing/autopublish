# AutoPublish

AutoPublish is an Electron application for local content research, generation,
publication preparation, platform workflows, and paid-media workbench tasks.
The portable content workspace is selected explicitly and remains separate
from application configuration, browser state, logs, caches, credentials, and
the installed package.

## Engineering Commands

Run commands from this directory.

```powershell
npm test
npm run test:phase-08:gates
npm run lint
npm run typecheck:main
npm run typecheck:renderer
npm run typecheck:bridge
npm run format:check
npm run build:renderer
npm run build:preload
```

Migration and recovery procedures are in `docs/content-library-v2-migration.md`
and `docs/publication-ledger-migration.md`. They require dry-run or explicit
execution confirmation and should never be pointed at an unreviewed source.

For a release review, follow `docs/release-checklist.md`. A local dirty smoke
package is diagnostic only; signing, installer rollback, real account/TLS
checks, external E2E, and real Auth recovery are owner-controlled release
gates. The Phase 8 closeout status and remaining CI container gate are documented in
`../docs/refactor/phase-08-final-report.md`.

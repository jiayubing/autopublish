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

The authoritative business glossary is `../CONTEXT.md`, and the current article
lifecycle and submission workflow are specified in
`../ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md`. Historical pre-refactor material
under this subproject is not an implementation source.

Migration, recovery, release, signing, installer rollback, real account/TLS
checks, external E2E, and real Auth recovery remain owner-controlled actions
that require dry-run or explicit execution confirmation. Completed refactor
branch plans and handoffs are historical Git evidence, not current operating
instructions.

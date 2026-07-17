# Clean-machine installation and recovery

The formal package is built from a clean Git commit. It contains the exact
`@playwright/cli` dependency and a SHA-256-verified official Windows x64 Node
runtime at `resources/app/tools/node/`. The application defaults to the system
Edge channel (`msedge`) and does not package browser profiles, cookies, logs,
content, or credentials.

## Build and verify

```powershell
npm ci
npm --prefix media-workbench ci
npm test
npm run verify
npm run pack:alpha
node scripts/verify-alpha-package.js release-alpha\win-unpacked\resources\app
node scripts/verify-packaged-playwright-runtime.js release-alpha\win-unpacked\resources\app --browser-smoke
```

`npm run pack:alpha` and `npm run dist:alpha` stop when Git has tracked or
untracked changes. Use the explicit `pack:alpha:dirty` or `dist:alpha:dirty`
scripts only for a local diagnostic package; it is not a release artifact.

The isolated verifier clears PATH and Playwright environment overrides, runs
the bundled Node and CLI, and uses temporary daemon/profile directories. If
Node or the CLI is removed from the unpacked package, verification must fail.

## First launch

Development and installed builds use the same application identity
`com.autopublish.desktop` and the same canonical roaming configuration owner.
Portable content is selected explicitly. `%APPDATA%` stores application
configuration; `%LOCALAPPDATA%\AutoPublish` stores logs, cache, temporary files,
and browser profiles. The install directory remains read-only application
code and resources.

Open Settings and run “运行浏览器自检”. It opens only a temporary
`about:blank` session and closes it immediately. If Edge is unavailable,
install Edge or select an available Chrome channel in application-level
configuration. MarkItDown and Hepan Python are independent capabilities and
do not prevent ordinary Markdown or Doubao workflows when absent.

## Recovery

Stop AutoPublish and all Edge/Playwright daemons before restoring data. Keep
the migration manifest and backup together. The manifest records source,
target, bytes, SHA-256, execution version, and commit evidence, but never
stores secret values. Re-run migration in dry-run mode first; conflicts must be
resolved before `--execute`.

For an installation that has been upgraded from the old development identity,
legacy application configuration import is an explicit, one-time operation.
It never overwrites a non-empty canonical configuration directory. Content
library data and browser profiles are not silently copied during this import.

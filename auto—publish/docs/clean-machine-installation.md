# Clean-machine installation and recovery

The formal package is built from a clean Git commit. It contains the exact
`@playwright/cli` dependency and a SHA-256-verified official Windows x64 Node
runtime at `resources/app/tools/node/`. The application defaults to the system
Edge channel (`msedge`) and does not package browser profiles, cookies, logs,
content, or credentials.

The content workspace is separate from the source-code directory. On a clean
machine, select or create the portable workspace explicitly; do not copy the
development repository as the runtime content location. The workspace includes
the template catalog, article data, queue material, orders, and the
`.autopublish/submission-records/publications/` publication ledger. The ledger
is migratable content history and must move with the workspace, while it must
never be embedded in the installer.

## Build and verify

```powershell
npm ci
npm --prefix media-workbench ci
npm test
npm run verify
npm run pack:alpha
node scripts/verify-alpha-package.js release-alpha\win-unpacked\resources\app
node scripts/verify-packaged-docx-runtime.js release-alpha\win-unpacked\resources\app
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
configuration. Client DOCX files use the bundled Mammoth parser and do not
require Python or MarkItDown. Capabilities use four states: ready, not_checked,
optional_unconfigured, and unavailable. Not checked is not a failure, and an
optional Hepan dependency only affects Hepan publishing; it does not block
DOCX, Doubao, Edge, or ordinary Markdown workflows.
Hepan publishing is an optional platform and currently requires a user-provided
Python runtime with `requests`, `beautifulsoup4`, and a valid cookie. Configure
it before entering a real Hepan publish operation.
Hepan accepts application-generated `.md`, `.markdown`, `.txt`, and `.docx`.
Markdown is converted to safe HTML locally with raw HTML disabled; no extra
Python Markdown package is required. The default inter-article Hepan interval
is 30 seconds and can be set from 0 to 3600 seconds in Settings. The
`HEPAN_PUBLISH_INTERVAL_SECONDS` environment override is read-only; zero is
allowed but shows a frequency-risk warning.

Configure paid media and Hepan from the Settings center. `media-provider.json`
and `hepan-provider.json` are application-local encrypted stores under
`%APPDATA%\AutoPublish`; they are not workspace files and are never packaged.
Do not copy a workspace `.env` containing `XQW_API_KEY` or
`HEPAN_COOKIE_PATH` to a new computer. If the first launch reports legacy
configuration, import it only after reviewing the source summary. The import
does not show the Key or Cookie, does not persist environment overrides, and
does not delete the old Cookie file.

After selecting a new workspace, verify that a template-only workspace still
discovers its valid templates even when `clients/` is empty. The UI must explain
that generation is disabled until a client with valid material and research is
available. Add a fixture client or template, use the explicit refresh action,
and confirm that the new item appears without restarting the application.

## Recovery

Stop AutoPublish and all Edge/Playwright daemons before restoring data. Keep
the migration manifest and backup together. The manifest records source,
target, bytes, SHA-256, execution version, and commit evidence, but never
stores secret values. Re-run migration in dry-run mode first; conflicts must be
resolved before `--execute`.

During clean-machine acceptance, check target-level duplicate protection for a
normal platform and for two distinct paid-media resources, and check that an
order sync can move the corresponding publication record to published. A
timeout or browser crash must become待确认 and must not offer a direct safe
retry. If the remote operation succeeded but local archiving failed, keep the
publication as successful or require reconciliation; never classify it as a
safe-to-retry failure.

Moving history articles to the trash is a confirmed, all-or-nothing operation
across every publication target. Safe queued attempts are cancelled and
unchanged failed pairs are cleaned while their publication records remain.
Submitting, submitted, uncertain, and conflicting pairs block the whole
selection. The durable removal transaction resumes after a crash; it never
recreates a cancelled queue item. Restoring an article does not restore its
queue entry. The trash has no automatic expiry, and permanent deletion keeps
immutable title snapshots and every publication attempt.

For an installation that has been upgraded from the old development identity,
legacy application configuration import is an explicit, one-time operation.
It never overwrites a non-empty canonical configuration directory. Content
library data and browser profiles are not silently copied during this import.

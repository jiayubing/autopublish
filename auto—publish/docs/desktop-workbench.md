# Desktop Workbench

## Start

```powershell
cd F:\瀹樺獟鎶曠\auto鈥攑ublish
npm run desktop
```

## Queue Snapshot

```powershell
npm run snapshot
```

## Workspaces

- **Media Submission** (濯掍綋鎶曠): scan `input/media`, select one or more Media Pool resources per article, preview, confirm, submit, and sync orders.
- **Other Platforms** (鍏朵粬骞冲彴): scan non-media platform queues (lieju/toutiao/hepan), select articles, choose target platforms, confirm, and publish selected tasks serially.

## Flow

- Switching between workspaces keeps each workspace stateful.
- Media article editing happens in a drawer with explicit save/apply.
- Other platform submission uses a batch selector on the page and a confirmation drawer before real submit.

## Operator lifecycle and target-level safety

审核、入队、提交、发布和待确认是不同阶段：

- **审核** only accepts the local article (`saved`); it does not contact a
  platform or media provider.
- **入队** creates a local snapshot for a selected target after explicit
  confirmation; it is not a remote submission.
- **提交** records evidence that the remote destination received or accepted a
  request. It is not the same as proof of final publication.
- **发布** is recorded only when the remote result proves publication, and it
  is recorded separately for each ordinary platform or paid media resource.
- **待确认** means the remote call may have succeeded but the local result is
  inconclusive. It requires reconciliation and must not be directly retried.

The duplicate guard uses article × platform for ordinary platforms and article ×
media resource for paid media. A published or uncertain target blocks another
attempt, while an independent target for the same article can continue. A
remote success followed by local queue/archive failure is still a successful
publication for safety purposes; operators must reconcile it and must not assume
that retrying is safe.

Use the explicit refresh action in the content workbench after adding or editing
clients or templates. An empty client workspace still displays discoverable
templates, but generation remains disabled until a client and valid inputs are
available.

## Safety

- Media submission requires a final confirmation drawer before any API submission.
- Media submission runs serially 鈥?one task at a time.
- A failed media task does not stop later tasks. The final result summarizes success, failure, and skipped tasks.
- Stop prevents new tasks from starting and lets the current request finish.

## Architecture

- **Main process:** `desktop/main.js` (lifecycle only) 鈫?`desktop/ipc/register.js` 鈫?`batch-ipc.js`, `media-ipc.js`, `platform-ipc.js`
- **Services:** `desktop/services/ipc-response.js`, `media-workbench-service.js`, `platform-workbench-service.js`, `media-order-service.js`, `desktop-task-service.js`
- **Renderer:** React source under `media-workbench/src`; production loads only the packaged `media-workbench/dist` bundle.
- **Preload API:** grouped under `desktopConsole.batch`, `.media`, `.platforms`, `.orders`

## Resource Cache

The Media Submission workspace reads from the local media resource cache by default. Refreshing resources updates `data/media-resources.json`, and the renderer requests 20-row pages from the service layer. Search also runs against the cached resource set.

Publication history is kept with the portable content workspace under
`.autopublish/submission-records/publications/`. It is content-library history,
not installer data or application-level secret configuration. The installer
must not contain publication records, queue snapshots, media orders, client
content, credentials, or browser state.

## Service Boundaries

- `media-resource-service`: resource normalization, cache refresh, cached paging/search, pool management, and balance.
- `media-workbench-service`: article scan, preview, confirmation summary, serial submit, and stop handling.
- `media-order-service`: order record loading, order view DTOs, and sync.
- `media-ipc`: transport only; it forwards requests and does not own parsing, pagination, normalization, or view shaping.
- `desktop/preload.js`: exposes only the canonical media/platform/order IPC surface.

## Tests

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/*.test.js
```

## Dependencies

Do not remove: `electron`, `dotenv`, `form-data`, `mammoth`.


## Alpha Packaging

Portable alpha:

`powershell
npm run pack:alpha
` 

Installer alpha:

`powershell
npm run dist:alpha
` 

The packaged app creates runtime folders under `%USERPROFILE%\Documents\AutoPublish` unless AUTO_PUBLISH_WORKSPACE is set. Do not place private .env, article drafts, logs, or order history in the installer package.


## Packaged App Workspace

Alpha packaged app uses %USERPROFILE%\\Documents\\AutoPublish by default.
Put media articles in Documents\\AutoPublish\\input\\media.
Put platform articles in Documents\\AutoPublish\\input\\lieju, input\\toutiao, or input\\hepan.
Do not put `XQW_API_KEY` or `HEPAN_COOKIE_PATH` in the workspace `.env` for a
new installation. Configure paid media and Hepan in the application Settings;
the application-level stores use Electron `safeStorage` and are not part of
the portable content library. An old workspace `.env` may be discovered as
importable legacy configuration, but it is never loaded or displayed as a
secret automatically.

Create a smoke workspace:
`powershell
powershell -ExecutionPolicy Bypass -File scripts/create-alpha-smoke-workspace.ps1
` 
# Workspace and manual submission

The production renderer is the React build. Runtime files belong in `%USERPROFILE%\Documents\AutoPublish` (or the explicit workspace override). Queue scanning, preflight, and submission remain operator-confirmed actions; no exported GEO article is published automatically.

The production renderer is the React build under `media-workbench/dist`. It runs preflight first, then shows a final confirmation; only that explicit confirmation invokes submission.

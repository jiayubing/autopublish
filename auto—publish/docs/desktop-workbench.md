# Desktop Workbench

## Start

```powershell
cd F:\官媒投稿\auto—publish
npm run desktop
```

## Queue Snapshot

```powershell
npm run snapshot
```

## Workspaces

- **Media Submission** (媒体投稿): scan `input/media`, select one or more Media Pool resources per article, preview, confirm, submit, and sync orders.
- **Other Platforms** (其他平台): scan non-media platform queues (lieju/toutiao/hepan), select articles, choose target platforms, confirm, and publish selected tasks serially.

## Safety

- Media submission requires a final confirmation drawer before any API submission.
- Media submission runs serially — one task at a time.
- A failed media task does not stop later tasks. The final result summarizes success, failure, and skipped tasks.
- Stop prevents new tasks from starting and lets the current request finish.

## Architecture

- **Main process:** `desktop/main.js` (lifecycle only) → `desktop/ipc/register.js` → `batch-ipc.js`, `media-ipc.js`, `platform-ipc.js`
- **Services:** `desktop/services/ipc-response.js`, `media-workbench-service.js`, `platform-workbench-service.js`, `media-order-service.js`, `desktop-task-service.js`
- **Renderer:** `desktop/renderer/app.js` (bootstrapper), `media-workbench.js`, `platform-workbench.js`, `media-resource-library.js`, `media-orders-drawer.js`, `shared/dom.js`, `shared/drawer.js`, `shared/confirm.js`
- **Preload API:** grouped under `desktopConsole.batch`, `.media`, `.platforms`, `.orders`

## Tests

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/*.test.js
```

## Dependencies

Do not remove: `electron`, `dotenv`, `form-data`, `mammoth`.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");

const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");

const RETIRED_WITHOUT_PRODUCTION_CONSUMER = Object.freeze([
  "attention.getArticleAttention",
  "content.listTemplates",
  "content.listGeneratedArticles",
  "content.reviewArticles",
  "content.listArticleTrash",
  "content.previewTrashArticles",
  "content.listArticleRemovalTransactions",
  "content.listSubmissionBatches",
  "content.previewCancelSubmissionBatch",
  "content.previewRetryFailedPublication",
  "content.retryFailedPublication",
  "content.startDoubaoBatch",
  "generation.createBatch",
  "generation.listBatches",
  "generation.getBatch",
  "generation.startBatch",
  "generation.getState",
  "publication.listForArticles",
]);

test("capabilities without a real production feature and View consumer are retired", () => {
  for (const capability of RETIRED_WITHOUT_PRODUCTION_CONSUMER) {
    assert.equal(
      productionIpcRegistry.byCapability(capability),
      null,
      capability,
    );
  }
});

test("checkpoint C keeps one Settings owner and zero retired media/navigation protocol references", () => {
  const rendererRoot = path.resolve(__dirname, "../media-workbench/src");
  const rendererSources = fs
    .readdirSync(rendererRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:js|ts|tsx)$/.test(entry.name))
    .map((entry) =>
      fs.readFileSync(path.join(entry.parentPath, entry.name), "utf8"),
    );
  assert.equal(
    rendererSources.flatMap(
      (source) => source.match(/<SettingsFeatureProvider\b/g) || [],
    ).length,
    1,
  );

  const rendererTypeSources = fs
    .readdirSync(path.resolve(__dirname, "../media-workbench/src/types"))
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => `../media-workbench/src/types/${entry}`);
  const protocolSources = [
    "../desktop/ipc/contracts/production-registry.js",
    "../desktop/workspace-data-invalidation.js",
    "../desktop/preload.js",
    "../media-workbench/src/features/workspace/workspace-coordinator.js",
    ...rendererTypeSources,
  ]
    .map((source) => fs.readFileSync(path.resolve(__dirname, source), "utf8"))
    .join("\n");
  assert.doesNotMatch(protocolSources, /media[.:]stopSubmit|media:stop-submit/);
  assert.doesNotMatch(
    protocolSources,
    /navigationSummary|navigation-summary|navigation_summary/,
  );
  const sidebar = fs.readFileSync(
    path.resolve(__dirname, "../media-workbench/src/components/Sidebar.tsx"),
    "utf8",
  );
  assert.match(sidebar, /deriveNavigationSummary/);
});

test("malformed workspace and platform events cross the real preload into one safe diagnostic sink", async () => {
  const exposed = {};
  const transportListeners = new Map();
  const preload = fs.readFileSync(
    path.resolve(__dirname, "../desktop/preload.js"),
    "utf8",
  );
  vm.runInNewContext(preload, {
    require(name) {
      if (name === "electron")
        return {
          contextBridge: {
            exposeInMainWorld(name, value) {
              exposed[name] = value;
            },
          },
          ipcRenderer: {
            invoke() {
              throw new Error("invoke is not used by this event fixture");
            },
            on(channel, listener) {
              transportListeners.set(channel, listener);
            },
            removeListener(channel) {
              transportListeners.delete(channel);
            },
          },
        };
      if (name === "./ipc/contracts/production-registry")
        return { productionIpcRegistry };
      throw new Error(`Unexpected preload dependency: ${name}`);
    },
  });

  const root = path.resolve(__dirname, "../media-workbench/src/features");
  const [
    { createWorkspaceCoordinator },
    sink,
    { routePlatformTransportEvent },
  ] = await Promise.all([
    import(
      pathToFileURL(path.join(root, "workspace/workspace-coordinator.js"))
    ),
    import(
      pathToFileURL(path.join(root, "workspace/runtime-diagnostic-store.js"))
    ),
    import(pathToFileURL(path.join(root, "platform/platform-event-router.js"))),
  ]);
  let sinkNotifications = 0;
  const unsubscribeSink = sink.subscribeRuntimeDiagnostics(() => {
    sinkNotifications += 1;
  });
  const coordinator = createWorkspaceCoordinator({
    subscribe: exposed.desktopConsole.workspaceData.onInvalidated,
    diagnose: (item) => sink.reportRuntimeDiagnostic(item.code, item.category),
  });
  coordinator.start();
  const unsubscribeWorkspaceDiagnostic =
    exposed.desktopConsole.workspaceData.onInvalidationDiagnostic(() =>
      sink.reportRuntimeDiagnostic(
        "WORKSPACE_INVALIDATION_TRANSPORT_REJECTED",
        "workspace-invalidation",
      ),
    );
  const unsubscribePlatform = exposed.desktopConsole.platforms.onState(
    (value) =>
      routePlatformTransportEvent(
        value,
        () => assert.fail("malformed platform event reached feature state"),
        sink.reportRuntimeDiagnostic,
      ),
  );
  const unsubscribePlatformDiagnostic =
    exposed.desktopConsole.platforms.onStateDiagnostic(() =>
      sink.reportRuntimeDiagnostic(
        "PLATFORM_EVENT_TRANSPORT_REJECTED",
        "platform-event",
      ),
    );

  const rawSecret = {
    schemaVersion: 1,
    workspaceRuntimeId: "C:\\private\\workspace",
    revision: Number.NaN,
    scopes: ["futureScope"],
    reasonCode: "ARTICLE_SAVED",
    url: "https://user:password@example.test/article?cookie=secret#body",
    stack: "private stack",
    body: "private article body",
  };
  transportListeners.get("workspace:data-invalidated")(null, rawSecret);
  transportListeners.get("platform-state")(null, rawSecret);

  assert.deepEqual(sink.getRuntimeDiagnosticsSnapshot().slice(-2), [
    {
      code: "WORKSPACE_INVALIDATION_TRANSPORT_REJECTED",
      category: "workspace-invalidation",
    },
    { code: "PLATFORM_EVENT_TRANSPORT_REJECTED", category: "platform-event" },
  ]);
  assert.equal(sinkNotifications, 2);
  assert.doesNotMatch(
    JSON.stringify(sink.getRuntimeDiagnosticsSnapshot()),
    /private|password|cookie|example\.test|article body|stack|futureScope/i,
  );

  unsubscribePlatform();
  unsubscribePlatformDiagnostic();
  unsubscribeWorkspaceDiagnostic();
  coordinator.dispose();
  unsubscribeSink();
  assert.equal(transportListeners.has("workspace:data-invalidated"), false);
  assert.equal(transportListeners.has("platform-state"), false);
});

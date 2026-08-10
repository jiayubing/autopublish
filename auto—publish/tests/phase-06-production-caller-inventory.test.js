const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");
const { loadPreloadHarness } = require("./helpers/preload-harness");
const {
  loadWorkspaceAndPlatformModules,
} = require("./helpers/renderer-production-modules");

const RETIRED_WITHOUT_PRODUCTION_CONSUMER = Object.freeze([
  "attention.getArticleAttention",
  "content.listTemplates",
  "content.listGeneratedArticles",
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
});

test("malformed workspace and platform events cross the real preload into one safe diagnostic sink", async () => {
  const preload = loadPreloadHarness();
  const exposed = preload.api;
  const transportListeners = preload.transportListeners;

  const [
    { createWorkspaceCoordinator },
    sink,
    { routePlatformTransportEvent },
  ] = await loadWorkspaceAndPlatformModules();
  let sinkNotifications = 0;
  const unsubscribeSink = sink.subscribeRuntimeDiagnostics(() => {
    sinkNotifications += 1;
  });
  const coordinator = createWorkspaceCoordinator({
    subscribe: exposed.workspaceData.onInvalidated,
    diagnose: (item) => sink.reportRuntimeDiagnostic(item.code, item.category),
  });
  coordinator.start();
  const unsubscribeWorkspaceDiagnostic =
    exposed.workspaceData.onInvalidationDiagnostic(() =>
      sink.reportRuntimeDiagnostic(
        "WORKSPACE_INVALIDATION_TRANSPORT_REJECTED",
        "workspace-invalidation",
      ),
    );
  const unsubscribePlatform = exposed.platforms.onState((value) =>
    routePlatformTransportEvent(
      value,
      () => assert.fail("malformed platform event reached feature state"),
      sink.reportRuntimeDiagnostic,
    ),
  );
  const unsubscribePlatformDiagnostic = exposed.platforms.onStateDiagnostic(
    () =>
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
  preload.emit("workspace:data-invalidated", rawSecret);
  preload.emit("platform-state", rawSecret);

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

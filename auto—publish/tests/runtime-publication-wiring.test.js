const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { it } = require("node:test");

const { registerIpc } = require("../desktop/ipc/register");
const { createPublicationLedger } = require("../src/publication/publication-ledger");
const { resolveArticleIdentity } = require("../src/publication/article-identity");

it("authenticated IPC assembly rejects a missing main-process publication ledger", function() {
  assert.throws(function() {
    registerIpc({ ipcMain: { handle: () => {} } });
  }, function(error) {
    return error && error.code === "PUBLICATION_LEDGER_REQUIRED";
  });
});

it("production-like IPC assembly exposes the published record through article management", async function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-publication-wiring-"));
  try {
    const ledger = createPublicationLedger({ workspaceRoot: root });
    const reservation = ledger.reserve(resolveArticleIdentity({ clientId: "client-1", articleId: "article-1", title: "Published title" }), { platformId: "toutiao" });
    ledger.markSubmitting(reservation.publicationId, reservation.attemptId);
    ledger.recordOutcome(reservation.publicationId, reservation.attemptId, { status: "published", remoteId: "remote-1" });

    const handlers = new Map();
    const removedHandlers = [];
    const taskService = { getState: () => ({}), refreshQueueSnapshot: () => ({}), startBatch: () => ({}), stopBatch: () => ({}) };
    const deps = {
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: (channel) => removedHandlers.push(channel) },
      requireAuthenticated: async () => {},
      rootDir: root,
      paths: { workspaceRoot: root, contentLibrary: root, input: path.join(root, ".autopublish", "input"), submissionRecords: path.join(root, ".autopublish", "submission-records") },
      taskService,
      sendToRenderer: () => {},
      aiContentService: { listGeneratedArticles: () => [{ id: "article-1", clientId: "client-1", title: "Published title", status: "saved" }], listTrashedArticles: () => [], listArticleRemovalTransactions: () => [] },
      contentSubmissionService: { listBatches: () => [], listPlatforms: () => [], previewBatch: () => ({}), createBatch: () => ({}) },
      publicationLedger: ledger,
      platformSettingsService: {},
      aiProviderService: {},
      contentGenerationBatchService: { get: () => null },
      doubaoCollectionService: {},
      runtimeDiagnosticsService: {}
    };
    const registration = registerIpc(deps);
    assert.equal(typeof registration.dispose, "function");
    assert.equal(Object.prototype.hasOwnProperty.call(deps, "archiveService"), false);

    const history = await handlers.get("publication:list-for-articles")({}, { clientId: "client-1", articleIds: ["article-1"] });
    const snapshot = await handlers.get("content:get-article-management-snapshot")({}, { clientId: "client-1" });
    assert.equal(history.ok, true);
    assert.equal(history.data[0].publicationId, reservation.publicationId);
    assert.equal(history.data[0].status, "published");
    assert.equal(snapshot.ok, true);
    assert.deepEqual(snapshot.data.publicationRecords.map((record) => [record.publicationId, record.status]), [[reservation.publicationId, "published"]]);
    registration.dispose();
    assert.ok(removedHandlers.includes("content:get-article-management-snapshot"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

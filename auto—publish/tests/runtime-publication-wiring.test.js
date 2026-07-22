const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { it } = require("node:test");

const { registerIpc } = require("../desktop/ipc/register");
const { createPublicationLedger } = require("../src/publication/publication-ledger");
const { resolveArticleIdentity } = require("../src/publication/article-identity");
const { createSubmissionBatchStore } = require("../src/content/submission-batch-store");

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

it("production-like attention IPC retries a persisted local archive failure without changing publication", async function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-attention-archive-"));
  try {
    const paths = { workspaceRoot: root, contentLibrary: root, input: path.join(root, ".autopublish", "input"), submissionRecords: path.join(root, ".autopublish", "submission-records") };
    const ledger = createPublicationLedger({ workspaceRoot: root, paths });
    const reservation = ledger.reserve(resolveArticleIdentity({ clientId: "client-1", articleId: "article-1", title: "Published title" }), { platformId: "toutiao" });
    ledger.markSubmitting(reservation.publicationId, reservation.attemptId);
    ledger.recordOutcome(reservation.publicationId, reservation.attemptId, { status: "published", remoteId: "remote-1" });
    const batches = createSubmissionBatchStore({ workspaceRoot: root, directory: paths.submissionRecords });
    batches.save({
      id: "batch-1", clientId: "client-1", status: "completed", createdAt: "2026-07-23T00:00:00.000Z", updatedAt: "2026-07-23T00:00:00.000Z",
      items: [{ articleId: "article-1", targetPlatformId: "toutiao", publicationId: reservation.publicationId, attemptId: reservation.attemptId, status: "published", publicationStatus: "published", localArchive: { status: "failed", errorCode: "PUBLISHED_ARCHIVE_CONFLICT", updatedAt: "2026-07-23T00:00:00.000Z" } }]
    });
    const archiveCalls = [];
    const archiveService = { retryArchive: function(item) {
      archiveCalls.push(item);
      batches.updateLocalArchive(item.batchId, { publicationId: item.publicationId, attemptId: item.attemptId, targetPlatformId: item.platformId }, { status: "archived", errorCode: null, updatedAt: "2026-07-23T00:01:00.000Z" });
      return { status: "archived", domainHandled: true, changedScopes: ["articleAttention"] };
    } };
    const submission = {
      listBatches: () => [], listPlatforms: () => [], previewBatch: () => ({}), createBatch: () => ({}),
      listArchiveFailures: () => batches.list().flatMap((batch) => batch.items.filter((item) => item.localArchive && item.localArchive.status === "failed").map((item) => ({ batchId: batch.id, clientId: batch.clientId, articleId: item.articleId, publicationId: item.publicationId, attemptId: item.attemptId, platformId: item.targetPlatformId, reasonCode: item.localArchive.errorCode })))
    };
    const handlers = new Map();
    registerIpc({
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: () => {} }, requireAuthenticated: async () => {}, rootDir: root, paths,
      taskService: { getState: () => ({}), refreshQueueSnapshot: () => ({}), startBatch: () => ({}), stopBatch: () => ({}) }, sendToRenderer: () => {},
      aiContentService: { listGeneratedArticles: () => [{ id: "article-1", clientId: "client-1", title: "Published title", status: "saved" }], listTrashedArticles: () => [], listArticleRemovalTransactions: () => [] },
      contentSubmissionService: submission, publicationLedger: ledger, archiveActionPort: archiveService, platformSettingsService: {}, aiProviderService: {}, contentGenerationBatchService: { get: () => null }, doubaoCollectionService: {}, runtimeDiagnosticsService: {}
    });
    const listed = await handlers.get("content:list-article-attention")({}, {});
    assert.equal(listed.ok, true);
    const attention = listed.data.items.find((item) => item.kind === "published_archive_failed");
    assert.ok(attention);
    assert.ok(attention.allowedActions.includes("retry-archive"));
    const fetched = await handlers.get("content:get-article-attention")({}, { attentionId: attention.attentionId });
    assert.equal(fetched.ok, true);
    assert.equal(fetched.data.attentionId, attention.attentionId);
    const preview = await handlers.get("content:preview-article-attention")({}, { attentionId: attention.attentionId, action: "retry-archive" });
    assert.equal(preview.ok, true);
    const resolved = await handlers.get("content:resolve-article-attention")({}, { attentionId: attention.attentionId, action: "retry-archive", expectedRevision: listed.data.revision, confirmed: true });
    assert.equal(resolved.ok, true);
    assert.equal(archiveCalls.length, 1);
    assert.equal(ledger.get(reservation.publicationId).status, "published");
    assert.equal(batches.get("batch-1").items[0].localArchive.status, "archived");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

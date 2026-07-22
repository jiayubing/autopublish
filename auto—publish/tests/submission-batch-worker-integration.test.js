const { describe, it, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { DIRS } = require("../scripts/config");
const { createArticleStore } = require("../src/content/article-store");
const { createSubmissionBatchStore } = require("../src/content/submission-batch-store");
const { createContentSubmissionService } = require("../desktop/services/content-submission-service");
const { createPlatformWorkbenchService } = require("../desktop/services/platform-workbench-service");
const { createArticleAttentionQuery } = require("../desktop/services/article-attention-query");
const { createArticleAttentionResolver } = require("../desktop/services/article-attention-resolver");
const { createPublicationLedger } = require("../src/publication/publication-ledger");
const { clearStopSignal, requestStopSignal } = require("../src/core/stop-signal");

test("retries an active saved failed publication through the submission service", () => {
  const value = harness({ status: "failed", errorCode: "REMOTE_REJECTED" });
  try {
    const first = createBatch(value);
    const item = first.items.find((candidate) => candidate.publicationId);
    const record = value.publicationLedger.get(item.publicationId);
    value.publicationLedger.markSubmitting(record.publicationId, item.attemptId);
    value.publicationLedger.recordOutcome(record.publicationId, item.attemptId, { status: "failed", errorCode: "REMOTE_REJECTED" });
    const batchStore = createSubmissionBatchStore({ workspaceRoot: value.root, directory: value.paths.submissionRecords });
    batchStore.updateItem(first.batchId, { publicationId: item.publicationId, attemptId: item.attemptId, targetPlatformId: PLATFORM_ID }, { status: "failed", publicationStatus: "failed", errorCode: "REMOTE_REJECTED" });
    [item.filePath, item.sidecarPath].forEach((filename) => { if (fs.existsSync(filename)) fs.unlinkSync(filename); });

    const preview = value.submission.previewRetryFailedPublication({ publicationId: item.publicationId });
    assert.equal(preview.requiresConfirmation, true);
    assert.equal(preview.failureCount, 1);
    assert.equal(preview.targetPlatformId, PLATFORM_ID);

    const retried = value.submission.retryFailedPublication({ publicationId: item.publicationId, confirmed: true });
    assert.ok(retried.batchId);
    assert.equal(retried.publicationId, item.publicationId);
    assert.notEqual(retried.attemptId, item.attemptId);
    assert.equal(value.publicationLedger.get(item.publicationId).status, "queued");
  } finally {
    dispose(value);
  }
});

const CLIENT_ID = "client-1";
const ARTICLE_ID = "article-1";
const PLATFORM_ID = "toutiao";
const PLATFORM = { id: PLATFORM_ID, scanDir: PLATFORM_ID, contentQueueImport: true };
const previousTmpDir = DIRS.tmpDir;

function article() {
  return {
    id: ARTICLE_ID,
    clientId: CLIENT_ID,
    researchQueryIds: ["query-1"],
    researchSnapshots: [{
      questionId: "query-1",
      question: "Question",
      answerText: "Answer",
      references: [],
      collectedAt: "2026-07-11T00:00:00.000Z",
      collectionMethod: "automatic"
    }],
    platform: "toutiao",
    scenario: "guide",
    templateId: "template-1",
    title: "Title article-1",
    content: "Body article-1",
    status: "saved",
    source: { client_material: true, doubao_answer: true, references: false, template: true },
    materialSnapshots: [{ id: "material-1", name: "资料", extension: ".md", content: "资料", contentHash: "material-hash", source: "text" }],
    templateSnapshot: { platform: PLATFORM_ID, id: "template-1", name: "模板", scenario: "guide", body: "模板正文", bodyHash: "template-hash" },
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z"
  };
}

function pathsFor(root) {
  return {
    input: path.join(root, ".autopublish", "input"),
    submissionRecords: path.join(root, ".autopublish", "submission-records"),
    published: path.join(root, ".autopublish", "published"),
    failed: path.join(root, ".autopublish", "failed"),
    tmp: path.join(root, ".autopublish", "tmp"),
    logs: path.join(root, ".autopublish", "logs")
  };
}

function fakeAdapter(initialOutcome, hooks) {
  let outcome = initialOutcome;
  const calls = [];
  const callbacks = hooks || {};
  return {
    id: PLATFORM_ID,
    calls,
    setOutcome(nextOutcome) { outcome = nextOutcome; },
    parseArticleFiles(items) {
      return items.map((item) => ({
        title: "Title article-1",
        body: "Body article-1",
        sourceFile: item.filePath,
        filename: item.filename
      }));
    },
    ensureSession() {
      if (callbacks.ensureSession) callbacks.ensureSession();
    },
    async ensureLoggedIn(options) {
      if (callbacks.ensureLoggedIn) await callbacks.ensureLoggedIn(options);
    },
    async publishArticle(articleValue, options) {
      calls.push({ article: articleValue, options });
      if (callbacks.publishArticle) return callbacks.publishArticle(articleValue, options);
      return outcome;
    },
    closeSession() {}
  };
}

function harness(outcome, hooks) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "submission-batch-worker-"));
  const paths = pathsFor(root);
  DIRS.tmpDir = paths.tmp;
  clearStopSignal(paths.tmp);

  const articleStore = createArticleStore(root);
  articleStore.saveArticle(article());
  const publicationLedger = createPublicationLedger({ workspaceRoot: root, paths });
  const platforms = [PLATFORM];
  const submission = createContentSubmissionService({
    workspaceRoot: root,
    paths,
    articleStore,
    platforms,
    publicationLedger
  });
  const adapter = fakeAdapter(outcome, hooks);
  const workbench = createPlatformWorkbenchService({
    rootDir: root,
    paths,
    platforms,
    publicationLedger,
    adapters: { [PLATFORM_ID]: adapter }
  });

  return { root, paths, submission, publicationLedger, adapter, workbench };
}

function dispose(value) {
  clearStopSignal(value.paths.tmp);
  DIRS.tmpDir = previousTmpDir;
  fs.rmSync(value.root, { recursive: true, force: true });
}

function createBatch(value) {
  return value.submission.createBatch({
    clientId: CLIENT_ID,
    articleIds: [ARTICLE_ID],
    targetPlatformIds: [PLATFORM_ID],
    confirmed: true
  });
}

async function executeBatch(value, batch) {
  const item = batch.items[0];
  const plan = value.workbench.buildSelectedPlan({
    selectedArticles: [{
      sourcePlatformId: PLATFORM_ID,
      filename: path.basename(item.filePath)
    }],
    targetPlatformIds: [PLATFORM_ID]
  });
  return value.workbench.submitSelectedPlanSerially(plan, {
    autoSubmit: true,
    interactive: false,
    closeAfterEach: false
  });
}

function currentRecord(value, batch) {
  return value.publicationLedger.get(batch.items[0].publicationId);
}

describe("submission batch and platform worker integration", function() {
  it("writes a failed worker outcome back to both the publication ledger and batch", async function() {
    const value = harness({ status: "failed", errorCode: "FAKE_ADAPTER_FAILED" });
    try {
      const batch = createBatch(value);
      const result = await executeBatch(value, batch);

      assert.equal(result.fail, 1);
      assert.equal(currentRecord(value, batch).status, "failed");
      const persisted = value.submission.getBatch(batch.batchId);
      assert.equal(persisted.status, "failed");
      assert.equal(persisted.items[0].status, "failed");
      assert.equal(persisted.items[0].publicationId, batch.items[0].publicationId);
      assert.equal(persisted.items[0].attemptId, batch.items[0].attemptId);
    } finally {
      dispose(value);
    }
  });

  it("writes a successful worker outcome back to the batch without losing the published ledger result", async function() {
    const value = harness({ status: "published", remoteId: "remote-success" });
    try {
      const batch = createBatch(value);
      const result = await executeBatch(value, batch);

      assert.equal(result.ok, 1);
      assert.equal(currentRecord(value, batch).status, "published");
      const persisted = value.submission.getBatch(batch.batchId);
      assert.equal(persisted.status, "completed");
      assert.equal(persisted.items[0].status, "published");
      assert.equal(persisted.items[0].remoteId, "remote-success");
    } finally {
      dispose(value);
    }
  });

  it("persists a published archive failure across a rebuilt submission service without changing remote publication", async function() {
    const value = harness({ status: "published", remoteId: "remote-success" });
    try {
      const batch = createBatch(value);
      const item = batch.items[0];
      fs.mkdirSync(value.paths.published, { recursive: true });
      fs.writeFileSync(path.join(value.paths.published, path.basename(item.filePath)), "collision", "utf8");
      const result = await executeBatch(value, batch);
      assert.equal(result.results[0].publicationStatus, "published");
      assert.equal(result.results[0].archiveError, "PUBLISHED_ARCHIVE_CONFLICT");
      assert.equal(currentRecord(value, batch).status, "published");
      const persisted = value.submission.getBatch(batch.batchId).items[0];
      assert.deepEqual(persisted.localArchive.status, "failed");
      assert.equal(persisted.localArchive.errorCode, "PUBLISHED_ARCHIVE_CONFLICT");
      const rebuilt = createContentSubmissionService({ workspaceRoot: value.root, paths: value.paths, articleStore: createArticleStore(value.root), platforms: [PLATFORM], publicationLedger: value.publicationLedger });
      const failures = rebuilt.listArchiveFailures();
      assert.equal(failures.length, 1);
      assert.equal(failures[0].publicationId, item.publicationId);
      assert.equal(failures[0].reasonCode, "PUBLISHED_ARCHIVE_CONFLICT");
      fs.unlinkSync(path.join(value.paths.published, path.basename(item.filePath)));
      const retried = value.workbench.retryArchive(failures[0]);
      assert.equal(retried.status, "archived");
      assert.equal(currentRecord(value, batch).status, "published");
      assert.equal(value.submission.getBatch(batch.batchId).items[0].localArchive.status, "archived");
    } finally {
      dispose(value);
    }
  });

  it("retries a persisted archive failure from article attention through the real archive service", async function() {
    const value = harness({ status: "published", remoteId: "remote-success" });
    try {
      const batch = createBatch(value);
      const item = batch.items[0];
      fs.mkdirSync(value.paths.published, { recursive: true });
      fs.writeFileSync(path.join(value.paths.published, path.basename(item.filePath)), "collision", "utf8");
      await executeBatch(value, batch);
      fs.unlinkSync(path.join(value.paths.published, path.basename(item.filePath)));

      const query = createArticleAttentionQuery({ contentSubmissionService: value.submission, archiveService: value.workbench });
      const resolver = createArticleAttentionResolver({ query, archiveService: value.workbench });
      const attention = query.list().items.find((candidate) => candidate.kind === "published_archive_failed");
      const retried = resolver.resolve({ attentionId: attention.attentionId, action: "retry-archive", expectedRevision: query.getRevision(), confirmed: true });

      assert.equal(retried.result.status, "archived");
      assert.equal(currentRecord(value, batch).status, "published");
      assert.equal(value.submission.getBatch(batch.batchId).items[0].localArchive.status, "archived");
    } finally {
      dispose(value);
    }
  });

  it("keeps an uncertain worker result visible in both records", async function() {
    const value = harness({ status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" });
    try {
      const batch = createBatch(value);
      const result = await executeBatch(value, batch);

      assert.equal(result.uncertain, 1);
      assert.equal(currentRecord(value, batch).status, "uncertain");
      const persisted = value.submission.getBatch(batch.batchId);
      assert.equal(persisted.status, "uncertain");
      assert.equal(persisted.items[0].status, "uncertain");
      assert.equal(persisted.items[0].errorCode, "REMOTE_RESULT_UNKNOWN");
    } finally {
      dispose(value);
    }
  });

  it("cancels the queued attempt when stop is requested before the remote call", async function() {
    const value = harness({ status: "published", remoteId: "must-not-be-used" }, {
      ensureLoggedIn: async function() {
        requestStopSignal("test-stop", value.paths.tmp);
      }
    });
    try {
      const batch = createBatch(value);
      const result = await executeBatch(value, batch);

      assert.equal(result.skipped, 1);
      assert.equal(value.adapter.calls.length, 0);
      assert.equal(currentRecord(value, batch).status, "cancelled");
      const persisted = value.submission.getBatch(batch.batchId);
      assert.equal(persisted.status, "cancelled");
      assert.equal(persisted.items[0].status, "cancelled");
    } finally {
      dispose(value);
    }
  });

  it("does not let an old attempt update the newer attempt's batch result", async function() {
    const value = harness({ status: "failed", errorCode: "FAKE_ADAPTER_FAILED" });
    try {
      const first = createBatch(value);
      await executeBatch(value, first);
      assert.equal(value.submission.getBatch(first.batchId).items[0].status, "failed");

      const second = createBatch(value);
      assert.notEqual(second.items[0].attemptId, first.items[0].attemptId);
      value.adapter.setOutcome({ status: "published", remoteId: "remote-retry" });
      await executeBatch(value, second);

      assert.equal(currentRecord(value, second).status, "published");
      assert.equal(value.submission.getBatch(second.batchId).items[0].status, "published");
      assert.equal(value.submission.getBatch(first.batchId).status, "failed");
      assert.equal(value.submission.getBatch(first.batchId).items[0].status, "failed");
    } finally {
      dispose(value);
    }
  });

  it("reconciles a stale queued batch, keeps ordinary cancel unavailable, and permits failed-item cleanup", function() {
    const value = harness({ status: "failed", errorCode: "FAKE_ADAPTER_FAILED" });
    try {
      const batch = createBatch(value);
      const record = currentRecord(value, batch);
      const attemptId = batch.items[0].attemptId;
      value.publicationLedger.markSubmitting(record.publicationId, attemptId);
      value.publicationLedger.recordOutcome(record.publicationId, attemptId, {
        status: "failed",
        errorCode: "FAKE_ADAPTER_FAILED"
      });

      const rawBatchStore = createSubmissionBatchStore({ workspaceRoot: value.root, directory: value.paths.submissionRecords });
      assert.equal(rawBatchStore.get(batch.batchId).status, "queued");
      assert.equal(value.publicationLedger.get(record.publicationId).status, "failed");

      value.submission.reconcileBatch(batch.batchId);
      const reconciled = value.submission.getBatch(batch.batchId);
      assert.equal(reconciled.status, "failed");
      assert.equal(reconciled.items[0].status, "failed");

      const cancelPreview = value.submission.previewCancelBatch({ batchId: batch.batchId });
      assert.equal(cancelPreview.allowedCount, 0);
      const cancelPlan = value.submission.previewCancelBatch({ batchId: batch.batchId });
      const cancelResult = value.submission.cancelBatch({ batchId: batch.batchId, planId: cancelPlan.planId, confirmed: true });
      assert.equal(cancelResult.cancelledCount, 0);
      assert.equal(fs.existsSync(batch.items[0].filePath), true);

      const cleanupPreview = value.submission.previewCleanupFailedItems({ batchId: batch.batchId });
      assert.equal(cleanupPreview.cleanableCount, 1);
      const cleanupResult = value.submission.cleanupFailedItems({ batchId: batch.batchId, confirmed: true });
      assert.equal(cleanupResult.cleanedCount, 1);
      assert.equal(fs.existsSync(batch.items[0].filePath), false);
      assert.equal(fs.existsSync(batch.items[0].sidecarPath), false);
      assert.equal(value.submission.getBatch(batch.batchId).items[0].status, "failed-cleaned");
      assert.equal(value.publicationLedger.get(record.publicationId).status, "failed");
    } finally {
      dispose(value);
    }
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createArticleStore } = require("../src/content/article-store");
const { createContentSubmissionService } = require("../desktop/services/content-submission-service");
const { createPlatformWorkbenchService } = require("../desktop/services/platform-workbench-service");
const { createPublicationLedger } = require("../src/publication/publication-ledger");
const { createSubmissionBatchStore } = require("../src/content/submission-batch-store");

const CLIENT_ID = "client-1";
const ARTICLE_ID = "attempt-rebind-article";
const PLATFORM_ID = "hepan";

function article() {
  return {
    id: ARTICLE_ID,
    clientId: CLIENT_ID,
    researchQueryIds: ["query-1"],
    researchSnapshots: [{ questionId: "query-1", question: "Question", answerText: "Answer", references: [], collectedAt: "2026-07-18T00:00:00.000Z", collectionMethod: "fixture" }],
    platform: PLATFORM_ID,
    scenario: "guide",
    templateId: "template-1",
    title: "Attempt rebind title",
    content: "Attempt rebind body",
    status: "saved",
    source: { client_material: true, doubao_answer: true, references: false, template: true },
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z"
  };
}

function fixture(options) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "submission-attempt-rebind-"));
  const paths = {
    input: path.join(root, ".autopublish", "input"),
    submissionRecords: path.join(root, ".autopublish", "submission-records"),
    published: path.join(root, ".autopublish", "published"),
    tmp: path.join(root, ".autopublish", "tmp")
  };
  const articleStore = createArticleStore(root);
  articleStore.saveArticle(article());
  const platform = { id: PLATFORM_ID, scanDir: PLATFORM_ID, contentQueueImport: true };
  const ledger = createPublicationLedger({ workspaceRoot: root, paths });
  const rawBatchStore = createSubmissionBatchStore({ workspaceRoot: root, directory: paths.submissionRecords });
  const batchStore = options && options.failRebind ? Object.assign({}, rawBatchStore, {
    rebindAttempt() {
      const error = new Error("fixture rebind write failed");
      error.code = "SUBMISSION_BATCH_REBIND_CONFLICT";
      throw error;
    }
  }) : rawBatchStore;
  const submission = createContentSubmissionService({ workspaceRoot: root, paths, articleStore, platforms: [platform], publicationLedger: ledger, batchStore });
  let outcome = { status: "failed", errorCode: "FIXTURE_FAILED" };
  const adapter = {
    calls: [],
    sidecarAtRemote: null,
    parseArticleFiles(items) { return items.map((item) => ({ title: article().title, body: article().content, sourceFile: item.filePath, filename: item.filename })); },
    ensureSession() {},
    async ensureLoggedIn() {},
    async publishArticle(value, options) {
      this.calls.push({ value, options });
      if (this.calls.length === 2) this.sidecarAtRemote = JSON.parse(fs.readFileSync(value.sourceFile + ".submission.json", "utf8"));
      return outcome;
    },
    closeSession() {},
    setOutcome(value) { outcome = value; }
  };
  const workbench = createPlatformWorkbenchService({ rootDir: root, paths, platforms: [platform], publicationLedger: ledger, submissionBatchStore: batchStore, adapters: { [PLATFORM_ID]: adapter } });
  return { root, paths, ledger, submission, adapter, workbench };
}

async function execute(fixtureValue, filename) {
  const plan = fixtureValue.workbench.buildSelectedPlan({
    selectedArticles: [{ sourcePlatformId: PLATFORM_ID, filename }],
    targetPlatformIds: [PLATFORM_ID]
  });
  return fixtureValue.workbench.submitSelectedPlanSerially(plan, { autoSubmit: true, interactive: false, closeAfterEach: false });
}

describe("submission attempt rebind regression", () => {
  it("rebinds the same queue pair to the new attempt before retrying the remote call", async () => {
    const current = fixture();
    try {
      const first = current.submission.createBatch({ clientId: CLIENT_ID, articleIds: [ARTICLE_ID], targetPlatformIds: [PLATFORM_ID], confirmed: true });
      const filename = path.basename(first.items[0].filePath);
      const firstResult = await execute(current, filename);
      assert.equal(firstResult.fail, 1);
      assert.equal(current.submission.getBatch(first.batchId).items[0].status, "failed");

      current.adapter.setOutcome({ status: "published", remoteId: "retry-success" });
      const secondResult = await execute(current, filename);
      const record = current.ledger.get(first.items[0].publicationId);
      const batch = current.submission.getBatch(first.batchId);
      const sidecar = current.adapter.sidecarAtRemote;

      assert.equal(secondResult.ok, 1);
      assert.equal(record.attempts.length, 2);
      assert.equal(batch.items[0].attemptId, record.attempts[1].attemptId);
      assert.equal(sidecar.attemptId, record.attempts[1].attemptId);
      assert.equal(batch.items[0].status, "published");
      assert.equal(batch.items[0].remoteId, "retry-success");
      assert.equal(secondResult.results[0].attemptId, record.attempts[1].attemptId);
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("cancels a new reservation and skips the remote call when rebind cannot persist", async () => {
    const current = fixture({ failRebind: true });
    try {
      const first = current.submission.createBatch({ clientId: CLIENT_ID, articleIds: [ARTICLE_ID], targetPlatformIds: [PLATFORM_ID], confirmed: true });
      const filename = path.basename(first.items[0].filePath);
      await execute(current, filename);
      current.adapter.setOutcome({ status: "published", remoteId: "must-not-run" });

      const result = await execute(current, filename);
      const record = current.ledger.get(first.items[0].publicationId);
      const sidecar = JSON.parse(fs.readFileSync(first.items[0].sidecarPath, "utf8"));
      const batch = current.submission.getBatch(first.batchId);

      assert.equal(result.fail, 1);
      assert.equal(result.results[0].error, "SUBMISSION_BATCH_REBIND_CONFLICT");
      assert.equal(current.adapter.calls.length, 1);
      assert.equal(record.attempts.length, 2);
      assert.equal(record.status, "cancelled");
      assert.equal(batch.items[0].attemptId, first.items[0].attemptId);
      assert.equal(sidecar.attemptId, first.items[0].attemptId);
      assert.equal(fs.existsSync(first.items[0].filePath), true);
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createArticleStore } = require("../src/content/article-store");
const { createContentSubmissionService } = require("../desktop/services/content-submission-service");
const { createArticleRemovalService } = require("../src/content/article-removal-service");
const { createArticleRemovalTransactionStore } = require("../src/content/article-removal-transaction-store");
const { createArticleTrashService } = require("../src/content/article-trash-service");
const { createPublicationLedger } = require("../src/publication/publication-ledger");

const selection = { clientId: "client-1", articleId: "removal-regression" };

function article() {
  return {
    id: selection.articleId,
    clientId: selection.clientId,
    researchQueryIds: ["query-1"],
    researchSnapshots: [{ questionId: "query-1", question: "Question", answerText: "Answer", references: [], collectedAt: "2026-07-18T00:00:00.000Z", collectionMethod: "fixture" }],
    platform: "hepan",
    scenario: "guide",
    templateId: "template-1",
    title: "Removal regression title",
    content: "Removal regression body",
    status: "saved",
    source: { client_material: true, doubao_answer: true, references: false, template: true },
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z"
  };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "article-removal-regression-"));
  const paths = {
    input: path.join(root, ".autopublish", "input"),
    submissionRecords: path.join(root, ".autopublish", "submission-records")
  };
  const articleStore = createArticleStore(root);
  articleStore.saveArticle(article());
  const platform = { id: "hepan", scanDir: "hepan", contentQueueImport: true };
  const ledger = createPublicationLedger({ workspaceRoot: root, paths });
  const submission = createContentSubmissionService({ workspaceRoot: root, paths, articleStore, platforms: [platform], publicationLedger: ledger });
  const batch = submission.createBatch({ clientId: selection.clientId, articleIds: [selection.articleId], targetPlatformIds: [platform.id], confirmed: true });
  const first = batch.items[0];
  for (let index = 0; index < 3; index += 1) {
    ledger.markSubmitting(first.publicationId, (ledger.get(first.publicationId).attempts.at(-1)).attemptId);
    ledger.recordOutcome(first.publicationId, ledger.get(first.publicationId).attempts.at(-1).attemptId, { status: "failed", errorCode: "FIXTURE_FAILED" });
    if (index < 2) ledger.reserve({ articleKey: ledger.get(first.publicationId).articleKey, clientId: selection.clientId, articleId: selection.articleId, contentHash: ledger.get(first.publicationId).contentHash }, { platformId: platform.id });
  }
  const transactionStore = createArticleRemovalTransactionStore({ workspaceRoot: root });
  return { root, paths, articleStore, ledger, submission, batch, transactionStore, platform };
}

function removal(current, overrides) {
  return createArticleRemovalService(Object.assign({
    workspaceRoot: current.root,
    articleStore: current.articleStore,
    submissionService: current.submission,
    transactionStore: current.transactionStore
  }, overrides || {}));
}

describe("article removal recovery regression", () => {
  it("returns per-item residue cleanup failures and recomputes the remaining disk state", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "residue-result-regression-"));
    const removedIds = new Set(["residue-clean", "residue-fail"]);
    const records = new Map();
    const batches = [];
    let failingAttemptId = null;
    const batchStore = {
      list: () => batches,
      get: () => batches[0],
      updateItem(batchId, identity, transition) {
        if (identity.attemptId === failingAttemptId) {
          const error = new Error("fixture batch write failed");
          error.code = "SUBMISSION_BATCH_WRITE_FAILED";
          throw error;
        }
        const item = batches.find((batch) => batch.id === batchId).items.find((candidate) => candidate.publicationId === identity.publicationId && candidate.attemptId === identity.attemptId);
        Object.assign(item, transition);
        return batches[0];
      }
    };
    const articleStore = {
      isArticleRemoved: (_clientId, articleId) => removedIds.has(articleId),
      getArticle: (_clientId, articleId) => article(articleId)
    };
    const publicationLedger = { get: (publicationId) => records.get(publicationId) };
    try {
      const items = ["residue-clean", "residue-fail"].map((articleId, index) => {
        const filePath = path.join(root, ".autopublish", "input", "hepan", `${articleId}.md`);
        const sidecarPath = filePath + ".submission.json";
        const content = `# ${articleId}\n\nbody`;
        const contentHash = require("node:crypto").createHash("sha256").update(content).digest("hex");
        const publicationId = `publication-${index}`;
        const attemptId = `attempt-${index}`;
        records.set(publicationId, { publicationId, platformId: "hepan", status: "failed", attempts: [{ attemptId, status: "failed" }], titleSnapshot: articleId });
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, "utf8");
        fs.writeFileSync(sidecarPath, JSON.stringify({ version: 2, submissionBatchId: "residue-batch", generatedArticleId: articleId, clientId: "client-1", targetPlatformId: "hepan", contentHash, publicationId, attemptId }), "utf8");
        return { articleId, targetPlatformId: "hepan", contentHash, status: "failed", publicationStatus: "failed", filePath, sidecarPath, publicationId, attemptId };
      });
      failingAttemptId = items[1].attemptId;
      batches.push({ id: "residue-batch", clientId: "client-1", status: "failed", createdAt: "2026-07-18T00:00:00.000Z", items });
      const submission = createContentSubmissionService({ workspaceRoot: root, articleStore, batchStore, publicationLedger, platforms: [{ id: "hepan", scanDir: "hepan", contentQueueImport: true }] });

      const before = submission.previewTrashedArticleQueueResidue();
      const result = submission.cleanupTrashedArticleQueueResidue({ confirmed: true });

      assert.equal(before.cleanableCount, 2);
      assert.equal(result.status, "failed");
      assert.equal(result.cleanedCount, 1);
      assert.equal(result.failedCount, 1);
      assert.equal(result.remainingCount, 1);
      assert.equal(result.items.find((item) => item.publicationId === "publication-1").reasonCode, "SUBMISSION_BATCH_WRITE_FAILED");
      assert.equal(fs.existsSync(items[0].filePath), false);
      assert.equal(fs.existsSync(items[1].filePath), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("executes a failed cleanup whose queue pair points to a historical failed attempt", () => {
    const current = fixture();
    try {
      const preview = current.submission.previewArticleRemovalImpact({ selections: [selection] });
      assert.equal(preview.failedToClean.length, 1);
      const result = current.submission.cleanupArticleSubmissionItem(preview.failedToClean[0]);
      assert.equal(result.status, "failed-cleaned");
      assert.equal(fs.existsSync(current.batch.items[0].filePath), false);
      assert.equal(current.submission.getBatch(current.batch.batchId).items[0].status, "failed-cleaned");
      assert.equal(current.ledger.get(current.batch.items[0].publicationId).status, "failed");
      assert.equal(current.ledger.get(current.batch.items[0].publicationId).attempts.length, 3);
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("revalidates and completes a needs_repair journal after the evaluator is fixed", () => {
    const current = fixture();
    try {
      const preview = current.submission.previewArticleRemovalImpact({ selections: [selection] });
      const action = Object.assign({}, preview.failedToClean[0], { action: "cleanup" });
      const transaction = {
        version: 1,
        id: "needs-repair-regression",
        kind: "article-removal",
        status: "pending_recovery",
        phase: "needs_repair",
        errorCode: "PUBLICATION_ATTEMPT_MISMATCH",
        createdAt: "2026-07-18T00:00:00.000Z",
        updatedAt: "2026-07-18T00:00:00.000Z",
        selections: [selection],
        articles: [{ clientId: selection.clientId, articleId: selection.articleId, titleSnapshot: article().title, state: "available" }],
        queueActions: [action],
        queueCursor: 0,
        articleCursor: 0,
        queueResults: []
      };
      current.transactionStore.save(transaction);
      const result = removal(current).recoverPendingRemovals();
      assert.equal(result[0].status, "committed");
      assert.equal(result[0].phase, "committed");
      assert.equal(current.articleStore.listTrashedArticles(selection.clientId).length, 1);
      assert.equal(current.transactionStore.list().length, 0);
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("re-evaluates a stale needs_repair cleanup after both queue files disappear and consumes idempotent completion", () => {
    const current = fixture();
    try {
      const initialPreview = current.submission.previewArticleRemovalImpact({ selections: [selection] });
      const staleAction = Object.assign({}, initialPreview.failedToClean[0], { action: "cleanup" });
      const item = current.batch.items[0];
      fs.rmSync(item.filePath, { force: true });
      fs.rmSync(item.sidecarPath, { force: true });
      const transaction = {
        version: 1,
        id: "needs-repair-both-absent",
        kind: "article-removal",
        status: "needs_repair",
        phase: "needs_repair",
        errorCode: "SUBMISSION_QUEUE_CHANGED",
        createdAt: "2026-07-18T00:00:00.000Z",
        updatedAt: "2026-07-18T00:00:00.000Z",
        selections: [selection],
        articles: [{ clientId: selection.clientId, articleId: selection.articleId, titleSnapshot: article().title, state: "available" }],
        queueActions: [staleAction],
        queueCursor: 0,
        articleCursor: 0,
        queueResults: []
      };
      current.transactionStore.save(transaction);
      const service = removal(current);
      const result = service.retryArticleRemovalTransaction({ transactionId: transaction.id, confirmed: true });
      assert.equal(result.status, "committed");
      assert.equal(result.phase, "committed");
      assert.equal(result.resolutionCode, "ARTICLE_REMOVAL_COMMITTED");
      assert.equal(current.articleStore.listTrashedArticles(selection.clientId).length, 1);
      assert.equal(current.transactionStore.list().length, 0);

      const repeated = service.retryArticleRemovalTransaction({ transactionId: transaction.id, confirmed: true });
      assert.equal(repeated.status, "committed");
      assert.equal(repeated.transactionId, transaction.id);
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("reuses one open transaction for repeated identical removal confirmation", () => {
    const current = fixture();
    try {
      const service = removal(current);
      const trash = createArticleTrashService({ articleStore: current.articleStore, articleRemovalService: service });
      const firstPreview = trash.previewArticleRemovalImpact({ selections: [selection] });
      current.transactionStore.save({
        version: 1,
        id: "open-duplicate-regression",
        kind: "article-removal",
        status: "needs_repair",
        phase: "needs_repair",
        errorCode: "PUBLICATION_ATTEMPT_MISMATCH",
        createdAt: "2026-07-18T00:00:00.000Z",
        updatedAt: "2026-07-18T00:00:00.000Z",
        selections: [selection],
        articles: [{ clientId: selection.clientId, articleId: selection.articleId, titleSnapshot: article().title, state: "available" }],
        queueActions: [Object.assign({}, firstPreview.failedToClean[0], { action: "cleanup" })],
        queueCursor: 0,
        articleCursor: 0,
        queueResults: []
      });
      const first = trash.trashArticles({ selections: [selection], token: firstPreview.token, confirmed: true });
      const secondPreview = trash.previewArticleRemovalImpact({ selections: [selection] });
      const second = trash.trashArticles({ selections: [selection], token: secondPreview.token, confirmed: true });
      assert.equal(first.status, "needs_repair");
      assert.equal(second.transactionId, first.transactionId);
      assert.equal(current.transactionStore.list().length, 1);
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });
});

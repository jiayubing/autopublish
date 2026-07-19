const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createArticleStore } = require("../src/content/article-store");
const { createContentSubmissionService } = require("../desktop/services/content-submission-service");
const { createArticleTrashService } = require("../src/content/article-trash-service");
const { createPublicationLedger } = require("../src/publication/publication-ledger");
const { cancelReservation } = require("../src/content/submission-export-service");

function article(id) {
  return {
    id,
    clientId: "client-1",
    researchQueryIds: ["query-1"],
    researchSnapshots: [{ questionId: "query-1", question: "Question", answerText: "Answer", references: [], collectedAt: "2026-07-18T00:00:00.000Z", collectionMethod: "fixture" }],
    platform: "hepan",
    scenario: "guide",
    templateId: "template-1",
    title: `Published ${id}`,
    content: `Body ${id}`,
    status: "saved",
    source: { client_material: true, doubao_answer: true, references: false, template: true },
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z"
  };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "published-article-trash-"));
  const store = createArticleStore(root);
  const platforms = ["hepan", "toutiao", "lieju"].map((id) => ({ id, scanDir: id, contentQueueImport: true }));
  const ledger = createPublicationLedger({ workspaceRoot: root });
  const submission = createContentSubmissionService({ workspaceRoot: root, articleStore: store, platforms, publicationLedger: ledger });
  const targetSets = [["hepan", "toutiao", "lieju"], ["hepan", "toutiao", "lieju"], ["hepan", "toutiao", "lieju"], ["hepan"]];
  const batches = [];
  targetSets.forEach((targets, index) => {
    const value = article(`published-${index + 1}`);
    store.saveArticle(value);
    const batch = submission.createBatch({ clientId: value.clientId, articleIds: [value.id], targetPlatformIds: targets, confirmed: true });
    batch.items.forEach((item) => {
      const record = ledger.get(item.publicationId);
      const attemptId = record.attempts.at(-1).attemptId;
      ledger.markSubmitting(item.publicationId, attemptId);
      ledger.recordOutcome(item.publicationId, attemptId, { status: "published", remoteId: `remote-${item.publicationId}` });
    });
    batches.push(batch);
  });
  return { root, store, ledger, submission, trash: createArticleTrashService({ workspaceRoot: root, articleStore: store, submissionService: submission }), batches };
}

describe("published article trash lifecycle", () => {
  it("moves four published articles and ten terminal targets without queue conflict", () => {
    const current = fixture();
    try {
      const selections = [1, 2, 3, 4].map((index) => ({ clientId: "client-1", articleId: `published-${index}` }));
      const preview = current.trash.previewArticleRemovalImpact({ selections });
      assert.equal(preview.blockedItems.length, 0);
      assert.equal(preview.publishedToClean.length, 10);
      assert.equal(preview.canCommit, true);
      const result = current.trash.trashArticles({ selections, token: preview.token, confirmed: true });
      assert.equal(result.status, "committed");
      assert.equal(current.store.listTrashedArticles("client-1").length, 4);
      assert.equal(current.submission.previewArticleRemovalImpact({ selections }).blockedItems.length, 0);
      current.batches.flatMap((batch) => batch.items).forEach((item) => {
        const record = current.ledger.get(item.publicationId);
        assert.equal(record.status, "published");
        assert.equal(record.attempts.length, 1);
        assert.equal(fs.existsSync(item.filePath), false);
        assert.equal(fs.existsSync(item.sidecarPath), false);
      });
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("keeps active and uncertain targets blocked", () => {
    const current = fixture();
    try {
      const articleValue = article("active-target");
      current.store.saveArticle(articleValue);
      const batch = current.submission.createBatch({ clientId: "client-1", articleIds: [articleValue.id], targetPlatformIds: ["hepan"], confirmed: true });
      const item = batch.items[0];
      const record = current.ledger.get(item.publicationId);
      current.ledger.markSubmitting(item.publicationId, record.attempts.at(-1).attemptId);
      const preview = current.trash.previewArticleRemovalImpact({ selections: [{ clientId: "client-1", articleId: articleValue.id }] });
      assert.equal(preview.canCommit, false);
      assert.equal(preview.blockedItems[0].reasonCode, "ARTICLE_SUBMISSION_ACTIVE");
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("cleans a cancelled local pair without changing the cancelled ledger history", () => {
    const current = fixture();
    try {
      const value = article("cancelled-target");
      current.store.saveArticle(value);
      const batch = current.submission.createBatch({ clientId: "client-1", articleIds: [value.id], targetPlatformIds: ["hepan"], confirmed: true });
      const item = batch.items[0];
      const record = current.ledger.get(item.publicationId);
      cancelReservation(current.ledger, { publicationId: item.publicationId, attemptId: record.attempts.at(-1).attemptId }, "FIXTURE_CANCELLED");
      const preview = current.trash.previewArticleRemovalImpact({ selections: [{ clientId: "client-1", articleId: value.id }] });
      assert.equal(preview.cancelledToClean.length, 1);
      assert.equal(preview.blockedItems.length, 0);
      const result = current.trash.trashArticles({ selections: preview.selections, token: preview.token, confirmed: true });
      assert.equal(result.status, "committed");
      assert.equal(current.ledger.get(item.publicationId).status, "cancelled");
      assert.equal(current.submission.getBatch(batch.batchId).items[0].status, "cancelled-cleaned");
      assert.equal(fs.existsSync(item.filePath), false);
      assert.equal(fs.existsSync(item.sidecarPath), false);
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });
});

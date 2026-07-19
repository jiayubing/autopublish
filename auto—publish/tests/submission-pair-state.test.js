const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { inspectSubmissionPair } = require("../src/content/submission-export-service");
const { createArticleStore } = require("../src/content/article-store");
const { createContentSubmissionService } = require("../desktop/services/content-submission-service");
const { createPublicationLedger } = require("../src/publication/publication-ledger");

const platform = { id: "hepan", scanDir: "hepan", contentQueueImport: true };

function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

function pairFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "submission-pair-state-"));
  const filePath = path.join(root, ".autopublish", "input", "hepan", "article-a.md");
  const sidecarPath = filePath + ".submission.json";
  const markdown = "# Article A\n\nBody\n";
  const item = {
    clientId: "client-1", articleId: "article-a", targetPlatformId: "hepan",
    contentHash: hash(markdown), publicationId: "publication-a", attemptId: "attempt-a",
    filePath, sidecarPath
  };
  const batch = { id: "batch-a", clientId: "client-1" };
  const sidecar = {
    version: 2, submissionBatchId: batch.id, generatedArticleId: item.articleId,
    clientId: batch.clientId, targetPlatformId: item.targetPlatformId,
    contentHash: item.contentHash, publicationId: item.publicationId, attemptId: item.attemptId
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, markdown, "utf8");
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar), "utf8");
  return { root, filePath, sidecarPath, markdown, item, batch, sidecar };
}

function article() {
  return {
    id: "article-a", clientId: "client-1", title: "Article A", content: "Body", status: "saved",
    researchQueryIds: ["query-1"], researchSnapshots: [{ questionId: "query-1", question: "Question", answerText: "Answer", references: [], collectedAt: "2026-07-18T00:00:00.000Z", collectionMethod: "fixture" }], platform: "hepan", scenario: "guide",
    templateId: "template-1", source: { client_material: true, doubao_answer: true, references: false, template: true },
    materialSnapshots: [{ id: "material-1", name: "资料", extension: ".md", content: "资料", contentHash: "material-hash", source: "text" }],
    templateSnapshot: { platform: "hepan", id: "template-1", name: "模板", scenario: "guide", body: "模板正文", bodyHash: "template-hash" },
    createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z"
  };
}

function submissionFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "submission-pair-service-"));
  const paths = { input: path.join(root, ".autopublish", "input"), submissionRecords: path.join(root, ".autopublish", "submission-records") };
  const articleStore = createArticleStore(root);
  articleStore.saveArticle(article());
  const ledger = createPublicationLedger({ workspaceRoot: root, paths });
  const submission = createContentSubmissionService({ workspaceRoot: root, paths, articleStore, publicationLedger: ledger, platforms: [platform] });
  const batch = submission.createBatch({ clientId: "client-1", articleIds: ["article-a"], targetPlatformIds: [platform.id], confirmed: true });
  return { root, articleStore, ledger, submission, batch };
}

function removePair(item) {
  fs.rmSync(item.filePath, { force: true });
  fs.rmSync(item.sidecarPath, { force: true });
}

describe("submission pair state", function() {
  it("strictly classifies unsafe, missing, changed, and conflicting pairs", function() {
    const current = pairFixture();
    try {
      assert.equal(inspectSubmissionPair(current.item, current.batch, current.sidecar, { rootDir: current.root }).pairState, "intact");

      fs.unlinkSync(current.filePath);
      assert.equal(inspectSubmissionPair(current.item, current.batch, current.sidecar, { rootDir: current.root }).pairState, "main_absent");

      fs.writeFileSync(current.filePath, current.markdown, "utf8");
      fs.unlinkSync(current.sidecarPath);
      assert.equal(inspectSubmissionPair(current.item, current.batch, undefined, { rootDir: current.root }).pairState, "sidecar_absent");

      fs.writeFileSync(current.filePath, "# Article A\n\nChanged\n", "utf8");
      fs.writeFileSync(current.sidecarPath, JSON.stringify(current.sidecar), "utf8");
      assert.equal(inspectSubmissionPair(current.item, current.batch, current.sidecar, { rootDir: current.root }).pairState, "content_changed");

      const conflicting = Object.assign({}, current.sidecar, { targetPlatformId: "other-platform" });
      assert.equal(inspectSubmissionPair(current.item, current.batch, conflicting, { rootDir: current.root }).pairState, "identity_conflict");

      fs.rmSync(current.filePath, { force: true });
      fs.rmSync(current.sidecarPath, { force: true });
      const absent = inspectSubmissionPair(current.item, current.batch, undefined, { rootDir: current.root });
      assert.equal(absent.pairState, "both_absent");
      assert.equal(absent.identityMatched, true);

      const outside = Object.assign({}, current.item, { filePath: path.join(current.root, "..", "outside.md"), sidecarPath: path.join(current.root, "..", "outside.md.submission.json") });
      assert.equal(inspectSubmissionPair(outside, current.batch, undefined, { rootDir: current.root }).pairState, "unsafe_path");
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("uses both_absent for failed historical cleanup across evaluate, preview, apply, and reconcile", function() {
    const current = submissionFixture();
    try {
      const item = current.batch.items[0];
      for (let index = 0; index < 3; index += 1) {
        const record = current.ledger.get(item.publicationId);
        const attemptId = record.attempts.at(-1).attemptId;
        current.ledger.markSubmitting(item.publicationId, attemptId);
        current.ledger.recordOutcome(item.publicationId, attemptId, { status: "failed", errorCode: "FIXTURE_FAILED" });
        if (index < 2) current.ledger.reserve({ articleKey: record.articleKey, clientId: "client-1", articleId: "article-a", contentHash: record.contentHash }, { platformId: platform.id });
      }
      removePair(item);

      const action = { clientId: "client-1", articleId: "article-a", batchId: current.batch.batchId, targetPlatformId: platform.id, publicationId: item.publicationId, attemptId: item.attemptId, action: "cleanup" };
      const evaluated = current.submission.evaluateItemAction(action);
      assert.equal(evaluated.allowed, true);
      assert.equal(evaluated.resolvedState.pairState, "both_absent");

      const preview = current.submission.previewArticleRemovalImpact({ selections: [{ clientId: "client-1", articleId: "article-a" }] });
      assert.equal(preview.failedToClean.length, 1);
      assert.equal(preview.failedToClean[0].pairState, "both_absent");
      const result = current.submission.cleanupArticleSubmissionItem(preview.failedToClean[0]);
      assert.equal(result.idempotent, true);
      assert.equal(result.physicalFilesAlreadyAbsent, true);
      assert.equal(current.submission.getBatch(current.batch.batchId).items[0].status, "failed-cleaned");

      const reconciled = current.submission.reconcileBatch(current.batch.batchId);
      assert.equal(reconciled.items[0].pairState, "both_absent");
      assert.equal(reconciled.items[0].unchanged, false);
      assert.equal(current.ledger.get(item.publicationId).status, "failed");
      assert.equal(current.ledger.get(item.publicationId).attempts.length, 3);
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("cancels a latest queued reservation safely when both queue files are absent", function() {
    const current = submissionFixture();
    try {
      const item = current.batch.items[0];
      removePair(item);
      const preview = current.submission.previewArticleRemovalImpact({ selections: [{ clientId: "client-1", articleId: "article-a" }] });
      assert.equal(preview.queuedToCancel.length, 1);
      assert.equal(preview.queuedToCancel[0].pairState, "both_absent");
      const result = current.submission.cancelArticleSubmissionItem(preview.queuedToCancel[0]);
      assert.equal(result.status, "cancelled");
      assert.equal(result.physicalFilesAlreadyAbsent, true);
      assert.equal(current.ledger.get(item.publicationId).status, "cancelled");
      assert.equal(current.submission.getBatch(current.batch.batchId).items[0].status, "cancelled");
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createArticleStore } = require("../src/content/article-store");
const { createContentSubmissionService } = require("../desktop/services/content-submission-service");
const { createArticleTrashService } = require("../src/content/article-trash-service");
const { createArticleRemovalService } = require("../src/content/article-removal-service");
const { createPublicationLedger } = require("../src/publication/publication-ledger");
const { createPlatformWorkbenchService } = require("../desktop/services/platform-workbench-service");

function article(id, overrides) {
  return Object.assign({
    id,
    clientId: "client-1",
    researchQueryIds: ["query-1"],
    researchSnapshots: [{ questionId: "query-1", question: "Question", answerText: "Answer", references: [], collectedAt: "2026-07-18T00:00:00.000Z", collectionMethod: "manual" }],
    platform: "hepan",
    scenario: "guide",
    templateId: "template-1",
    title: "Lifecycle title",
    content: "Lifecycle body",
    status: "saved",
    source: { client_material: true, doubao_answer: true, references: false, template: true },
    materialSnapshots: [{ id: "material-1", name: "资料", extension: ".md", content: "资料", contentHash: "material-hash", source: "text" }],
    templateSnapshot: { platform: "hepan", id: "template-1", name: "模板", scenario: "guide", body: "模板正文", bodyHash: "template-hash" },
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z"
  }, overrides || {});
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "article-trash-lifecycle-"));
  const store = createArticleStore(root);
  const platforms = [{ id: "hepan", scanDir: "hepan", contentQueueImport: true }];
  const submission = createContentSubmissionService({ workspaceRoot: root, articleStore: store, platforms });
  const trash = createArticleTrashService({ workspaceRoot: root, articleStore: store, submissionService: submission });
  return { root, store, submission, trash, platforms };
}

describe("article trash and submission lifecycle seam", () => {
  it("cancels unchanged queued pairs, removes both files, and preserves title/history", () => {
    const current = fixture();
    try {
      current.store.saveArticle(article("queued-article", { title: "First queued title" }));
      const batch = current.submission.createBatch({ clientId: "client-1", articleIds: ["queued-article"], targetPlatformIds: ["hepan"], confirmed: true });
      const preview = current.trash.previewArticleRemovalImpact({ selections: [{ clientId: "client-1", articleId: "queued-article" }] });
      assert.equal(preview.canCommit, true);
      assert.equal(preview.queuedToCancel.length, 1);
      const result = current.trash.trashArticles({ selections: preview.selections, token: preview.token, confirmed: true });
      assert.equal(result.status, "committed");
      assert.equal(fs.existsSync(batch.items[0].filePath), false);
      assert.equal(fs.existsSync(batch.items[0].sidecarPath), false);
      assert.equal(current.submission.getBatch(batch.batchId).items[0].status, "cancelled");
      assert.equal(current.store.listTrashedArticles("client-1")[0].titleSnapshot, "First queued title");
      assert.equal(createPublicationLedger({ workspaceRoot: current.root }).get(batch.items[0].publicationId).status, "cancelled");
    } finally { fs.rmSync(current.root, { recursive: true, force: true }); }
  });

  it("blocks the whole selection when any target is active", () => {
    const current = fixture();
    try {
      current.store.saveArticle(article("safe"));
      current.store.saveArticle(article("active"));
      const safeBatch = current.submission.createBatch({ clientId: "client-1", articleIds: ["safe"], targetPlatformIds: ["hepan"], confirmed: true });
      const activeBatch = current.submission.createBatch({ clientId: "client-1", articleIds: ["active"], targetPlatformIds: ["hepan"], confirmed: true });
      const ledger = createPublicationLedger({ workspaceRoot: current.root });
      ledger.markSubmitting(activeBatch.items[0].publicationId, activeBatch.items[0].attemptId);
      const preview = current.trash.previewArticleRemovalImpact({ articles: [
        { clientId: "client-1", articleId: "safe" },
        { clientId: "client-1", articleId: "active" }
      ] });
      assert.equal(preview.canCommit, false);
      assert.equal(preview.blockedItems.some((item) => item.articleId === "active"), true);
      assert.equal(fs.existsSync(safeBatch.items[0].filePath), true);
      assert.equal(fs.existsSync(activeBatch.items[0].filePath), true);
      assert.equal(current.store.listTrashedArticles("client-1").length, 0);
    } finally { fs.rmSync(current.root, { recursive: true, force: true }); }
  });

  it("recovers a confirmed transaction forward without recreating cancelled work", () => {
    const current = fixture();
    try {
      current.store.saveArticle(article("recoverable"));
      const batch = current.submission.createBatch({ clientId: "client-1", articleIds: ["recoverable"], targetPlatformIds: ["hepan"], confirmed: true });
      let interrupted = true;
      const removal = createArticleRemovalService({
        workspaceRoot: current.root,
        articleStore: current.store,
        submissionService: current.submission,
        afterQueueAction: () => { if (interrupted) { interrupted = false; throw new Error("INJECTED_CRASH"); } }
      });
      const trash = createArticleTrashService({ articleStore: current.store, articleRemovalService: removal });
      const preview = trash.previewArticleRemovalImpact({ articles: [{ clientId: "client-1", articleId: "recoverable" }] });
      assert.equal(trash.trashArticles({ articles: preview.selections, token: preview.token, confirmed: true }).status, "pending_auto_recovery");
      assert.equal(current.submission.getBatch(batch.batchId).items[0].status, "cancelled");
      assert.equal(removal.recoverPendingRemovals()[0].phase, "committed");
      assert.equal(current.store.listTrashedArticles("client-1").length, 1);
      assert.equal(current.submission.getBatch(batch.batchId).items[0].status, "cancelled");
    } finally { fs.rmSync(current.root, { recursive: true, force: true }); }
  });

  it("marks old trashed-source residue and skips before the adapter remote call", async () => {
    const current = fixture();
    try {
      current.store.saveArticle(article("residue"));
      const batch = current.submission.createBatch({ clientId: "client-1", articleIds: ["residue"], targetPlatformIds: ["hepan"], confirmed: true });
      const original = current.store.getArticle("client-1", "residue");
      current.store.moveArticleToTrash("client-1", "residue", {
        version: 1, deletedAt: new Date().toISOString(), clientId: "client-1", articleId: "residue",
        status: original.status, references: [], titleSnapshot: original.title
      });
      let remoteCalls = 0;
      const workbench = createPlatformWorkbenchService({
        rootDir: current.root,
        paths: { input: path.join(current.root, ".autopublish", "input") },
        platforms: current.platforms,
        adapters: { hepan: { parseArticleFiles: (items) => items.map((item) => ({ filename: item.filename, sourceFile: item.filePath, title: "residue" })), ensureSession: () => { throw new Error("must not prepare adapter"); }, ensureLoggedIn: async () => {}, publishArticle: async () => { remoteCalls += 1; return { status: "published" }; } } }
      });
      const queue = workbench.scanQueue()[0].articles[0];
      assert.equal(queue.sourceArticleState, "trashed");
      const result = await workbench.submitSelectedPlanSerially({ tasks: [{ sourcePlatformId: "hepan", filename: queue.filename, targetPlatformId: "hepan" }] }, { interactive: false });
      assert.equal(remoteCalls, 0);
      assert.equal(result.skipped, 1);
      assert.equal(result.results[0].reasonCode, "SOURCE_ARTICLE_TRASHED");
      assert.equal(current.submission.getBatch(batch.batchId).items[0].status, "queued");
    } finally { fs.rmSync(current.root, { recursive: true, force: true }); }
  });
});

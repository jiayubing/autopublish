const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createArticleStore } = require("../src/content/article-store");
const { createArticleTrashService } = require("../src/content/article-trash-service");
const { createArticleRemovalService } = require("../src/content/article-removal-service");
const { createContentSubmissionService } = require("../desktop/services/content-submission-service");
const { createPublicationLedger } = require("../src/publication/publication-ledger");
const { createAiContentService } = require("../desktop/services/ai-content-service");
const { registerAiContentIpc } = require("../desktop/ipc/ai-content-ipc");

describe("article trash service", function() {
  let root;
  let store;
  let trash;

  function article(id, overrides) {
    return Object.assign({
      id: id,
      clientId: "client-1",
      researchQueryIds: ["query-1"],
      researchSnapshots: [{ questionId: "query-1", question: "Question", answerText: "Answer", references: [], collectedAt: "2026-07-11T00:00:00.000Z", collectionMethod: "manual" }],
      platform: "ctrip",
      scenario: "guide",
      templateId: "template-1",
      title: "A private title",
      content: "A private body that must not enter a tombstone.",
      status: "generated",
      source: { client_material: true, doubao_answer: true, references: false, template: true },
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z"
    }, overrides || {});
  }

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "article-trash-service-"));
    store = createArticleStore(root);
    trash = createArticleTrashService({ articleStore: store, now: function() { return "2026-07-15T12:00:00.000Z"; } });
  });

  afterEach(function() { fs.rmSync(root, { recursive: true, force: true }); });

  it("creates a minimal tombstone, keeps queue copies and records, and restores articles", function() {
    store.saveArticle(article("saved-article", { status: "saved", generationBatchId: "batch-1", generationTaskId: "task-1" }));
    const queueCopy = path.join(root, "input", "toutiao", "saved-article.md");
    const submissionRecord = path.join(root, ".autopublish", "submissions", "submission-1.json");
    fs.mkdirSync(path.dirname(queueCopy), { recursive: true });
    fs.mkdirSync(path.dirname(submissionRecord), { recursive: true });
    fs.writeFileSync(queueCopy, "queue copy", "utf8");
    fs.writeFileSync(submissionRecord, JSON.stringify({ articleId: "saved-article" }), "utf8");

    const result = trash.trashArticles({ articles: [{ clientId: "client-1", articleId: "saved-article" }], confirmed: true });
    assert.equal(result.moved.length, 1);
    assert.deepStrictEqual(trash.listTrashedArticles("client-1"), [
      {
        version: 1,
        deletedAt: "2026-07-15T12:00:00.000Z",
        clientId: "client-1",
        articleId: "saved-article",
        status: "saved",
        titleSnapshot: "A private title",
        references: [
          { type: "generation-batch", id: "batch-1" },
          { type: "generation-task", id: "task-1" }
        ]
      }
    ]);
    const tombstone = trash.listTrashedArticles("client-1")[0];
    assert.equal(Object.prototype.hasOwnProperty.call(tombstone, "title"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(tombstone, "content"), false);
    assert.equal(fs.readFileSync(queueCopy, "utf8"), "queue copy");
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(submissionRecord, "utf8")), { articleId: "saved-article" });

    assert.deepStrictEqual(trash.restoreArticle({ clientId: "client-1", articleId: "saved-article" }), article("saved-article", { status: "saved", generationBatchId: "batch-1", generationTaskId: "task-1" }));
    assert.deepStrictEqual(trash.listTrashedArticles("client-1"), []);
  });

  it("requires a one-time confirmation token before permanent deletion", function() {
    store.saveArticle(article("permanent-article"));
    trash.trashArticles({ articles: [{ clientId: "client-1", articleId: "permanent-article" }], confirmed: true });
    assert.throws(function() {
      trash.permanentlyDeleteArticle({ clientId: "client-1", articleId: "permanent-article" });
    }, function(error) { return error.code === "ARTICLE_PERMANENT_DELETE_CONFIRMATION_REQUIRED"; });
    const confirmation = trash.preparePermanentDelete({ clientId: "client-1", articleId: "permanent-article" });
    assert.equal(typeof confirmation.token, "string");
    assert.throws(function() {
      trash.permanentlyDeleteArticle({ clientId: "client-1", articleId: "permanent-article", token: "wrong" });
    }, function(error) { return error.code === "ARTICLE_PERMANENT_DELETE_CONFIRMATION_INVALID"; });
    assert.deepStrictEqual(trash.permanentlyDeleteArticle({ clientId: "client-1", articleId: "permanent-article", token: confirmation.token }), {
      clientId: "client-1", articleId: "permanent-article", deleted: true, deletedAt: "2026-07-15T12:00:00.000Z"
    });
    assert.deepStrictEqual(trash.listTrashedArticles("client-1"), []);
    assert.throws(function() {
      trash.permanentlyDeleteArticle({ clientId: "client-1", articleId: "permanent-article", token: confirmation.token });
    }, function(error) { return error.code === "ARTICLE_PERMANENT_DELETE_CONFIRMATION_INVALID"; });
  });

  it("keeps only a terminal tombstone after permanent deletion and never restores the article", function() {
    store.saveArticle(article("purged-article", { status: "saved", generationBatchId: "batch-1" }));
    trash.trashArticles({ articles: [{ clientId: "client-1", articleId: "purged-article" }], confirmed: true });
    const confirmation = trash.preparePermanentDelete({ clientId: "client-1", articleId: "purged-article" });
    assert.deepStrictEqual(trash.permanentlyDeleteArticle({
      clientId: "client-1", articleId: "purged-article", token: confirmation.token
    }), {
      clientId: "client-1", articleId: "purged-article", deleted: true, deletedAt: "2026-07-15T12:00:00.000Z"
    });

    const trashRoot = path.join(root, ".autopublish", "article-trash", "client-1");
    const tombstonePath = path.join(trashRoot, "purged-article.tombstone.json");
    assert.equal(fs.existsSync(path.join(trashRoot, "purged-article.json")), false);
    assert.equal(fs.existsSync(path.join(trashRoot, "purged-article.md")), false);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(tombstonePath, "utf8")), {
      version: 1,
      deletedAt: "2026-07-15T12:00:00.000Z",
      clientId: "client-1",
      articleId: "purged-article",
      status: "saved",
      references: [{ type: "generation-batch", id: "batch-1" }],
      titleSnapshot: "A private title",
      permanentlyDeleted: true,
      purgedAt: "2026-07-15T12:00:00.000Z"
    });
    assert.deepStrictEqual(trash.listTrashedArticles("client-1"), []);
    assert.throws(function() {
      trash.restoreArticle({ clientId: "client-1", articleId: "purged-article" });
    }, function(error) { return error.code === "ARTICLE_PERMANENTLY_DELETED"; });

    const repeatPreparation = trash.preparePermanentDelete({ clientId: "client-1", articleId: "purged-article" });
    assert.equal(repeatPreparation.permanentlyDeleted, true);
    assert.deepStrictEqual(trash.permanentlyDeleteArticle({
      clientId: "client-1", articleId: "purged-article", token: repeatPreparation.token
    }), {
      clientId: "client-1", articleId: "purged-article", deleted: true, deletedAt: "2026-07-15T12:00:00.000Z"
    });
    assert.equal(fs.existsSync(path.join(root, "generated", "client-1", "purged-article.json")), false);
    assert.equal(fs.existsSync(path.join(root, "generated", "client-1", "purged-article.md")), false);
  });

  it("does not create a tombstone when the source article is damaged", function() {
    store.saveArticle(article("damaged"));
    fs.unlinkSync(path.join(root, "generated", "client-1", "damaged.md"));
    assert.deepStrictEqual(trash.trashArticles({ articles: [{ clientId: "client-1", articleId: "damaged" }], confirmed: true }), {
      moved: [], skipped: [], rejected: [{ clientId: "client-1", articleId: "damaged", code: "ARTICLE_INVALID" }]
    });
    assert.deepStrictEqual(trash.listTrashedArticles("client-1"), []);
    assert.equal(fs.existsSync(path.join(root, ".autopublish", "article-trash", "client-1", "damaged.tombstone.json")), false);
  });

  it("previews and commits one coordinated removal, cancelling only its queued attempt", function() {
    const value = article("coordinated", { status: "saved", title: "Immutable headline" });
    store.saveArticle(value);
    const submission = createContentSubmissionService({
      workspaceRoot: root,
      articleStore: store,
      platforms: [{ id: "toutiao", scanDir: "toutiao", contentQueueImport: true }]
    });
    const coordinatedTrash = createArticleTrashService({
      workspaceRoot: root,
      articleStore: store,
      submissionService: submission,
      now: function() { return "2026-07-15T12:00:00.000Z"; }
    });
    const batch = submission.createBatch({ clientId: "client-1", articleIds: ["coordinated"], targetPlatformIds: ["toutiao"], confirmed: true });
    const preview = coordinatedTrash.previewTrashArticles({ selections: [{ clientId: "client-1", articleId: "coordinated" }] });
    assert.equal(preview.canCommit, true);
    assert.equal(preview.queuedToCancelCount, 1);
    assert.equal(preview.items[0].filePath, undefined);
    const result = coordinatedTrash.trashArticles({ selections: preview.selections, token: preview.token, confirmed: true });
    assert.equal(result.status, "committed");
    assert.equal(fs.existsSync(batch.items[0].filePath), false);
    assert.equal(createPublicationLedger({ workspaceRoot: root }).get(batch.items[0].publicationId).status, "cancelled");
    assert.equal(store.listTrashedArticles("client-1")[0].titleSnapshot, "Immutable headline");
  });

  it("blocks an entire selection when one publication is active and leaves every side effect untouched", function() {
    store.saveArticle(article("safe", { status: "saved" }));
    store.saveArticle(article("active", { status: "saved" }));
    const submission = createContentSubmissionService({
      workspaceRoot: root,
      articleStore: store,
      platforms: [{ id: "toutiao", scanDir: "toutiao", contentQueueImport: true }]
    });
    const ledger = createPublicationLedger({ workspaceRoot: root });
    const trashWithSubmission = createArticleTrashService({ workspaceRoot: root, articleStore: store, submissionService: submission });
    const safeBatch = submission.createBatch({ clientId: "client-1", articleIds: ["safe"], targetPlatformIds: ["toutiao"], confirmed: true });
    const activeBatch = submission.createBatch({ clientId: "client-1", articleIds: ["active"], targetPlatformIds: ["toutiao"], confirmed: true });
    ledger.markSubmitting(activeBatch.items[0].publicationId, activeBatch.items[0].attemptId);
    const preview = trashWithSubmission.previewTrashArticles({ articles: [
      { clientId: "client-1", articleId: "safe" }, { clientId: "client-1", articleId: "active" }
    ] });
    assert.equal(preview.canCommit, false);
    assert.equal(fs.existsSync(safeBatch.items[0].filePath), true);
    assert.equal(fs.existsSync(activeBatch.items[0].filePath), true);
    assert.equal(store.listTrashedArticles("client-1").length, 0);
  });

  it("resumes a confirmed removal from the durable transaction after an interruption", function() {
    store.saveArticle(article("recoverable", { status: "saved" }));
    const submission = createContentSubmissionService({
      workspaceRoot: root,
      articleStore: store,
      platforms: [{ id: "toutiao", scanDir: "toutiao", contentQueueImport: true }]
    });
    let interrupted = true;
    const firstRemoval = createArticleRemovalService({
      workspaceRoot: root,
      articleStore: store,
      submissionService: submission,
      afterQueueAction: function() { if (interrupted) { interrupted = false; throw new Error("simulated interruption"); } }
    });
    const trashWithRecovery = createArticleTrashService({ articleStore: store, articleRemovalService: firstRemoval });
    submission.createBatch({ clientId: "client-1", articleIds: ["recoverable"], targetPlatformIds: ["toutiao"], confirmed: true });
    const preview = trashWithRecovery.previewTrashArticles({ articles: [{ clientId: "client-1", articleId: "recoverable" }] });
    assert.equal(trashWithRecovery.trashArticles({ articles: preview.selections, token: preview.token, confirmed: true }).status, "pending_recovery");
    assert.equal(store.listTrashedArticles("client-1").length, 0);
    const recovered = firstRemoval.recoverPendingRemovals();
    assert.equal(recovered[0].phase, "committed");
    assert.equal(store.listTrashedArticles("client-1").length, 1);
  });

  it("exposes deletion, restore, trash listing, and confirmation IPC without external calls", async function() {
    const calls = [];
    const service = createAiContentService({
      workspaceRoot: root,
      articleTrashService: {
        listTrashedArticles: function(clientId) { calls.push("list:" + clientId); return []; },
        trashArticles: function(input) { calls.push("trash:" + input.articles.length); return { moved: [], rejected: [] }; },
        restoreArticle: function(input) { calls.push("restore:" + input.articleId); return { restored: true }; },
        preparePermanentDelete: function(input) { calls.push("prepare:" + input.articleId); return { token: "one-time" }; },
        permanentlyDeleteArticle: function(input) { calls.push("delete:" + input.token); return { deleted: true }; }
      },
      clientKnowledge: { listClients: function() { return []; }, getClient: function() { return {}; } },
      researchStore: { listResearch: function() { return []; }, getResearch: function() { return {}; } },
      templateStore: { listTemplates: function() { return []; } },
      articleStore: { listArticles: function() { return []; }, getArticle: function() { return {}; } },
      articleReviewService: { reviewMany: function() { return { approved: [], rejected: [], skipped: [] }; } },
      materialStore: { listMaterials: async function() { return []; } }
    });
    const handlers = new Map();
    registerAiContentIpc({ ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } }, aiContentService: service });
    for (const channel of ["content:list-article-trash", "content:trash-articles", "content:restore-article", "content:prepare-permanent-delete-article", "content:permanently-delete-article"]) {
      assert.equal(handlers.has(channel), true, "missing " + channel);
    }
    assert.deepStrictEqual(await handlers.get("content:trash-articles")(null, { articles: [{ clientId: "c1", articleId: "a1" }], confirmed: true }), { ok: true, data: { moved: [], rejected: [] } });
    assert.deepStrictEqual(await handlers.get("content:restore-article")(null, { clientId: "c1", articleId: "a1" }), { ok: true, data: { restored: true } });
    assert.deepStrictEqual(await handlers.get("content:prepare-permanent-delete-article")(null, { clientId: "c1", articleId: "a1" }), { ok: true, data: { token: "one-time" } });
    assert.deepStrictEqual(await handlers.get("content:permanently-delete-article")(null, { clientId: "c1", articleId: "a1", token: "one-time" }), { ok: true, data: { deleted: true } });
    assert.deepStrictEqual(calls, ["trash:1", "restore:a1", "prepare:a1", "delete:one-time"]);
  });
});

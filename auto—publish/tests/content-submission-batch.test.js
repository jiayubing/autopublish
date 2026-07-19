const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createContentSubmissionService } = require("../desktop/services/content-submission-service");
const { createSubmissionBatchStore } = require("../src/content/submission-batch-store");
const { createPublicationLedger } = require("../src/publication/publication-ledger");
const { resolveArticleIdentity } = require("../src/publication/article-identity");

function article(id, status = "saved", content = "Body") {
  return {
    id, clientId: "client-1", title: "Title " + id, content, status, createdAt: "2026-07-15T00:00:00.000Z",
    source: { client_material: true, doubao_answer: true, references: false, template: true },
    materialSnapshots: [{ id: "material-1", name: "资料", extension: ".md", content: "资料", contentHash: "hash", source: "text" }],
    researchSnapshots: [{ questionId: "question-1", answerText: "回答", references: [], collectionMethod: "manual" }],
    templateSnapshot: { platform: "fixture", id: "template-1", name: "模板", scenario: "场景", body: "模板正文", bodyHash: "template-hash" }
  };
}

function makeService(root, values = {}) {
  const articles = values.articles || [article("saved"), article("generated", "generated")];
  return createContentSubmissionService({
    workspaceRoot: root,
    paths: values.paths,
    articleStore: {
      getArticle(clientId, id) {
        const found = articles.find((item) => item.clientId === clientId && item.id === id);
        if (!found) throw Object.assign(new Error("missing"), { code: "ARTICLE_NOT_FOUND" });
        return found;
      },
      listArticles(clientId) { return articles.filter((item) => item.clientId === clientId); }
    },
    platforms: values.platforms || [
      { id: "toutiao", scanDir: "toutiao", contentQueueImport: true },
      { id: "hepan", scanDir: "hepan", contentQueueImport: true },
      { id: "unsupported", scanDir: "unsupported", contentQueueImport: false }
    ]
  });
}

describe("content submission batch", function() {
  it("previews generated and saved articles and only platforms declaring queue import", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-submission-batch-"));
    try {
      const result = makeService(root).previewBatch({ clientId: "client-1", articleIds: ["saved", "generated"], targetPlatformIds: ["toutiao", "unsupported"] });
      assert.equal(result.totalTaskCount, 4);
      assert.equal(result.queueableTaskCount, 2);
      assert.deepEqual(result.unreviewedArticleIds, []);
      assert.deepEqual(result.unsupportedPlatformIds, ["unsupported"]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("creates an auditable batch idempotently and reports content conflicts", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-submission-batch-"));
    try {
      const service = makeService(root);
      const input = { clientId: "client-1", articleIds: ["saved"], targetPlatformIds: ["toutiao"], confirmed: true };
      const first = service.createBatch(input);
      assert.equal(first.createdCount, 1);
      assert.equal(fs.existsSync(first.items[0].filePath), true);
      const second = service.createBatch(input);
      assert.equal(second.idempotentCount, 1);
      const duplicatePreview = service.previewBatch({ clientId: "client-1", articleIds: ["saved"], targetPlatformIds: ["toutiao"] });
      assert.equal(duplicatePreview.totalTaskCount, 1);
      assert.equal(duplicatePreview.queueableTaskCount, 0);
      assert.equal(duplicatePreview.idempotentCount, 1);
      const batches = service.listBatches("client-1");
      const duplicateBatch = batches.find((batch) => batch.status === "completed");
      assert.equal(duplicateBatch.items[0].status, "skipped");
      fs.writeFileSync(first.items[0].filePath, "changed", "utf8");
      assert.equal(service.previewBatch(input).conflictCount, 1);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("writes queued content under the injected portable input root", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-submission-portable-"));
    const localState = fs.mkdtempSync(path.join(os.tmpdir(), "content-submission-state-"));
    try {
      const paths = {
        input: path.join(root, ".autopublish", "input"),
        submissionRecords: path.join(root, ".autopublish", "submission-records"),
        localState: localState
      };
      const service = makeService(root, { paths: paths });
      const result = service.createBatch({ clientId: "client-1", articleIds: ["saved"], targetPlatformIds: ["toutiao"], confirmed: true });

      assert.equal(result.items[0].filePath, path.join(paths.input, "toutiao", "Title-saved-saved.md"));
      assert.equal(fs.existsSync(result.items[0].filePath), true);
      assert.equal(fs.existsSync(path.join(root, "input", "toutiao")), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(localState, { recursive: true, force: true });
    }
  });

  it("cancels only unchanged queued pairs and is idempotent", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-submission-batch-"));
    try {
      const service = makeService(root);
      const batch = service.createBatch({ clientId: "client-1", articleIds: ["saved"], targetPlatformIds: ["toutiao"], confirmed: true });
      assert.equal(service.listBatches("client-1").length, 1);
      const cancelled = service.cancelBatch({ batchId: batch.batchId, confirmed: true });
      assert.equal(cancelled.cancelledCount, 1);
      assert.equal(fs.existsSync(batch.items[0].filePath), false);
      assert.equal(createPublicationLedger({ workspaceRoot: root }).get(batch.items[0].publicationId).status, "cancelled");
      assert.equal(service.cancelBatch({ batchId: batch.batchId, confirmed: true }).cancelledCount, 0);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("previews a complete generated article as immediately queueable", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-submission-generated-"));
    try {
      const generated = {
        id: "generated-complete", clientId: "client-1", title: "完整生成文章", content: "完整正文", status: "generated",
        source: { client_material: true, doubao_answer: true, references: true, template: true },
        materialSnapshots: [{ id: "m", name: "资料", extension: ".md", content: "资料", contentHash: "hash", source: "text" }],
        researchSnapshots: [{ questionId: "q", answerText: "回答", references: [], collectionMethod: "manual" }],
        templateSnapshot: { platform: "writer", id: "template", name: "模板", scenario: "场景", body: "模板", bodyHash: "hash" },
        createdAt: "2026-07-19T00:00:00.000Z"
      };
      const result = makeService(root, { articles: [generated] }).previewBatch({ clientId: "client-1", articleIds: [generated.id], targetPlatformIds: ["toutiao"] });
      assert.equal(result.queueableTaskCount, 1);
      assert.deepEqual(result.unreviewedArticleIds, []);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("lists batches by created time and stable id instead of filesystem order", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-submission-batch-order-"));
    try {
      const store = createSubmissionBatchStore({ workspaceRoot: root });
      store.save({ id: "same-z", clientId: "client-1", createdAt: "2026-07-15T00:00:00.000Z", status: "queued", items: [] });
      store.save({ id: "same-a", clientId: "client-1", createdAt: "2026-07-15T00:00:00.000Z", status: "queued", items: [] });
      store.save({ id: "newer", clientId: "client-1", createdAt: "2026-07-16T00:00:00.000Z", status: "queued", items: [] });
      fs.writeFileSync(path.join(root, ".autopublish", "submission-batches", "batch-damaged.json"), JSON.stringify({ id: "damaged", createdAt: "not-a-date", items: [] }), "utf8");
      assert.deepStrictEqual(store.list().map((batch) => batch.id), ["newer", "same-z", "same-a", "damaged"]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("reserves publication targets and writes v2 provenance into the queue sidecar", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-submission-ledger-"));
    try {
      const service = makeService(root, { platforms: [
        { id: "toutiao", scanDir: "toutiao", contentQueueImport: true },
        { id: "hepan", scanDir: "hepan", contentQueueImport: true }
      ] });
      const first = service.createBatch({ clientId: "client-1", articleIds: ["saved"], targetPlatformIds: ["toutiao"], confirmed: true });
      const sidecar = JSON.parse(fs.readFileSync(first.items[0].sidecarPath, "utf8"));
      assert.equal(sidecar.version, 2);
      assert.equal(sidecar.publicationId, first.items[0].publicationId);
      assert.equal(sidecar.attemptId, first.items[0].attemptId);
      assert.equal(sidecar.articleKey, "generated:client-1:saved");
      assert.equal(sidecar.targetKey, "platform:toutiao");
      assert.equal(createPublicationLedger({ workspaceRoot: root }).get(first.items[0].publicationId).status, "queued");
      const duplicate = service.previewBatch({ clientId: "client-1", articleIds: ["saved"], targetPlatformIds: ["toutiao"] });
      assert.equal(duplicate.items[0].status, "idempotent");
      assert.equal(duplicate.items[0].publicationStatus, "queued");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("returns published and uncertain guards without hiding other targets", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-submission-ledger-status-"));
    try {
      const ledger = createPublicationLedger({ workspaceRoot: root });
      const articleIdentity = resolveArticleIdentity({ clientId: "client-1", articleId: "saved" });
      const published = ledger.reserve(articleIdentity, { platformId: "toutiao" });
      ledger.markSubmitting(published.publicationId, published.attemptId);
      ledger.recordOutcome(published.publicationId, published.attemptId, { status: "published", remoteId: "remote-1" });
      const service = makeService(root, { platforms: [
        { id: "toutiao", scanDir: "toutiao", contentQueueImport: true },
        { id: "hepan", scanDir: "hepan", contentQueueImport: true }
      ] });
      const preview = service.previewBatch({ clientId: "client-1", articleIds: ["saved"], targetPlatformIds: ["toutiao", "hepan"] });
      assert.equal(preview.items.find((item) => item.targetPlatformId === "toutiao").status, "blockedPublished");
      assert.equal(preview.items.find((item) => item.targetPlatformId === "hepan").status, "queueable");
      const created = service.createBatch({ clientId: "client-1", articleIds: ["saved"], targetPlatformIds: ["toutiao", "hepan"], confirmed: true });
      assert.equal(created.createdCount, 1);
      assert.equal(created.items.find((item) => item.targetPlatformId === "hepan").status, "queued");

      const uncertain = ledger.reserve(resolveArticleIdentity({ clientId: "client-1", articleId: "other" }), { platformId: "toutiao" });
      ledger.markSubmitting(uncertain.publicationId, uncertain.attemptId);
      ledger.recordOutcome(uncertain.publicationId, uncertain.attemptId, { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" });
      const uncertainService = makeService(root, { articles: [article("other")] });
      assert.equal(uncertainService.previewBatch({ clientId: "client-1", articleIds: ["other"], targetPlatformIds: ["toutiao"] }).items[0].status, "blockedUncertain");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("exposes a queued reservation without a queue file as a conflict", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-submission-ledger-orphan-"));
    try {
      const ledger = createPublicationLedger({ workspaceRoot: root });
      ledger.reserve(resolveArticleIdentity({ clientId: "client-1", articleId: "saved" }), { platformId: "toutiao" });
      const result = makeService(root).previewBatch({ clientId: "client-1", articleIds: ["saved"], targetPlatformIds: ["toutiao"] });
      assert.equal(result.items[0].status, "conflict");
      assert.equal(result.items[0].reasonCode, "PUBLICATION_RESERVATION_WITHOUT_QUEUE");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("does not cancel a reservation after submission has started", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-submission-ledger-cancel-"));
    try {
      const service = makeService(root);
      const batch = service.createBatch({ clientId: "client-1", articleIds: ["saved"], targetPlatformIds: ["toutiao"], confirmed: true });
      const ledger = createPublicationLedger({ workspaceRoot: root });
      ledger.markSubmitting(batch.items[0].publicationId, batch.items[0].attemptId);
      const preview = service.previewCancelBatch({ batchId: batch.batchId });
      assert.equal(preview.cancelableCount, 0);
      const result = service.cancelBatch({ batchId: batch.batchId, confirmed: true });
      assert.equal(result.cancelledCount, 0);
      assert.equal(ledger.get(batch.items[0].publicationId).status, "submitting");
      assert.equal(fs.existsSync(batch.items[0].filePath), true);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});

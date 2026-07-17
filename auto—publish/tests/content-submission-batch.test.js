const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createContentSubmissionService } = require("../desktop/services/content-submission-service");
const { createSubmissionBatchStore } = require("../src/content/submission-batch-store");

function article(id, status = "saved", content = "Body") {
  return { id, clientId: "client-1", title: "Title " + id, content, status, createdAt: "2026-07-15T00:00:00.000Z" };
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
      { id: "unsupported", scanDir: "unsupported", contentQueueImport: false }
    ]
  });
}

describe("content submission batch", function() {
  it("previews only saved articles and only platforms declaring queue import", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-submission-batch-"));
    try {
      const result = makeService(root).previewBatch({ clientId: "client-1", articleIds: ["saved", "generated"], targetPlatformIds: ["toutiao", "unsupported"] });
      assert.equal(result.totalTaskCount, 4);
      assert.equal(result.queueableTaskCount, 1);
      assert.deepEqual(result.unreviewedArticleIds, ["generated"]);
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
      assert.equal(service.cancelBatch({ batchId: batch.batchId, confirmed: true }).cancelledCount, 0);
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
});

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createGenerationBatchStore } = require("../src/content/generation-batch-store");
const { createWorkspacePaths, ensureWorkspaceDirectories } = require("../desktop/workspace-paths");

function source(clientId, researchQueryId) {
  return {
    clientId: clientId,
    materialIds: ["brand.md"],
    researchQueryIds: [researchQueryId]
  };
}

function templates() {
  return [
    { platform: "ctrip", templateId: "guide" },
    { platform: "xiaohongshu", templateId: "recommend" }
  ];
}

describe("generation batch store", function() {
  let workspaceRoot;

  beforeEach(function() {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "generation-batch-store-"));
  });

  afterEach(function() {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("builds one stable task per client and template and preserves source ids", function() {
    const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "batch-1"; } });
    const batch = store.createBatch({
      clientSources: [source("c1", "q1"), source("c2", "q2")],
      templates: templates(),
      aiConfigFingerprint: "fingerprint"
    });

    assert.equal(batch.id, "batch-1");
    assert.equal(batch.tasks.length, 4);
    assert.deepStrictEqual(batch.tasks.map(function(task) {
      return [task.clientId, task.platform, task.templateId];
    }), [
      ["c1", "ctrip", "guide"],
      ["c1", "xiaohongshu", "recommend"],
      ["c2", "ctrip", "guide"],
      ["c2", "xiaohongshu", "recommend"]
    ]);
    assert.deepStrictEqual(batch.tasks[0].materialIds, ["brand.md"]);
    assert.deepStrictEqual(batch.tasks[0].researchQueryIds, ["q1"]);
    assert.deepStrictEqual(batch.counts, { total: 4, succeeded: 0, failed: 0, pending: 4, interrupted: 0, cancelled: 0 });
    assert.equal(batch.status, "pending");

    const persisted = fs.readFileSync(path.join(createWorkspacePaths(workspaceRoot).generationBatches, "batch-batch-1.json"), "utf8");
    assert.equal(persisted.includes("api-key"), false);
    assert.equal(persisted.includes("fingerprint"), true);
  });

  it("enforces both task inputs, unique ids, valid ids, and the task limit", function() {
    const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot });
    const valid = { clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fingerprint" };

    assert.throws(function() { store.createBatch({ templates: templates(), aiConfigFingerprint: "fingerprint" }); }, function(error) {
      return error.code === "GENERATION_CLIENT_SOURCES_REQUIRED";
    });
    assert.throws(function() { store.createBatch({ clientSources: [source("c1", "q1")], aiConfigFingerprint: "fingerprint" }); }, function(error) {
      return error.code === "GENERATION_TEMPLATES_REQUIRED";
    });
    const withSecret = store.createBatch(Object.assign({}, valid, { apiKey: "api-key-must-not-persist" }));
    const withSecretFile = fs.readFileSync(path.join(createWorkspacePaths(workspaceRoot).generationBatches, "batch-" + withSecret.id + ".json"), "utf8");
    assert.equal(withSecretFile.includes("api-key-must-not-persist"), false);
    assert.throws(function() { store.createBatch({ clientSources: [source("c1", "q1"), source("c1", "q2")], templates: templates(), aiConfigFingerprint: "fingerprint" }); }, function(error) {
      return error.code === "GENERATION_DUPLICATE_CLIENT";
    });
    assert.throws(function() { store.createBatch({ clientSources: [source("c1", "q1")], templates: [{ platform: "ctrip", templateId: "guide" }, { platform: "ctrip", templateId: "guide" }], aiConfigFingerprint: "fingerprint" }); }, function(error) {
      return error.code === "GENERATION_DUPLICATE_TEMPLATE";
    });
    assert.throws(function() { store.createBatch({ clientSources: [source("../c1", "q1")], templates: templates(), aiConfigFingerprint: "fingerprint" }); }, function(error) {
      return error.code === "GENERATION_INVALID_ID";
    });

    const manyClients = Array.from({ length: 501 }, function(_, index) { return source("c" + index, "q" + index); });
    const manyTemplates = Array.from({ length: 2 }, function(_, index) { return { platform: "platform" + index, templateId: "template" + index }; });
    assert.throws(function() { store.createBatch({ clientSources: manyClients, templates: manyTemplates, aiConfigFingerprint: "fingerprint" }); }, function(error) {
      return error.code === "GENERATION_TASK_LIMIT";
    });
  });

  it("persists state transitions atomically and recovers running work as interrupted", function() {
    const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "batch-2"; } });
    const batch = store.createBatch({ clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fp" });
    const runningTask = batch.tasks[0].id;
    const succeededTask = batch.tasks[1].id;

    store.markTaskRunning(batch.id, runningTask);
    store.markTaskSucceeded(batch.id, succeededTask, "article-2");

    const restarted = createGenerationBatchStore({ workspaceRoot: workspaceRoot });
    const recovered = restarted.getBatch(batch.id);
    assert.equal(recovered.tasks[0].status, "interrupted");
    assert.equal(recovered.tasks[1].status, "succeeded");
    assert.equal(recovered.tasks[1].articleId, "article-2");
    assert.deepStrictEqual(recovered.counts, { total: 2, succeeded: 1, failed: 0, pending: 0, interrupted: 1, cancelled: 0 });
    assert.deepStrictEqual(restarted.getTasksForContinue(batch.id).map(function(task) { return task.id; }), [runningTask]);

    const same = restarted.markTaskSucceeded(batch.id, succeededTask, "article-2");
    assert.equal(same.tasks[1].articleId, "article-2");
    assert.throws(function() { restarted.markTaskSucceeded(batch.id, succeededTask, "article-other"); }, function(error) {
      return error.code === "GENERATION_TASK_CONFLICT";
    });
  });

  it("only returns resumable tasks and reports corrupt batches without hiding valid batches", function() {
    const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "batch-3"; } });
    const batch = store.createBatch({ clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fp" });
    store.markTaskSucceeded(batch.id, batch.tasks[0].id, "article-1");
    store.markTaskFailed(batch.id, batch.tasks[1].id, { code: "AI_TIMEOUT", message: "timed out" });

    const batchDirectory = createWorkspacePaths(workspaceRoot).generationBatches;
    fs.writeFileSync(path.join(batchDirectory, "batch-corrupt.json"), "{not-json", "utf8");
    assert.deepStrictEqual(store.listBatches().map(function(item) { return item.id; }), [batch.id]);
    assert.throws(function() { store.getBatch("corrupt"); }, function(error) {
      return error.code === "GENERATION_BATCH_INVALID";
    });
    assert.deepStrictEqual(store.getTasksForContinue(batch.id).map(function(task) { return task.status; }), ["failed"]);
  });

  it("reads old batches without a cancelled count as zero and permanently cancels only pending tasks", function() {
    const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "batch-cancel"; } });
    const batch = store.createBatch({ clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fp" });
    const filename = path.join(createWorkspacePaths(workspaceRoot).generationBatches, "batch-" + batch.id + ".json");
    const legacy = JSON.parse(fs.readFileSync(filename, "utf8"));
    delete legacy.counts.cancelled;
    fs.writeFileSync(filename, JSON.stringify(legacy), "utf8");
    assert.equal(store.getBatch(batch.id).counts.cancelled, 0);

    store.markTaskRunning(batch.id, batch.tasks[0].id);
    const cancelled = store.cancelPending(batch.id);
    assert.equal(cancelled.tasks[0].status, "running");
    assert.equal(cancelled.tasks[1].status, "cancelled");
    assert.deepStrictEqual(cancelled.counts, { total: 2, succeeded: 0, failed: 0, pending: 0, interrupted: 0, cancelled: 1 });
    assert.deepStrictEqual(store.getTasksForContinue(batch.id), []);

    const unchanged = store.cancelPending(batch.id);
    assert.equal(unchanged.counts.cancelled, 1);
    assert.equal(unchanged.tasks[0].status, "running");
  });
});

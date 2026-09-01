const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createGenerationBatchStore } = require("../src/content/generation-batch-store");
const { createWorkspacePaths, ensureWorkspaceDirectories } = require("../src/infrastructure/workspace/workspace-paths");

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

  it("discovers a batch whose transaction artifacts survived restart", function() {
    const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "batch-artifact"; } });
    const batch = store.createBatch({ clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fp" });
    const filename = path.join(createWorkspacePaths(workspaceRoot).generationBatches, "batch-" + batch.id + ".json");
    const persisted = fs.readFileSync(filename, "utf8");
    fs.renameSync(filename, filename + ".bak");
    fs.writeFileSync(filename + ".tmp", persisted, "utf8");
    fs.writeFileSync(filename + ".journal", JSON.stringify({ version: 1 }) + "\n", "utf8");

    const restarted = createGenerationBatchStore({ workspaceRoot: workspaceRoot });
    assert.deepStrictEqual(restarted.listBatches().map(function(item) { return item.id; }), [batch.id]);
    assert.equal(fs.existsSync(filename), true);
    assert.equal(fs.existsSync(filename + ".bak"), false);
    assert.equal(fs.existsSync(filename + ".tmp"), false);
    assert.equal(fs.existsSync(filename + ".journal"), false);
  });

  it("leaves transaction artifacts uninstalled when the journal is invalid", function() {
    const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "batch-invalid-journal"; } });
    const batch = store.createBatch({ clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fp" });
    const filename = path.join(createWorkspacePaths(workspaceRoot).generationBatches, "batch-" + batch.id + ".json");
    fs.renameSync(filename, filename + ".tmp");
    fs.writeFileSync(filename + ".journal", JSON.stringify({ version: 999, kind: "unknown" }) + "\n", "utf8");

    const restarted = createGenerationBatchStore({ workspaceRoot: workspaceRoot });
    assert.throws(function() { restarted.listBatches(); }, { code: "GENERATION_BATCH_INVALID" });
    assert.equal(fs.existsSync(filename), false);
    assert.equal(fs.existsSync(filename + ".tmp"), true);
    assert.equal(fs.existsSync(filename + ".journal"), true);
  });

  it("does not install an artifact whose persisted id differs from its filename", function() {
    const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "batch-artifact-id"; } });
    const batch = store.createBatch({ clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fp" });
    const filename = path.join(createWorkspacePaths(workspaceRoot).generationBatches, "batch-" + batch.id + ".json");
    const persisted = JSON.parse(fs.readFileSync(filename, "utf8"));
    persisted.id = "other-batch";
    fs.renameSync(filename, filename + ".tmp");
    fs.writeFileSync(filename + ".tmp", JSON.stringify(persisted) + "\n", "utf8");
    fs.writeFileSync(filename + ".journal", JSON.stringify({ version: 1 }) + "\n", "utf8");

    const restarted = createGenerationBatchStore({ workspaceRoot: workspaceRoot });
    assert.throws(function() { restarted.listBatches(); }, { code: "GENERATION_BATCH_INVALID" });
    assert.equal(fs.existsSync(filename), false);
    assert.equal(fs.existsSync(filename + ".tmp"), true);
  });

  it("preserves transaction evidence when the canonical batch id is invalid", function() {
    const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "batch-canonical-id"; } });
    const batch = store.createBatch({ clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fp" });
    const filename = path.join(createWorkspacePaths(workspaceRoot).generationBatches, "batch-" + batch.id + ".json");
    const canonical = JSON.parse(fs.readFileSync(filename, "utf8"));
    fs.copyFileSync(filename, filename + ".bak");
    canonical.id = "other-batch";
    fs.writeFileSync(filename, JSON.stringify(canonical) + "\n", "utf8");
    fs.writeFileSync(filename + ".journal", JSON.stringify({ version: 1 }) + "\n", "utf8");

    const restarted = createGenerationBatchStore({ workspaceRoot: workspaceRoot });
    assert.throws(function() { restarted.listBatches(); }, { code: "GENERATION_BATCH_INVALID" });
    assert.equal(fs.existsSync(filename), true);
    assert.equal(fs.existsSync(filename + ".bak"), true);
    assert.equal(fs.existsSync(filename + ".journal"), true);
  });

  it("skips unsafe artifact names without hiding valid batches", function() {
    const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "batch-good"; } });
    const batch = store.createBatch({ clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fp" });
    const directory = createWorkspacePaths(workspaceRoot).generationBatches;
    const invalidArtifact = path.join(directory, "batch-CON.json.tmp");
    fs.writeFileSync(invalidArtifact, "residue", "utf8");

    const restarted = createGenerationBatchStore({ workspaceRoot: workspaceRoot });
    assert.deepStrictEqual(restarted.listBatches().map(function(item) { return item.id; }), [batch.id]);
    assert.equal(fs.existsSync(invalidArtifact), true);
  });

  it("preserves recovery artifacts when the canonical batch is a link", function(t) {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "generation-batch-store-link-"));
    try {
      [
        { id: "batch-link-journal", journal: true },
        { id: "batch-link-no-journal", journal: false }
      ].forEach(function(item) {
        const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return item.id; } });
        const batch = store.createBatch({ clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fp" });
        const filename = path.join(createWorkspacePaths(workspaceRoot).generationBatches, "batch-" + batch.id + ".json");
        const target = path.join(outside, item.id + ".json");
        fs.copyFileSync(filename, target);
        fs.copyFileSync(filename, filename + ".bak");
        fs.unlinkSync(filename);
        try {
          fs.symlinkSync(target, filename, "file");
        } catch (error) {
          if (["EPERM", "EACCES", "ENOTSUP", "EINVAL"].includes(error.code)) {
            t.skip("file symlinks are unavailable");
            return;
          }
          throw error;
        }
        if (item.journal) fs.writeFileSync(filename + ".journal", JSON.stringify({ version: 1 }) + "\n", "utf8");

        assert.throws(function() { store.getBatch(batch.id); }, { code: "GENERATION_BATCH_PATH_UNSAFE" });
        assert.equal(fs.existsSync(filename + ".bak"), true);
        assert.equal(fs.existsSync(filename + ".journal"), item.journal);
        fs.unlinkSync(filename);
        fs.unlinkSync(filename + ".bak");
        if (item.journal) fs.unlinkSync(filename + ".journal");
      });
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("preserves the path error code for an unsafe journal", function() {
    const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "batch-journal-path"; } });
    const batch = store.createBatch({ clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fp" });
    const filename = path.join(createWorkspacePaths(workspaceRoot).generationBatches, "batch-" + batch.id + ".json");
    const journal = filename + ".journal";
    fs.mkdirSync(journal);

    assert.throws(function() { store.getBatch(batch.id); }, { code: "GENERATION_BATCH_PATH_UNSAFE" });
    assert.equal(fs.existsSync(journal), true);
  });

  it("rejects an unsafe temporary artifact beside a canonical batch", function() {
    const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "batch-temporary-path"; } });
    const batch = store.createBatch({ clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fp" });
    const filename = path.join(createWorkspacePaths(workspaceRoot).generationBatches, "batch-" + batch.id + ".json");
    const temporary = filename + ".tmp";
    fs.mkdirSync(temporary);

    assert.throws(function() { store.getBatch(batch.id); }, { code: "GENERATION_BATCH_PATH_UNSAFE" });
    assert.equal(fs.existsSync(temporary), true);
  });

  it("does not install a temporary batch before validating its backup path", function() {
    [false, true].forEach(function(journalPresent) {
      const id = journalPresent ? "batch-backup-path-journal" : "batch-backup-path";
      const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return id; } });
      const batch = store.createBatch({ clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fp" });
      const filename = path.join(createWorkspacePaths(workspaceRoot).generationBatches, "batch-" + batch.id + ".json");
      const temporary = filename + ".tmp";
      const backup = filename + ".bak";
      const persisted = fs.readFileSync(filename, "utf8");
      fs.unlinkSync(filename);
      fs.writeFileSync(temporary, persisted, "utf8");
      fs.mkdirSync(backup);
      if (journalPresent) fs.writeFileSync(filename + ".journal", JSON.stringify({ version: 1 }) + "\n", "utf8");

      assert.throws(function() { store.getBatch(batch.id); }, { code: "GENERATION_BATCH_PATH_UNSAFE" });
      assert.equal(fs.existsSync(filename), false);
      assert.equal(fs.existsSync(temporary), true);
      assert.equal(fs.existsSync(backup), true);
      if (journalPresent) assert.equal(fs.existsSync(filename + ".journal"), true);

      fs.unlinkSync(temporary);
      fs.rmSync(backup, { recursive: true, force: true });
      if (journalPresent) fs.unlinkSync(filename + ".journal");
    });
  });

  it("discovers and recovers batches with Unicode and internal-space ids", function() {
    const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "批次 1"; } });
    const batch = store.createBatch({ clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fp" });
    store.markTaskRunning(batch.id, batch.tasks[0].id);

    const restarted = createGenerationBatchStore({ workspaceRoot: workspaceRoot });
    assert.deepStrictEqual(restarted.listBatches().map(function(item) { return item.id; }), [batch.id]);
    assert.equal(restarted.getBatch(batch.id).tasks[0].status, "interrupted");
  });

  it("fails closed when a persisted batch is corrupt instead of hiding it", function() {
    const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "batch-3"; } });
    const batch = store.createBatch({ clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fp" });
    store.markTaskSucceeded(batch.id, batch.tasks[0].id, "article-1");
    store.markTaskFailed(batch.id, batch.tasks[1].id, { code: "AI_TIMEOUT", message: "timed out" });

    const batchDirectory = createWorkspacePaths(workspaceRoot).generationBatches;
    fs.writeFileSync(path.join(batchDirectory, "batch-corrupt.json"), "{not-json", "utf8");
    assert.throws(function() { store.listBatches(); }, function(error) {
      return error.code === "GENERATION_BATCH_INVALID";
    });
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

  it("normalizes legacy stopped batches to paused without preserving a second state route", function() {
    const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "batch-legacy-stopped"; } });
    const batch = store.createBatch({ clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fp" });
    const filename = path.join(createWorkspacePaths(workspaceRoot).generationBatches, "batch-" + batch.id + ".json");
    const legacy = JSON.parse(fs.readFileSync(filename, "utf8"));
    legacy.status = "stopped";
    fs.writeFileSync(filename, JSON.stringify(legacy), "utf8");
    assert.equal(store.getBatch(batch.id).status, "paused");
  });

  it("abandons a recoverable batch while preserving success and failure evidence", function() {
    const store = createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "batch-abandon"; } });
    const batch = store.createBatch({ clientSources: [source("c1", "q1")], templates: templates(), aiConfigFingerprint: "fp" });
    store.markTaskSucceeded(batch.id, batch.tasks[0].id, "article-1");
    store.markTaskFailed(batch.id, batch.tasks[1].id, { code: "AI_TIMEOUT", message: "timed out" });
    store.updateBatchStatus(batch.id, "failed");
    const abandoned = store.abandonBatch(batch.id);
    assert.equal(abandoned.status, "abandoned");
    assert.equal(abandoned.tasks[0].status, "succeeded");
    assert.equal(abandoned.tasks[0].articleId, "article-1");
    assert.equal(abandoned.tasks[1].status, "failed");
    assert.deepStrictEqual(abandoned.tasks[1].error, { code: "AI_TIMEOUT", message: "timed out" });
    assert.deepStrictEqual(store.getTasksForContinue(batch.id), []);
  });
});

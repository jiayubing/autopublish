const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { registerPlatformIpc } = require("../desktop/ipc/platform-ipc");

describe("platform IPC submission boundary", function() {
  it("submits multiple source articles through one serialized desktop job", async function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "platform-ipc-boundary-"));
    const handlers = new Map();
    const plans = [];
    try {
      fs.mkdirSync(path.join(root, "input", "lieju"), { recursive: true });
      fs.writeFileSync(path.join(root, "input", "lieju", "one.txt"), "One", "utf8");
      fs.writeFileSync(path.join(root, "input", "lieju", "two.txt"), "Two", "utf8");
      registerPlatformIpc({
        rootDir: root,
        ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } },
        sendToRenderer: function() {},
        taskService: {
          startPlatformSubmit: async function(plan) {
            plans.push(plan);
            return { ok: true, data: { ok: 2, fail: 0, skipped: 0, results: [] } };
          },
          pausePlatformSubmit: function() {}, stopPlatformSubmit: function() {}, getState: function() { return {}; }
        }
      });
      const response = await handlers.get("platforms:submit-selected-plan")(null, [
        { sourcePlatformId: "lieju", filename: "one.txt", targetPlatformIds: ["toutiao"] },
        { sourcePlatformId: "lieju", filename: "two.txt", targetPlatformIds: ["toutiao"] }
      ]);
      assert.equal(response.ok, true);
      assert.equal(plans.length, 1);
      assert.deepStrictEqual(plans[0].tasks.map(function(task) { return task.filename; }), ["one.txt", "two.txt"]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("runs confirmed automatic local trash through the main article removal interface", async function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "platform-ipc-auto-trash-"));
    const handlers = new Map();
    let previewCalls = 0;
    let trashCalls = 0;
    const invalidations = [];
    try {
      fs.mkdirSync(path.join(root, "input", "lieju"), { recursive: true });
      const file = path.join(root, "input", "lieju", "published.txt");
      fs.writeFileSync(file, "Published", "utf8");
      fs.writeFileSync(file + ".submission.json", JSON.stringify({ clientId: "client-1", generatedArticleId: "article-1" }), "utf8");
      let workerPlan;
      registerPlatformIpc({
        rootDir: root,
        ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } },
        sendToRenderer: function() {},
        invalidateData: function(scopes, reasonCode) { invalidations.push({ scopes: scopes, reasonCode: reasonCode }); },
        aiContentService: {
          previewArticleRemovalImpact: function() { previewCalls += 1; return { canCommit: true, token: "preview-token" }; },
          trashArticles: function() { trashCalls += 1; return { status: "committed" }; }
        },
        taskService: {
          startPlatformSubmit: async function(plan) {
            workerPlan = plan;
            fs.unlinkSync(file);
            fs.unlinkSync(file + ".submission.json");
            return { ok: true, data: { ok: 1, fail: 0, skipped: 0, results: [{ task: { sourcePlatformId: "lieju", filename: "published.txt", targetPlatformId: "toutiao" }, status: "success", publicationStatus: "published" }] } };
          },
          pausePlatformSubmit: function() {}, stopPlatformSubmit: function() {}, getState: function() { return {}; }
        }
      });
      const response = await handlers.get("platforms:submit-selected-plan")(null, { submissions: [{ sourcePlatformId: "lieju", filename: "published.txt", targetPlatformIds: ["toutiao"] }], autoTrash: true });
      assert.equal(response.ok, true);
      assert.equal(response.data.trashDisposition, "auto_trash_requested");
      assert.equal(previewCalls, 1);
      assert.equal(trashCalls, 1);
      assert.deepEqual(invalidations, [{ scopes: ["platformQueue", "navigationSummary", "articleAttention"], reasonCode: "PLATFORM_AUTO_TRASH_APPLIED" }]);
      assert.equal(workerPlan.tasks[0].filePath, undefined);
      assert.equal(workerPlan.tasks[0].clientId, undefined);
      assert.equal(workerPlan.tasks[0].articleId, undefined);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("keeps a multi-target article when one target is uncertain or archive-failed", async function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "platform-ipc-partial-trash-"));
    const handlers = new Map();
    let removalCalls = 0;
    try {
      fs.mkdirSync(path.join(root, "input", "lieju"), { recursive: true });
      const file = path.join(root, "input", "lieju", "partial.txt");
      fs.writeFileSync(file, "Partial", "utf8");
      fs.writeFileSync(file + ".submission.json", JSON.stringify({ clientId: "client-1", generatedArticleId: "article-1" }), "utf8");
      registerPlatformIpc({
        rootDir: root,
        ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } },
        sendToRenderer: function() {},
        aiContentService: {
          previewArticleRemovalImpact: function() { removalCalls += 1; return { canCommit: true, token: "unused" }; },
          trashArticles: function() { removalCalls += 1; return { status: "committed" }; }
        },
        taskService: {
          startPlatformSubmit: async function() {
            return { ok: true, data: { ok: 1, fail: 1, skipped: 0, results: [
              { task: { sourcePlatformId: "lieju", filename: "partial.txt", targetPlatformId: "toutiao" }, status: "success", publicationStatus: "published", archiveError: "PUBLISHED_ARCHIVE_FAILED" },
              { task: { sourcePlatformId: "lieju", filename: "partial.txt", targetPlatformId: "hepan" }, status: "failed", publicationStatus: "uncertain" }
            ] } };
          },
          pausePlatformSubmit: function() {}, stopPlatformSubmit: function() {}, getState: function() { return {}; }
        }
      });
      const response = await handlers.get("platforms:submit-selected-plan")(null, { submissions: [{ sourcePlatformId: "lieju", filename: "partial.txt", targetPlatformIds: ["toutiao", "hepan"] }], autoTrash: true });
      assert.equal(response.ok, true);
      assert.equal(response.data.trashDisposition, "auto_trash_blocked");
      assert.equal(response.data.trashSummary.blockedCount, 1);
      assert.deepEqual(response.data.trashSummary.reasonCodes, ["REMOVAL_BLOCKED"]);
      assert.equal(removalCalls, 0);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("returns a safe repair reason when local recovery throws without changing publish success", async function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "platform-ipc-trash-error-"));
    const handlers = new Map();
    try {
      fs.mkdirSync(path.join(root, "input", "lieju"), { recursive: true });
      const file = path.join(root, "input", "lieju", "error.txt");
      fs.writeFileSync(file, "Error", "utf8");
      fs.writeFileSync(file + ".submission.json", JSON.stringify({ clientId: "client-1", generatedArticleId: "article-1" }), "utf8");
      registerPlatformIpc({
        rootDir: root,
        ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } },
        sendToRenderer: function() {},
        aiContentService: {
          previewArticleRemovalImpact: function() { return { canCommit: true, token: "preview-token" }; },
          trashArticles: function() { const error = new Error("private local detail"); error.code = "ARTICLE_TRASH_PREVIEW_STALE"; throw error; }
        },
        taskService: {
          startPlatformSubmit: async function() {
            return { ok: true, data: { ok: 1, fail: 0, results: [{ task: { sourcePlatformId: "lieju", filename: "error.txt", targetPlatformId: "toutiao" }, status: "success", publicationStatus: "published" }] } };
          },
          pausePlatformSubmit: function() {}, stopPlatformSubmit: function() {}, getState: function() { return {}; }
        }
      });
      const response = await handlers.get("platforms:submit-selected-plan")(null, { submissions: [{ sourcePlatformId: "lieju", filename: "error.txt", targetPlatformIds: ["toutiao"] }], autoTrash: true });
      assert.equal(response.ok, true);
      assert.equal(response.data.ok, 1);
      assert.equal(response.data.trashDisposition, "auto_trash_blocked");
      assert.deepEqual(response.data.trashSummary.reasonCodes, ["REMOVAL_NEEDS_REPAIR"]);
      assert.doesNotMatch(JSON.stringify(response.data), /private local detail/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});

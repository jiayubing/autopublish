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
    try {
      fs.mkdirSync(path.join(root, "input", "lieju"), { recursive: true });
      const file = path.join(root, "input", "lieju", "published.txt");
      fs.writeFileSync(file, "Published", "utf8");
      fs.writeFileSync(file + ".submission.json", JSON.stringify({ clientId: "client-1", generatedArticleId: "article-1" }), "utf8");
      registerPlatformIpc({
        rootDir: root,
        ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } },
        sendToRenderer: function() {},
        aiContentService: {
          previewArticleRemovalImpact: function() { previewCalls += 1; return { canCommit: true, token: "preview-token" }; },
          trashArticles: function() { trashCalls += 1; return { status: "committed" }; }
        },
        taskService: {
          startPlatformSubmit: async function() {
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
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});

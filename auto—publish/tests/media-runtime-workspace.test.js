const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWorkspacePaths, ensureWorkspaceDirectories } = require("../desktop/workspace-paths");
const { MediaDraftStore } = require("../src/platforms/media/media-draft-store");
const { MediaPoolStore } = require("../src/platforms/media/media-pool-store");
const { MediaResourceStore } = require("../src/platforms/media/media-resource-store");
const { SubmissionOrderStore } = require("../src/platforms/media/submission-order-store");
const { createMediaOrderService } = require("../desktop/services/media-order-service");
const { registerMediaIpc } = require("../desktop/ipc/media-ipc");

describe("media runtime workspace", function() {
  it("writes media state exclusively to an explicit workspace paths data directory", async function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-media-runtime-"));
    try {
      const paths = ensureWorkspaceDirectories(createWorkspacePaths(root));
      new MediaDraftStore({ paths }).set("article.docx", { title: "Article" });
      new MediaPoolStore({ paths }).add({ id: "1", name: "Media" });
      new MediaResourceStore({ paths }).setAll([]);
      await new SubmissionOrderStore({ paths }).record({ command: "submit", dryRun: true, params: {}, result: { success: true } });

      ["media-drafts.json", "media-pool.json", "media-resources.json", "submission-orders.jsonl"].forEach(function(file) {
        assert.ok(fs.existsSync(path.join(paths.data, file)), file + " was not written to workspace data");
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("media IPC runtime workspace", function() {
  it("creates draft state beneath deps.paths.data", async function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-ipc-runtime-"));
    try {
      const paths = ensureWorkspaceDirectories(createWorkspacePaths(root));
      const handlers = new Map();
      registerMediaIpc({
        ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } },
        paths: paths,
        rootDir: paths.root
      });
      const response = await handlers.get("media:set-draft")(null, "article.docx", { title: "IPC article" });
      assert.equal(response.ok, true);
      assert.ok(fs.existsSync(path.join(paths.data, "media-drafts.json")));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("media order runtime workspace", function() {
  it("reads orders from the same workspace data directory used by the order store", async function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-order-runtime-"));
    try {
      const paths = ensureWorkspaceDirectories(createWorkspacePaths(root));
      await new SubmissionOrderStore({ paths }).record({ command: "submit", dryRun: true, params: { title: "Workspace order" }, result: { success: true } });
      const orders = createMediaOrderService({ paths }).listOrders();
      assert.equal(orders.length, 1);
      assert.equal(orders[0].params.title, "Workspace order");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

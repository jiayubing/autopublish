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
const { createMediaWorkbenchService } = require("../desktop/services/media-workbench-service");

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

  it("scans the historical app media input when no runtime paths are injected", async function() {
    const originalCwd = process.cwd();
    const unrelatedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-unrelated-cwd-"));
    const historicalInput = path.join(path.resolve(__dirname, ".."), "input", "media");
    const hadHistoricalInput = fs.existsSync(historicalInput);
    const filename = "ipc-historical-input-regression.txt";
    const filePath = path.join(historicalInput, filename);
    const handlers = new Map();
    try {
      fs.mkdirSync(historicalInput, { recursive: true });
      fs.writeFileSync(filePath, "Historical input title\nBody", "utf8");
      process.chdir(unrelatedDirectory);

      registerMediaIpc({
        ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } }
      });

      const response = await handlers.get("media:scan-articles")();
      assert.equal(response.ok, true);
      assert.ok(response.data.some(function(article) { return article.filename === filename; }));
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(filePath, { force: true });
      if (!hadHistoricalInput) fs.rmSync(historicalInput, { recursive: true, force: true });
      fs.rmSync(unrelatedDirectory, { recursive: true, force: true });
    }
  });
});

describe("media submission workspace override", function() {
  it("writes submitted orders to injected workspace paths even when environment points elsewhere", async function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-submit-runtime-"));
    const otherRoot = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-other-runtime-"));
    const originalRoot = process.env.AUTO_PUBLISH_ROOT_DIR;
    try {
      const paths = ensureWorkspaceDirectories(createWorkspacePaths(root));
      fs.writeFileSync(path.join(paths.mediaInput, "article.txt"), "Workspace title\nBody", "utf8");
      process.env.AUTO_PUBLISH_ROOT_DIR = otherRoot;
      const service = createMediaWorkbenchService({ inputDir: paths.mediaInput, paths: paths });
      await service.submitTasksSerially([{
        filename: "article.txt",
        filePath: path.join(paths.mediaInput, "article.txt"),
        title: "Workspace title",
        selectedResources: [{ resourceId: "1", name: "Media" }]
      }], { client: { sendArticle: async function() { return { success: true }; } } });

      assert.equal(createMediaOrderService({ paths }).listOrders()[0].params.title, "Workspace title");
      assert.equal(fs.existsSync(path.join(otherRoot, "data", "submission-orders.jsonl")), false);
    } finally {
      if (originalRoot === undefined) delete process.env.AUTO_PUBLISH_ROOT_DIR;
      else process.env.AUTO_PUBLISH_ROOT_DIR = originalRoot;
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(otherRoot, { recursive: true, force: true });
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

describe("legacy media storage compatibility", function() {
  it("uses the historical app data directory when no workspace path or environment is supplied", function() {
    const originalCwd = process.cwd();
    const original = {
      root: process.env.AUTO_PUBLISH_ROOT_DIR,
      workspace: process.env.AUTO_PUBLISH_WORKSPACE,
      appRoot: process.env.AUTO_PUBLISH_APP_ROOT
    };
    const unrelatedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-unrelated-cwd-"));
    const expectedDataDirectory = path.join(path.resolve(__dirname, ".."), "data");
    try {
      delete process.env.AUTO_PUBLISH_ROOT_DIR;
      delete process.env.AUTO_PUBLISH_WORKSPACE;
      delete process.env.AUTO_PUBLISH_APP_ROOT;
      process.chdir(unrelatedDirectory);

      assert.equal(new MediaDraftStore().filePath, path.join(expectedDataDirectory, "media-drafts.json"));
      assert.equal(new MediaPoolStore().filePath, path.join(expectedDataDirectory, "media-pool.json"));
      assert.equal(new MediaResourceStore().filePath, path.join(expectedDataDirectory, "media-resources.json"));
      assert.equal(new SubmissionOrderStore().storePath, path.join(expectedDataDirectory, "submission-orders.jsonl"));
      assert.equal(createMediaOrderService().storePath, path.join(expectedDataDirectory, "submission-orders.jsonl"));
    } finally {
      process.chdir(originalCwd);
      if (original.root === undefined) delete process.env.AUTO_PUBLISH_ROOT_DIR;
      else process.env.AUTO_PUBLISH_ROOT_DIR = original.root;
      if (original.workspace === undefined) delete process.env.AUTO_PUBLISH_WORKSPACE;
      else process.env.AUTO_PUBLISH_WORKSPACE = original.workspace;
      if (original.appRoot === undefined) delete process.env.AUTO_PUBLISH_APP_ROOT;
      else process.env.AUTO_PUBLISH_APP_ROOT = original.appRoot;
      fs.rmSync(unrelatedDirectory, { recursive: true, force: true });
    }
  });
});

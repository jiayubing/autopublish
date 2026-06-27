const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createMediaWorkbenchService } = require("../desktop/services/media-workbench-service");
const { MediaDraftStore } = require("../src/platforms/media/media-draft-store");

describe("media-workbench-service", function() {
  let root;
  let inputDir;
  let draftStore;
  let service;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "media-workbench-"));
    inputDir = path.join(root, "input", "media");
    fs.mkdirSync(inputDir, { recursive: true });
    draftStore = new MediaDraftStore({ storePath: path.join(root, "data", "drafts.json") });
    service = createMediaWorkbenchService({ inputDir: inputDir, draftStore: draftStore });
  });

  afterEach(function() {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("scans text articles and applies selected resources from drafts", async function() {
    fs.writeFileSync(path.join(inputDir, "a.txt"), "Title A\n\nBody", "utf-8");
    draftStore.set("a.txt", {
      selectedResources: [{ resourceId: "101", name: "Media One" }],
      title: "Custom Title"
    });

    const articles = await service.scanArticles();
    assert.strictEqual(articles.length, 1);
    assert.strictEqual(articles[0].filename, "a.txt");
    assert.strictEqual(articles[0].title, "Custom Title");
    assert.deepStrictEqual(articles[0].selectedResources.map(function(resource) {
      return resource.resourceId;
    }), ["101"]);
  });

  it("previews text articles with draft resource fields merged", async function() {
    fs.writeFileSync(path.join(inputDir, "preview.txt"), "# Preview Title\n\nPreview body", "utf-8");
    draftStore.set("preview.txt", {
      title: "Draft Title",
      resourceId: "77",
      resourceName: "Draft Resource"
    });

    const preview = await service.previewArticle("preview.txt");

    assert.deepStrictEqual(preview, {
      filename: "preview.txt",
      title: "Draft Title",
      content: "# Preview Title\n\nPreview body",
      resourceId: "77",
      resourceName: "Draft Resource"
    });
  });

  it("rejects unsafe preview filenames", async function() {
    await assert.rejects(
      function() { return service.previewArticle("../escape.txt"); },
      /invalid|unsafe/i
    );
  });

  it("expands selected articles into serial submission tasks", function() {
    const tasks = service.expandSubmissionTasks([
      {
        filename: "a.txt",
        filePath: path.join(inputDir, "a.txt"),
        title: "A",
        selectedResources: [
          { resourceId: "101", name: "Media One", price: 100 },
          { resourceId: "102", name: "Media Two", price: 80 }
        ]
      }
    ]);

    assert.deepStrictEqual(tasks.map(function(task) {
      return task.taskId;
    }), ["a.txt::101", "a.txt::102"]);
    assert.strictEqual(tasks[0].status, "pending");
  });

  it("builds confirmation totals", function() {
    const summary = service.buildConfirmationSummary([
      { title: "A", selectedResources: [{ resourceId: "1", price: 100 }, { resourceId: "2", price: 80 }] },
      { title: "B", selectedResources: [{ resourceId: "3", price: 20 }] }
    ]);

    assert.deepStrictEqual(summary, {
      articleCount: 2,
      resourceCount: 3,
      taskCount: 3,
      estimatedTotalPrice: 200,
      blockers: []
    });
  });

  it("submits tasks serially and continues after one failure", async function() {
    fs.writeFileSync(path.join(inputDir, "a.txt"), "A\n\nBody A", "utf-8");
    fs.writeFileSync(path.join(inputDir, "b.txt"), "B\n\nBody B", "utf-8");
    const calls = [];
    const records = [];
    const client = {
      sendArticle: async function(payload) {
        calls.push(payload.resourceId);
        if (payload.resourceId === "bad") throw new Error("submit failed");
        return { data: { order_nid: "order-" + payload.resourceId } };
      }
    };
    const orderStore = {
      record: async function(entry) {
        records.push(entry);
      }
    };

    const result = await service.submitTasksSerially([
      { filename: "a.txt", filePath: path.join(inputDir, "a.txt"), title: "A", selectedResources: [{ resourceId: "ok1" }, { resourceId: "bad" }] },
      { filename: "b.txt", filePath: path.join(inputDir, "b.txt"), title: "B", selectedResources: [{ resourceId: "ok2" }] }
    ], { client: client, orderStore: orderStore });

    assert.deepStrictEqual(calls, ["ok1", "bad", "ok2"]);
    assert.strictEqual(result.ok, 2);
    assert.strictEqual(result.fail, 1);
    assert.strictEqual(result.skipped, 0);
    assert.strictEqual(records.length, 3);
  });

  it("stop request skips tasks after the current request", async function() {
    fs.writeFileSync(path.join(inputDir, "a.txt"), "A\n\nBody A", "utf-8");
    const calls = [];
    const client = {
      sendArticle: async function(payload) {
        calls.push(payload.resourceId);
        service.requestStop();
        return { data: { order_nid: "order-" + payload.resourceId } };
      }
    };
    const orderStore = { record: async function() {} };

    const result = await service.submitTasksSerially([
      { filename: "a.txt", filePath: path.join(inputDir, "a.txt"), title: "A", selectedResources: [{ resourceId: "first" }, { resourceId: "second" }] }
    ], { client: client, orderStore: orderStore });

    assert.deepStrictEqual(calls, ["first"]);
    assert.strictEqual(result.ok, 1);
    assert.strictEqual(result.skipped, 1);
  });
});

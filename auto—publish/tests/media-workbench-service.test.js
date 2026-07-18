const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createMediaWorkbenchService } = require("../desktop/services/media-workbench-service");
const { MediaDraftStore } = require("../src/platforms/media/media-draft-store");
const { createPublicationLedger } = require("../src/publication/publication-ledger");
const { resolveArticleIdentity } = require("../src/publication/article-identity");
const { resolvePublicationTarget } = require("../src/publication/publication-targets");

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
    fs.writeFileSync(path.join(inputDir, "preview.txt"), "\n\n# Preview Title\n\nPreview body\n\n", "utf-8");
    draftStore.set("preview.txt", {
      title: "Draft Title",
      resourceId: "77",
      resourceName: "Draft Resource",
      selectedResources: [{ resourceId: "101", name: "Media One" }]
    });

    const preview = await service.previewArticle("preview.txt");

    assert.strictEqual(preview.filename, "preview.txt");
    assert.strictEqual(preview.title, "Draft Title");
    assert.strictEqual(preview.content, "# Preview Title\n\nPreview body");
    assert.strictEqual(preview.resourceId, "101");
    assert.strictEqual(preview.resourceName, "Media One");
    assert.deepStrictEqual(preview.selectedResources, [
      { resourceId: "101", name: "Media One", price: undefined }
    ]);
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

  it("preflight blocks resources already reserved for the same article and excludes them from price", function() {
    fs.writeFileSync(path.join(inputDir, "ledger.txt"), "Ledger title\n\nBody", "utf-8");
    const ledger = createPublicationLedger({ workspaceRoot: root });
    const articleIdentity = resolveArticleIdentity({
      clientId: "media",
      title: "Ledger title",
      content: "Ledger title\n\nBody"
    });
    ledger.reserve(articleIdentity, resolvePublicationTarget({ mediaResourceId: "101" }));
    service = createMediaWorkbenchService({ inputDir: inputDir, draftStore: draftStore, publicationLedger: ledger });

    const summary = service.buildConfirmationSummary([{
      filename: "ledger.txt",
      filePath: path.join(inputDir, "ledger.txt"),
      title: "Ledger title",
      content: "Ledger title\n\nBody",
      selectedResources: [
        { resourceId: "101", name: "Reserved", price: 100 },
        { resourceId: "102", name: "Available", price: 80 }
      ]
    }]);

    assert.equal(summary.blockedResourceCount, 1);
    assert.equal(summary.submitableResourceCount, 1);
    assert.equal(summary.estimatedTotalPrice, 80);
    assert.deepEqual(summary.blockedResources.map(function(resource) { return resource.resourceId; }), ["101"]);
    assert.deepEqual(summary.submitableResources.map(function(resource) { return resource.resourceId; }), ["102"]);
  });

  it("creates one publication per resource, records publicationId in the order, and uses publication attempt identity as thirdId", async function() {
    fs.writeFileSync(path.join(inputDir, "multi.txt"), "Multi title\n\nBody", "utf-8");
    const ledger = createPublicationLedger({ workspaceRoot: root });
    const orders = [];
    const calls = [];
    service = createMediaWorkbenchService({ inputDir: inputDir, draftStore: draftStore, publicationLedger: ledger });

    const result = await service.submitTasksSerially([{
      filename: "multi.txt",
      filePath: path.join(inputDir, "multi.txt"),
      title: "Multi title",
      content: "Multi title\n\nBody",
      selectedResources: [
        { resourceId: "201", name: "One", price: 12 },
        { resourceId: "202", name: "Two", price: 18 }
      ]
    }], {
      client: {
        sendArticle: async function(payload) {
          calls.push(payload);
          return { data: { order_nid: "order-" + payload.resourceId } };
        }
      },
      orderStore: { record: async function(entry) { orders.push(entry); } }
    });

    assert.equal(result.ok, 2);
    assert.equal(calls.length, 2);
    assert.equal(orders.length, 2);
    assert.equal(new Set(orders.map(function(entry) { return entry.publicationId; })).size, 2);
    assert.ok(calls.every(function(call) { return call.thirdId.includes("publication:") && call.thirdId.includes(":attempt:"); }));
    assert.equal(ledger.list().length, 2);
    assert.ok(ledger.list().every(function(record) { return record.status === "submitted"; }));
  });

  it("marks explicit rejection failed and unknown timeout uncertain without treating either as success", async function() {
    fs.writeFileSync(path.join(inputDir, "outcomes.txt"), "Outcome title\n\nBody", "utf-8");
    const ledger = createPublicationLedger({ workspaceRoot: root });
    service = createMediaWorkbenchService({ inputDir: inputDir, draftStore: draftStore, publicationLedger: ledger });
    const articles = [{
      filename: "outcomes.txt",
      filePath: path.join(inputDir, "outcomes.txt"),
      title: "Outcome title",
      content: "Outcome title\n\nBody",
      selectedResources: [{ resourceId: "reject", price: 1 }, { resourceId: "timeout", price: 1 }]
    }];

    await service.submitTasksSerially(articles, {
      client: {
        sendArticle: async function(payload) {
          if (payload.resourceId === "reject") {
            const error = new Error("API 请求失败: 明确拒绝");
            error.code = "MEDIA_API_REJECTED";
            throw error;
          }
          throw new Error("API 请求超时 (30000ms)");
        }
      },
      orderStore: { record: async function() {} }
    });

    const records = ledger.list();
    assert.equal(records.length, 2);
    assert.deepEqual(records.map(function(record) { return record.status; }).sort(), ["failed", "uncertain"]);
  });
});

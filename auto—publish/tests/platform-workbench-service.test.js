const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createPlatformWorkbenchService } = require("../desktop/services/platform-workbench-service");

describe("platform-workbench-service", function() {
  let root;
  let service;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "platform-workbench-"));
    fs.mkdirSync(path.join(root, "input", "lieju"), { recursive: true });
    fs.mkdirSync(path.join(root, "input", "toutiao"), { recursive: true });
    fs.mkdirSync(path.join(root, "input", "hepan"), { recursive: true });
    fs.mkdirSync(path.join(root, "input", "media"), { recursive: true });
    fs.writeFileSync(path.join(root, "input", "lieju", "a.txt"), "A\nBody", "utf-8");
    service = createPlatformWorkbenchService({
      rootDir: root,
      platforms: [
        { id: "lieju", scanDir: "lieju" },
        { id: "toutiao", scanDir: "toutiao" },
        { id: "hepan", scanDir: "hepan" },
        { id: "media", scanDir: "media" }
      ]
    });
  });

  afterEach(function() {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("scans non-media platform queues", function() {
    const queue = service.scanQueue();
    assert.deepStrictEqual(queue.map(function(group) { return group.platformId; }), ["lieju", "toutiao", "hepan"]);
    assert.strictEqual(queue[0].articles[0].filename, "a.txt");
  });

  it("builds selected article target plan", function() {
    const plan = service.buildSelectedPlan({
      selectedArticles: [{ sourcePlatformId: "lieju", filename: "a.txt" }],
      targetPlatformIds: ["toutiao", "hepan"]
    });
    assert.deepStrictEqual(plan.tasks.map(function(task) {
      return task.targetPlatformId;
    }), ["toutiao", "hepan"]);
  });

  it("submits selected platform tasks serially and continues after failure", async function() {
    const calls = [];
    const serviceWithAdapters = createPlatformWorkbenchService({
      rootDir: root,
      platforms: [{ id: "lieju", scanDir: "lieju" }],
      adapters: {
        toutiao: {
          id: "toutiao",
          parseArticleFiles: function(items) {
            return items.map(function(item) {
              return { title: item.filename, sourceFile: item.filePath, filename: item.filename };
            });
          },
          ensureSession: function() {},
          ensureLoggedIn: async function() {},
          publishArticle: async function(article) {
            calls.push("toutiao:" + article.filename);
            return true;
          },
          closeSession: function() {}
        },
        hepan: {
          id: "hepan",
          parseArticleFiles: function(items) {
            return items.map(function(item) {
              return { title: item.filename, sourceFile: item.filePath, filename: item.filename };
            });
          },
          ensureSession: function() {},
          ensureLoggedIn: async function() {},
          publishArticle: async function(article) {
            calls.push("hepan:" + article.filename);
            throw new Error("hepan failed");
          },
          closeSession: function() {}
        }
      }
    });
    const plan = serviceWithAdapters.buildSelectedPlan({
      selectedArticles: [{ sourcePlatformId: "lieju", filename: "a.txt" }],
      targetPlatformIds: ["toutiao", "hepan"]
    });
    const result = await serviceWithAdapters.submitSelectedPlanSerially(plan, { autoSubmit: true, interactive: false });
    assert.deepStrictEqual(calls, ["toutiao:a.txt", "hepan:a.txt"]);
    assert.strictEqual(result.ok, 1);
    assert.strictEqual(result.fail, 1);
  });
});

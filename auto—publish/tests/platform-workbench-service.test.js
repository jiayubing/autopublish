const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  createPlatformWorkbenchService,
} = require("../desktop/services/platform-workbench-service");

describe("platform-workbench-service", function () {
  let root;
  let service;

  beforeEach(function () {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "platform-workbench-"));
    fs.mkdirSync(path.join(root, "input", "lieju"), { recursive: true });
    fs.mkdirSync(path.join(root, "input", "toutiao"), { recursive: true });
    fs.mkdirSync(path.join(root, "input", "hepan"), { recursive: true });
    fs.mkdirSync(path.join(root, "input", "media"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "input", "lieju", "a.txt"),
      "A\nBody",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(root, "input", "lieju", "a.txt.submission.json"),
      JSON.stringify({
        submissionBatchId: "batch-fixture",
        clientId: "client-1",
        generatedArticleId: "article-1",
        targetPlatformId: "lieju",
        accountProfileId: "account-lieju",
        contentHash: require("crypto")
          .createHash("sha256")
          .update("A\nBody")
          .digest("hex"),
        status: "queued",
      }),
      "utf8",
    );
    service = createPlatformWorkbenchService({
      rootDir: root,
      platforms: [
        { id: "lieju", scanDir: "lieju" },
        { id: "toutiao", scanDir: "toutiao" },
        { id: "hepan", scanDir: "hepan" },
        { id: "media", scanDir: "media" },
      ],
    });
  });

  afterEach(function () {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("scans non-media platform queues", function () {
    const queue = service.scanQueue();
    assert.deepStrictEqual(
      queue.map(function (group) {
        return group.platformId;
      }),
      ["lieju", "toutiao", "hepan"],
    );
    assert.strictEqual(queue[0].articles[0].filename, "a.txt");
    assert.strictEqual(queue[0].articles[0].accountProfileId, "account-lieju");
  });

  it("scans and resolves platform queues from the injected content input path", function () {
    const portableInput = path.join(root, ".autopublish", "input");
    fs.mkdirSync(path.join(portableInput, "lieju"), { recursive: true });
    fs.writeFileSync(
      path.join(portableInput, "lieju", "portable.txt"),
      "Portable\nBody",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(portableInput, "lieju", "portable.txt.submission.json"),
      JSON.stringify({
        submissionBatchId: "batch-fixture",
        clientId: "client-1",
        generatedArticleId: "article-1",
        targetPlatformId: "lieju",
        accountProfileId: "account-lieju",
        contentHash: require("crypto")
          .createHash("sha256")
          .update("Portable\nBody")
          .digest("hex"),
        status: "queued",
      }),
      "utf8",
    );
    const portableService = createPlatformWorkbenchService({
      rootDir: root,
      paths: { input: portableInput },
      platforms: [{ id: "lieju", scanDir: "lieju" }],
    });

    const queue = portableService.scanQueue();
    assert.deepStrictEqual(
      queue[0].articles.map(function (article) {
        return article.filename;
      }),
      ["portable.txt"],
    );
    const plan = portableService.buildSelectedPlan({
      selectedArticles: [
        {
          sourcePlatformId: "lieju",
          filename: "portable.txt",
          accountProfiles: { lieju: "account-lieju" },
        },
      ],
      targetPlatformIds: ["lieju"],
    });
    assert.equal(
      plan.tasks[0].filePath,
      path.join(portableInput, "lieju", "portable.txt"),
    );
    assert.equal(
      portableService.resolveSubmissionFile("lieju", "portable.txt"),
      path.join(portableInput, "lieju", "portable.txt"),
    );
  });

  it("builds selected article target plan", function () {
    const plan = service.buildSelectedPlan({
      selectedArticles: [
        {
          sourcePlatformId: "lieju",
          filename: "a.txt",
          accountProfiles: { lieju: "account-lieju" },
        },
      ],
      targetPlatformIds: ["lieju"],
    });
    assert.deepStrictEqual(
      plan.tasks.map(function (task) {
        return task.targetPlatformId;
      }),
      ["lieju"],
    );
  });

  it("prepares an account-bound workflow command without writing publication state", async function () {
    const commandService = createPlatformWorkbenchService({
      rootDir: root,
      platforms: [{ id: "lieju", scanDir: "lieju" }],
      adapters: {
        lieju: {
          id: "lieju",
          parseArticleFiles: async (items) => [
            {
              title: "title",
              body: "body",
              sourceFile: items[0].filePath,
              filename: items[0].filename,
            },
          ],
        },
      },
    });
    const prepared = await commandService.preparePublicationCommand({
      sourcePlatformId: "lieju",
      filename: "a.txt",
      targetPlatformId: "lieju",
      accountProfileId: "account-lieju",
    });
    assert.equal(prepared.target.accountProfileId, "account-lieju");
    assert.equal(prepared.target.platformId, "lieju");
    assert.equal(prepared.workerTask.filename, "a.txt");
  });

  it("keeps source-file body when an adapter omits its body field", async function () {
    const commandService = createPlatformWorkbenchService({
      rootDir: root,
      platforms: [{ id: "lieju", scanDir: "lieju" }],
      adapters: {
        lieju: {
          id: "lieju",
          parseArticleFiles: async () => [{ title: "adapter title" }],
        },
      },
    });
    const prepared = await commandService.preparePublicationCommand({
      sourcePlatformId: "lieju",
      filename: "a.txt",
      targetPlatformId: "lieju",
      accountProfileId: "account-lieju",
    });
    assert.equal(prepared.title, "adapter title");
    assert.equal(prepared.body, "Body");
  });

  it("reports missing article body before the operational DTO boundary", async function () {
    fs.writeFileSync(
      path.join(root, "input", "lieju", "a.txt"),
      "Title only",
      "utf-8",
    );
    const commandService = createPlatformWorkbenchService({
      rootDir: root,
      platforms: [{ id: "lieju", scanDir: "lieju" }],
      adapters: {
        lieju: {
          id: "lieju",
          parseArticleFiles: async () => [{ title: "adapter title" }],
        },
      },
    });
    await assert.rejects(
      commandService.preparePublicationCommand({
        sourcePlatformId: "lieju",
        filename: "a.txt",
        targetPlatformId: "lieju",
        accountProfileId: "account-lieju",
      }),
      (error) => error && error.code === "ARTICLE_BODY_REQUIRED",
    );
  });
});

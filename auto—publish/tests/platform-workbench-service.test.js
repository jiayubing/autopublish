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
        version: 2,
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

  it("fails the queue read when an article or sidecar entry cannot be inspected", function () {
    const articlePath = path.join(root, "input", "lieju", "a.txt");
    const sidecarPath = articlePath + ".submission.json";
    const originalLstatSync = fs.lstatSync;
    try {
      [articlePath, sidecarPath].forEach(function (failedPath) {
        fs.lstatSync = function (candidate) {
          if (candidate === failedPath) {
            const error = new Error("synthetic queue lstat failure");
            error.code = "EACCES";
            throw error;
          }
          return originalLstatSync.apply(fs, arguments);
        };
        assert.throws(
          function () {
            service.scanQueue();
          },
          { code: "PLATFORM_QUEUE_READ_FAILED" },
        );
      });
    } finally {
      fs.lstatSync = originalLstatSync;
    }
  });

  it("fails the queue read when a sidecar cannot be read", function () {
    const sidecarPath = path.join(
      root,
      "input",
      "lieju",
      "a.txt.submission.json",
    );
    const originalReadFileSync = fs.readFileSync;
    try {
      fs.readFileSync = function (candidate) {
        if (candidate === sidecarPath) {
          const error = new Error("synthetic sidecar read failure");
          error.code = "EACCES";
          throw error;
        }
        return originalReadFileSync.apply(fs, arguments);
      };
      assert.throws(
        function () {
          service.scanQueue();
        },
        { code: "PLATFORM_QUEUE_READ_FAILED" },
      );
    } finally {
      fs.readFileSync = originalReadFileSync;
    }
  });

  it("keeps malformed sidecars as invalid input", function () {
    const sidecarPath = path.join(
      root,
      "input",
      "lieju",
      "a.txt.submission.json",
    );
    fs.writeFileSync(sidecarPath, "{ malformed", "utf8");
    assert.deepEqual(service.scanQueue()[0].articles, []);
    assert.equal(
      service.readSubmissionMetadata("lieju", "a.txt").reason,
      "SUBMISSION_SIDECAR_INVALID",
    );
  });

  it("fails the queue read when an input directory cannot be read", function () {
    const inputDir = path.join(root, "input", "lieju");
    const originalReaddirSync = fs.readdirSync;
    try {
      fs.readdirSync = function (candidate) {
        if (candidate === inputDir) {
          const error = new Error("synthetic input directory read failure");
          error.code = "EIO";
          throw error;
        }
        return originalReaddirSync.apply(fs, arguments);
      };
      assert.throws(
        function () {
          service.scanQueue();
        },
        { code: "PLATFORM_QUEUE_READ_FAILED" },
      );
    } finally {
      fs.readdirSync = originalReaddirSync;
    }
  });

  it("fails the queue read when an input path is a regular file", function () {
    const inputDir = path.join(root, "input", "lieju");
    fs.rmSync(inputDir, { recursive: true, force: true });
    fs.writeFileSync(inputDir, "not a directory", "utf8");
    assert.throws(
      function () {
        service.scanQueue();
      },
      { code: "PLATFORM_QUEUE_READ_FAILED" },
    );
  });

  it("fails the queue read when an input path is a symlink", function () {
    const inputDir = path.join(root, "input", "lieju");
    const targetDir = path.join(root, "symlink-target");
    fs.rmSync(inputDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir);
    try {
      fs.symlinkSync(targetDir, inputDir, "junction");
    } catch (error) {
      assert.fail(`symlink setup failed: ${error.message}`);
    }
    assert.throws(
      function () {
        service.scanQueue();
      },
      { code: "PLATFORM_QUEUE_READ_FAILED" },
    );
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
        version: 2,
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
    assert.equal(
      portableService.resolveSubmissionFile("lieju", "portable.txt"),
      path.join(portableInput, "lieju", "portable.txt"),
    );
  });

  it("does not admit unversioned or aliased queue sidecars", function () {
    fs.writeFileSync(
      path.join(root, "input", "lieju", "legacy.txt"),
      "Legacy\nBody",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(root, "input", "lieju", "legacy.txt.submission.json"),
      JSON.stringify({
        submissionBatchId: "batch-fixture",
        clientId: "client-1",
        generatedArticleId: "article-legacy",
        targetPlatform: "lieju",
        accountProfileId: "account-lieju",
        contentHash: require("crypto")
          .createHash("sha256")
          .update("Legacy\nBody")
          .digest("hex"),
        status: "queued",
      }),
      "utf8",
    );
    assert.deepEqual(
      service.scanQueue()[0].articles.map(function (article) {
        return article.filename;
      }),
      ["a.txt"],
    );
    assert.equal(
      service.readSubmissionMetadata("lieju", "legacy.txt").reason,
      "SUBMISSION_SIDECAR_VERSION_INVALID",
    );
  });

  it("prepares an account-bound workflow command without writing publication state", async function () {
    const commandService = createPlatformWorkbenchService({
      rootDir: root,
      platforms: [{ id: "lieju", scanDir: "lieju" }],
      adapters: {
        lieju: {
          id: "lieju",
          parse: async (items) => [
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
          parse: async () => [{ title: "adapter title" }],
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
    const sidecarPath = path.join(
      root,
      "input",
      "lieju",
      "a.txt.submission.json",
    );
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf-8"));
    sidecar.contentHash = require("crypto")
      .createHash("sha256")
      .update("Title only")
      .digest("hex");
    fs.writeFileSync(sidecarPath, JSON.stringify(sidecar), "utf-8");
    const commandService = createPlatformWorkbenchService({
      rootDir: root,
      platforms: [{ id: "lieju", scanDir: "lieju" }],
      adapters: {
        lieju: {
          id: "lieju",
          parse: async () => [{ title: "adapter title" }],
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

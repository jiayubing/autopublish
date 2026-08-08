"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const os = require("node:os");
const {
  createWorkerPublisherExecutor,
} = require("../desktop/worker/publisher-executor");
const {
  createWorkerPublisher,
} = require("../desktop/services/worker-publisher");

test("platform worker does not construct the legacy stateful workbench", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "desktop", "worker", "run-task.js"),
    "utf8",
  );
  assert.doesNotMatch(source, /platform-workbench-service/);
  assert.doesNotMatch(source, /createPlatformWorkbenchService/);
});

test("worker publisher executor returns an adapter outcome without a state writer", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-worker-"));
  const queue = path.join(root, "queue");
  fs.mkdirSync(queue);
  fs.writeFileSync(path.join(queue, "article.md"), "# title\nbody", "utf8");
  let published = 0;
  const executor = createWorkerPublisherExecutor({
    paths: { input: root },
    adapters: {
      fixture: {
        scanDir: "queue",
        parseArticleFiles: async () => [{ title: "title", body: "body" }],
        publishArticle: async () => {
          published += 1;
          return { status: "accepted", remoteId: "remote-1", remoteUrl: "https://example.test/article/1" };
        },
      },
    },
  });
  const result = await executor.execute({
    tasks: [
      {
        sourcePlatformId: "queue",
        targetPlatformId: "fixture",
        filename: "article.md",
      },
    ],
  });
  assert.equal(published, 1);
  assert.deepEqual(result.results[0].outcome, {
    status: "accepted",
    remoteId: "remote-1",
    remoteUrl: "https://example.test/article/1",
  });
});

test("worker publisher executor turns an adapter exception into uncertain", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-worker-"));
  const queue = path.join(root, "queue");
  fs.mkdirSync(queue);
  fs.writeFileSync(path.join(queue, "article.md"), "# title\nbody", "utf8");
  const executor = createWorkerPublisherExecutor({
    paths: { input: root },
    adapters: {
      fixture: {
        scanDir: "queue",
        parseArticleFiles: async () => [{ title: "title", body: "body" }],
        publishArticle: async () => {
          throw new Error("connection ended");
        },
      },
    },
  });
  const result = await executor.execute({
    tasks: [
      {
        sourcePlatformId: "queue",
        targetPlatformId: "fixture",
        filename: "article.md",
      },
    ],
  });
  assert.deepEqual(result.results[0].outcome, {
    status: "uncertain",
    errorCode: "PUBLISHER_EXCEPTION",
  });
});

test("dead main submission service seam is absent", () => {
  assert.equal(
    fs.existsSync(
      path.join(
        __dirname,
        "..",
        "desktop",
        "services",
        "publication-submission-service.js",
      ),
    ),
    false,
  );
});

test("worker publisher executor never invokes the media adapter without main-process settings", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase04-media-worker-"));
  try {
    fs.mkdirSync(path.join(root, "source"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "source", "article.md"),
      "fixture",
      "utf8",
    );
    let invoked = false;
    const executor = createWorkerPublisherExecutor({
      paths: { input: root },
      adapters: {
        media: {
          scanDir: "source",
          publishArticle: async () => {
            invoked = true;
          },
        },
      },
    });
    const result = await executor.execute({
      tasks: [
        {
          sourcePlatformId: "source",
          targetPlatformId: "media",
          filename: "article.md",
        },
      ],
    });
    assert.equal(
      result.results[0].outcome.errorCode,
      "MEDIA_MAIN_PROCESS_REQUIRED",
    );
    assert.equal(invoked, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("main worker publisher never upgrades an evidence-free worker success", async () => {
  const publisher = createWorkerPublisher({
    inspectAccount: async () => ({
      accountProfileId: "account-1",
      verified: true,
    }),
    taskForInput: () => ({
      sourcePlatformId: "queue",
      filename: "article.md",
      targetPlatformId: "toutiao",
      accountProfileId: "account-1",
    }),
    taskService: {
      startPlatformSubmit: async () => ({
        ok: true,
        data: { results: [{ outcome: { status: "accepted" } }] },
      }),
    },
  });
  const result = await publisher.publish({ articleId: "article-1" });
  assert.equal(result.status, "uncertain");
  assert.equal(result.error.code, "PUBLISHER_EVIDENCE_REQUIRED");
});

test("main worker publisher preserves an accepted outcome only when the remote evidence binds this input", async () => {
  const publisher = createWorkerPublisher({
    inspectAccount: async () => ({
      verified: true,
      accountProfileId: "account-1",
    }),
    taskForInput: () => ({
      sourcePlatformId: "queue",
      filename: "article.md",
      targetPlatformId: "toutiao",
      accountProfileId: "account-1",
    }),
    taskService: {
      startPlatformSubmit: async () => ({
        ok: true,
        data: {
          results: [
            {
              outcome: {
                status: "accepted",
                remoteId: "remote-1",
                remoteUrl: "https://example.test/article/1",
              },
            },
          ],
        },
      }),
    },
  });
  const result = await publisher.publish({
    version: 1,
    articleId: "article-1",
    attemptId: "attempt-1",
    target: {
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: "account-1",
    },
    title: "title",
    body: "body",
  });
  assert.deepEqual(result, {
    status: "accepted",
    evidence: {
      articleId: "article-1",
      attemptId: "attempt-1",
      targetKey: "platform:toutiao:account:account-1",
      accountProfileId: "account-1",
      remoteId: "remote-1",
      remoteUrl: "https://example.test/article/1",
    },
  });
});

test("main worker publisher inspects the sole registered task account before publication", async () => {
  let inspected;
  const publisher = createWorkerPublisher({
    inspectAccount: async (task) => {
      inspected = task;
      return { verified: true, accountProfileId: task.accountProfileId };
    },
    taskService: {
      startPlatformSubmit: async () => ({
        ok: true,
        data: {
          results: [
            { outcome: { status: "article_rejected", errorCode: "REMOTE_REJECTED" } },
          ],
        },
      }),
    },
  });
  publisher.registerAttempt("attempt-1", {
    sourcePlatformId: "queue",
    filename: "article.md",
    targetPlatformId: "toutiao",
    accountProfileId: "account-1",
  });
  assert.deepEqual(await publisher.inspectAccount(), {
    verified: true,
    accountProfileId: "account-1",
  });
  assert.deepEqual(inspected, {
    sourcePlatformId: "queue",
    filename: "article.md",
    targetPlatformId: "toutiao",
    accountProfileId: "account-1",
  });
  publisher.unregisterAttempt("attempt-1");
  assert.deepEqual(await publisher.inspectAccount(), { verified: false });
});

"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const os = require("node:os");
const { createWorkerPublisherExecutor } = require("../desktop/worker/publisher-executor");
const { createWorkerPublisher } = require("../desktop/services/worker-publisher");
const { createPublicationSubmissionService } = require("../desktop/services/publication-submission-service");

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
          return { status: "submitted", remoteId: "remote-1" };
        },
      },
    },
  });
  const result = await executor.execute({
    tasks: [{ sourcePlatformId: "queue", targetPlatformId: "fixture", filename: "article.md" }],
  });
  assert.equal(published, 1);
  assert.deepEqual(result.results[0].outcome, { status: "submitted", remoteId: "remote-1" });
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
        publishArticle: async () => { throw new Error("connection ended"); },
      },
    },
  });
  const result = await executor.execute({
    tasks: [{ sourcePlatformId: "queue", targetPlatformId: "fixture", filename: "article.md" }],
  });
  assert.deepEqual(result.results[0].outcome, { status: "uncertain", errorCode: "PUBLISHER_EXCEPTION" });
});

test("worker publisher executor never invokes the media adapter without main-process settings", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase04-media-worker-"));
  try {
    fs.mkdirSync(path.join(root, "source"), { recursive: true });
    fs.writeFileSync(path.join(root, "source", "article.md"), "fixture", "utf8");
    let invoked = false;
    const executor = createWorkerPublisherExecutor({ paths: { input: root }, adapters: { media: { scanDir: "source", publishArticle: async () => { invoked = true; } } } });
    const result = await executor.execute({ tasks: [{ sourcePlatformId: "source", targetPlatformId: "media", filename: "article.md" }] });
    assert.equal(result.results[0].outcome.errorCode, "MEDIA_MAIN_PROCESS_REQUIRED");
    assert.equal(invoked, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("main worker publisher never upgrades an evidence-free worker success", async () => {
  const publisher = createWorkerPublisher({
    inspectAccount: async () => ({ accountProfileId: "account-1", verified: true }),
    taskForInput: () => ({ sourcePlatformId: "queue", filename: "article.md", targetPlatformId: "toutiao", accountProfileId: "account-1" }),
    taskService: { startPlatformSubmit: async () => ({ ok: true, data: { results: [{ outcome: { status: "published" } }] } }) },
  });
  const result = await publisher.publish({ articleId: "article-1" });
  assert.equal(result.status, "uncertain");
  assert.equal(result.error.code, "PUBLISHER_EVIDENCE_REQUIRED");
});

test("main worker publisher preserves a published outcome only when the remote evidence binds this input", async () => {
  const publisher = createWorkerPublisher({
    inspectAccount: async () => ({ verified: true, accountProfileId: "account-1" }),
    taskForInput: () => ({ sourcePlatformId: "queue", filename: "article.md", targetPlatformId: "toutiao", accountProfileId: "account-1" }),
    taskService: { startPlatformSubmit: async () => ({ ok: true, data: { results: [{ outcome: { status: "published", remoteId: "remote-1", remoteUrl: "https://example.test/article/1" } }] } }) },
  });
  const result = await publisher.publish({ version: 1, articleId: "article-1", attemptId: "attempt-1", target: { kind: "platform", platformId: "toutiao", accountProfileId: "account-1" }, title: "title", body: "body" });
  assert.deepEqual(result, { status: "published", evidence: { articleId: "article-1", attemptId: "attempt-1", targetKey: "platform:toutiao:account:account-1", accountProfileId: "account-1", remoteId: "remote-1", remoteUrl: "https://example.test/article/1" } });
});

test("main worker publisher inspects the sole registered task account before publication", async () => {
  let inspected;
  const publisher = createWorkerPublisher({
    inspectAccount: async (task) => { inspected = task; return { verified: true, accountProfileId: task.accountProfileId }; },
    taskService: { startPlatformSubmit: async () => ({ ok: true, data: { results: [{ outcome: { status: "failed", errorCode: "REMOTE_REJECTED" } }] } }) },
  });
  publisher.registerAttempt("attempt-1", { sourcePlatformId: "queue", filename: "article.md", targetPlatformId: "toutiao", accountProfileId: "account-1" });
  assert.deepEqual(await publisher.inspectAccount(), { verified: true, accountProfileId: "account-1" });
  assert.deepEqual(inspected, { sourcePlatformId: "queue", filename: "article.md", targetPlatformId: "toutiao", accountProfileId: "account-1" });
  publisher.unregisterAttempt("attempt-1");
  assert.deepEqual(await publisher.inspectAccount(), { verified: false });
});

test("main submission service commits the durable queue batch item rather than creating a second batch", async () => {
  const registered = [];
  const service = createPublicationSubmissionService({
    workbench: { preparePublicationCommand: async () => ({ articleId: "article-1", title: "title", body: "body", target: { kind: "platform", platformId: "toutiao", accountProfileId: "account-1" }, postProcessingPayload: { sourcePlatformId: "toutiao", filename: "article.md", batchId: "batch-queue-1" }, workerTask: { filename: "article.md" } }) },
    workerPublisher: { registerAttempt: (id, task) => registered.push([id, task.filename]), unregisterAttempt: () => registered.push(["removed"]) },
    workflow: { publish: async (command) => ({ attemptId: command.attemptId, status: "uncertain" }) },
    operationalStore: { findSubmissionItem: () => ({ itemId: "item-1", batchId: "batch-queue-1", status: "queued" }), claimSubmissionItemById: (input) => ({ itemId: input.itemId, batchId: input.batchId }), createSubmissionBatch: () => { throw new Error("must not create a second batch"); } },
  });
  const result = await service.submit({ tasks: [{ filename: "article.md" }] });
  assert.equal(result.results[0].status, "uncertain");
  assert.equal(result.batchId, "batch-queue-1");
  assert.equal(registered[0][1], "article.md");
  assert.deepEqual(registered[1], ["removed"]);
});

test("main releases an item claim when account verification rejects before remote publication", async () => {
  const released = [];
  const service = createPublicationSubmissionService({
    workbench: { preparePublicationCommand: async () => ({ articleId: "article-1", title: "title", body: "body", target: { kind: "platform", platformId: "toutiao", accountProfileId: "account-1" }, postProcessingPayload: { sourcePlatformId: "toutiao", filename: "article.md", batchId: "batch-queue-1" }, workerTask: { filename: "article.md" } }) },
    workerPublisher: { registerAttempt: () => {}, unregisterAttempt: () => {} },
    workflow: { publish: async () => { const error = new Error("account mismatch"); error.code = "ACCOUNT_PROFILE_INSPECTION_UNVERIFIED"; throw error; } },
    operationalStore: {
      findSubmissionItem: () => ({ itemId: "item-1", batchId: "batch-queue-1", status: "queued" }),
      claimSubmissionItemById: (input) => ({ itemId: input.itemId, batchId: input.batchId, revision: 2, payload: { clientId: "client-1" } }),
      updateSubmissionItem: (input) => released.push(input),
    },
  });
  await assert.rejects(() => service.submit({ tasks: [{ filename: "article.md" }] }), { code: "ACCOUNT_PROFILE_INSPECTION_UNVERIFIED" });
  assert.equal(released.length, 1);
  assert.equal(released[0].status, "queued");
  assert.equal(released[0].revision, 2);
});

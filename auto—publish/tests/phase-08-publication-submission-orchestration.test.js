"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createPublicationWorkflow,
} = require("../src/application/publication-workflow");
const {
  createPostProcessingCoordinator,
} = require("../src/application/publication-workflow/post-processing");
const {
  createMediaPublicationSubmissionService,
} = require("../desktop/services/media-publication-submission-service");
const {
  createPublicationSubmissionOrchestrator,
} = require("../desktop/services/publication-submission-orchestrator");
const {
  createDesktopTaskService,
} = require("../desktop/services/desktop-task-service");
const {
  createWorkerPublisher,
} = require("../desktop/services/worker-publisher");
const {
  createPublicationPostProcessor,
} = require("../desktop/services/publication-post-processor");

function fixtureDependencies(events) {
  let createdPayload;
  return {
    workbench: {
      prepareMediaPublicationCommands: async () => [
        {
          articleId: "article-media",
          target: { kind: "media", mediaResourceId: "resource-media" },
          title: "title",
          body: "body",
          postProcessingPayload: { filename: "fixture.md" },
        },
      ],
    },
    operationalStore: {
      createSubmissionBatch(input) {
        events.push("create-batch");
        createdPayload = input.items[0].payload;
        return {
          batchId: input.batchId,
          items: [{ itemId: "item-media", revision: 1 }],
        };
      },
      claimSubmissionItemById(input) {
        events.push("claim-item");
        return {
          itemId: input.itemId,
          batchId: input.batchId,
          revision: 2,
          claimToken: input.claimToken,
          payload: createdPayload,
        };
      },
    },
    workflow: {
      publish: async (command) => {
        events.push("workflow-publish");
        assert.equal(command.batchItemId, "item-media");
        assert.equal(command.target.mediaResourceId, "resource-media");
        assert.equal(command.postProcessingPayload.batchId.length > 0, true);
        return { status: "submitted", attemptId: command.attemptId };
      },
    },
  };
}

test("media submission uses the shared claim-to-workflow seam", async () => {
  const events = [];
  const dependencies = fixtureDependencies(events);
  const service = createMediaPublicationSubmissionService(dependencies);
  const result = await service.submit([
    {
      filename: "fixture.md",
      selectedResources: [{ resourceId: "resource-media" }],
    },
  ]);
  assert.equal(result.results[0].status, "submitted");
  assert.deepEqual(events, ["create-batch", "claim-item", "workflow-publish"]);
});

test("failed submission retry reclaims the existing item and calls PublicationWorkflow.retry", async () => {
  let claimed = null;
  let retried = null;
  const orchestrator = createPublicationSubmissionOrchestrator({
    operationalStore: {
      findSubmissionItem: () => ({
        itemId: "item-1",
        batchId: "batch-1",
        payload: {},
      }),
      claimSubmissionItemById: (input) => {
        claimed = input;
        return {
          itemId: input.itemId,
          batchId: input.batchId,
          revision: 4,
          claimToken: input.claimToken,
          payload: {},
        };
      },
    },
    workflow: {
      publish: async () => {
        throw new Error("must not publish a retry as a new aggregate");
      },
      retry: async (command) => {
        retried = command;
        return { status: "published" };
      },
    },
  });
  const result = await orchestrator.submit(
    [
      {
        publicationId: "publication-1",
        articleId: "article-1",
        target: {
          kind: "platform",
          platformId: "toutiao",
          accountProfileId: "account-1",
        },
        title: "title",
        body: "body",
        postProcessingPayload: { batchId: "batch-1" },
      },
    ],
    { retryFailed: true },
  );
  assert.equal(claimed.retryFailed, true);
  assert.equal(retried.publicationId, "publication-1");
  assert.equal(retried.batchItemId, "item-1");
  assert.equal(result.results[0].status, "published");
});

test("auto-trash intent is retained in both the durable item and workflow payload", async () => {
  let durablePayload = null;
  let workflowPayload = null;
  const orchestrator = createPublicationSubmissionOrchestrator({
    workflow: {
      publish: async (command) => {
        workflowPayload = command.postProcessingPayload;
        return { status: "published" };
      },
    },
    operationalStore: {
      createSubmissionBatch: (input) => {
        durablePayload = input.items[0].payload;
        return {
          batchId: input.batchId,
          items: [{ itemId: "item-auto-trash", revision: 1 }],
        };
      },
      claimSubmissionItemById: (input) => ({
        itemId: input.itemId,
        batchId: input.batchId,
        revision: 2,
        claimToken: input.claimToken,
        payload: durablePayload,
      }),
    },
  });
  await orchestrator.submit(
    [
      {
        articleId: "article-auto-trash",
        target: {
          kind: "platform",
          platformId: "toutiao",
          accountProfileId: "account-1",
        },
        title: "title",
        body: "body",
        postProcessingPayload: {
          batchId: "batch-auto-trash",
          clientId: "client-1",
          articleId: "article-auto-trash",
          sourcePlatformId: "toutiao",
          filename: "fixture.md",
        },
      },
    ],
    { createBatch: true, autoTrash: true },
  );
  assert.equal(durablePayload.autoTrash, true);
  assert.equal(workflowPayload.autoTrash, true);
  assert.equal(workflowPayload.clientId, "client-1");
});

test("shared submission validation runs before batch creation or item claim", async () => {
  let creates = 0;
  let claims = 0;
  const service = createMediaPublicationSubmissionService({
    workbench: {
      prepareMediaPublicationCommands: async () => [
        {
          articleId: "article-media",
          target: { kind: "media", mediaResourceId: "resource-media" },
          title: "bad\u0000title",
          body: "body",
        },
      ],
    },
    workflow: { publish: async () => ({ status: "submitted" }) },
    operationalStore: {
      createSubmissionBatch: () => {
        creates += 1;
        throw new Error("must not create a batch");
      },
      claimSubmissionItemById: () => {
        claims += 1;
        throw new Error("must not claim an item");
      },
    },
  });
  await assert.rejects(() => service.submit([{ filename: "fixture.md" }]), {
    code: "PUBLISH_INPUT_INVALID",
  });
  assert.equal(creates, 0);
  assert.equal(claims, 0);
});

test("renewed submission claims cannot be taken over during a long remote call", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-08-claim-lease-"));
  let now = new Date("2026-08-03T00:00:00.000Z");
  const store = createOperationalStore({
    workspaceRoot: root,
    clock: () => new Date(now),
  });
  try {
    const batch = store.createSubmissionBatch({
      batchId: "batch-claim-lease",
      items: [
        {
          articleId: "article-claim-lease",
          target: { kind: "media", mediaResourceId: "resource-claim-lease" },
          payload: { attemptId: "attempt-claim-lease" },
        },
      ],
    });
    const first = store.claimSubmissionItemById({
      batchId: batch.batchId,
      itemId: batch.items[0].itemId,
      claimToken: "claim-one",
      leaseMs: 30000,
    });
    now = new Date(now.getTime() + 10000);
    store.renewSubmissionItemClaim({
      batchId: batch.batchId,
      itemId: first.itemId,
      claimToken: first.claimToken,
      leaseMs: 30000,
    });
    now = new Date(now.getTime() + 21000);
    assert.throws(
      () =>
        store.claimSubmissionItemById({
          batchId: batch.batchId,
          itemId: batch.items[0].itemId,
          claimToken: "claim-two",
        }),
      { code: "OPERATIONAL_BATCH_ITEM_NOT_EXECUTABLE" },
    );
    store.reservePublicationTarget({
      articleId: "article-claim-lease",
      publicationId: "publication-claim-lease",
      attemptId: "attempt-claim-lease",
      target: { kind: "media", mediaResourceId: "resource-claim-lease" },
      batchItemId: first.itemId,
      postProcessingPayload: {},
    });
    now = new Date(now.getTime() + 10000);
    assert.throws(
      () =>
        store.claimSubmissionItemById({
          batchId: batch.batchId,
          itemId: batch.items[0].itemId,
          claimToken: "claim-three",
        }),
      { code: "OPERATIONAL_BATCH_ITEM_NOT_EXECUTABLE" },
    );
    store.commitRemoteOutcome({
      attemptId: "attempt-claim-lease",
      batchItemId: first.itemId,
      batchClaimToken: first.claimToken,
      outcome: {
        status: "published",
        evidence: {
          articleId: "article-claim-lease",
          attemptId: "attempt-claim-lease",
          targetKey: "media-resource:resource-claim-lease",
          remoteId: "remote-claim-lease",
          remoteUrl: "https://example.test/remote-claim-lease",
        },
      },
    });
    assert.equal(
      store.getSubmissionBatch(batch.batchId).items[0].status,
      "completed",
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("startup recovery closes a stranded submission claim with its publication intent", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-08-recovery-claim-"),
  );
  let store = createOperationalStore({ workspaceRoot: root });
  try {
    const batch = store.createSubmissionBatch({
      batchId: "batch-recovery-claim",
      items: [
        {
          articleId: "article-recovery-claim",
          target: { kind: "media", mediaResourceId: "resource-recovery-claim" },
          payload: { attemptId: "attempt-recovery-claim" },
        },
      ],
    });
    const claim = store.claimSubmissionItemById({
      batchId: batch.batchId,
      itemId: batch.items[0].itemId,
      claimToken: "claim-recovery",
    });
    store.reservePublicationTarget({
      articleId: "article-recovery-claim",
      publicationId: "publication-recovery-claim",
      attemptId: "attempt-recovery-claim",
      target: { kind: "media", mediaResourceId: "resource-recovery-claim" },
      batchItemId: claim.itemId,
      postProcessingPayload: { batchId: batch.batchId },
    });
    store.close();
    store = createOperationalStore({ workspaceRoot: root });
    const archived = [];
    const workflow = createPublicationWorkflow({
      clock: () => new Date(),
      operationalStore: store,
      postProcessor: {
        process: async (job) => {
          archived.push(job.payload);
        },
      },
      publisher: {
        inspectAccount: async () => ({ verified: false }),
        publish: async () => ({ status: "failed" }),
      },
    });
    assert.deepEqual(await workflow.recover(), {
      recoveryCount: 1,
      postProcessingCount: 0,
    });
    assert.equal(store.getSubmissionBatch(batch.batchId).status, "failed");
    assert.equal(
      store.getSubmissionBatch(batch.batchId).items[0].status,
      "failed",
    );
    const reconciled = await workflow.reconcile({
      attemptId: "attempt-recovery-claim",
      outcome: {
        status: "published",
        evidence: {
          articleId: "article-recovery-claim",
          attemptId: "attempt-recovery-claim",
          targetKey: "media-resource:resource-recovery-claim",
          remoteId: "remote-recovery-claim",
          remoteUrl: "https://example.test/remote-recovery-claim",
        },
      },
    });
    assert.equal(reconciled.status, "published");
    assert.equal(store.getSubmissionBatch(batch.batchId).status, "completed");
    assert.equal(
      store.getSubmissionBatch(batch.batchId).items[0].status,
      "completed",
    );
    assert.deepEqual(archived, [{ batchId: batch.batchId }]);
    const database = new DatabaseSync(store.databasePath, { readOnly: true });
    try {
      const lease = database
        .prepare(
          "SELECT claim_token,claim_until FROM submission_items WHERE item_id=?",
        )
        .get(claim.itemId);
      assert.equal(lease.claim_token, null);
      assert.equal(lease.claim_until, null);
    } finally {
      database.close();
    }
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("blocked auto-trash remains attention-visible and durable across restart", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-08-auto-trash-recovery-"),
  );
  const input = path.join(root, "input");
  const published = path.join(root, "published");
  fs.mkdirSync(path.join(input, "media"), { recursive: true });
  fs.writeFileSync(path.join(input, "media", "fixture.md"), "# title\n\nbody");
  let store = createOperationalStore({ workspaceRoot: root });
  try {
    const batch = store.createSubmissionBatch({
      batchId: "batch-auto-trash-recovery",
      items: [
        {
          articleId: "article-auto-trash-recovery",
          target: {
            kind: "media",
            mediaResourceId: "resource-auto-trash-recovery",
          },
          payload: {
            attemptId: "attempt-auto-trash-recovery",
            batchId: "batch-auto-trash-recovery",
            sourcePlatformId: "media",
            filename: "fixture.md",
            autoTrash: true,
            clientId: "client-auto-trash-recovery",
            articleId: "article-auto-trash-recovery",
          },
        },
      ],
    });
    const claim = store.claimSubmissionItemById({
      batchId: batch.batchId,
      itemId: batch.items[0].itemId,
      claimToken: "claim-auto-trash-recovery",
    });
    store.reservePublicationTarget({
      articleId: "article-auto-trash-recovery",
      publicationId: "publication-auto-trash-recovery",
      attemptId: "attempt-auto-trash-recovery",
      target: {
        kind: "media",
        mediaResourceId: "resource-auto-trash-recovery",
      },
      batchItemId: claim.itemId,
      postProcessingPayload: {
        batchId: batch.batchId,
        sourcePlatformId: "media",
        filename: "fixture.md",
        autoTrash: true,
        clientId: "client-auto-trash-recovery",
        articleId: "article-auto-trash-recovery",
      },
    });
    store.commitRemoteOutcome({
      attemptId: "attempt-auto-trash-recovery",
      batchItemId: claim.itemId,
      batchClaimToken: claim.claimToken,
      outcome: {
        status: "published",
        evidence: {
          articleId: "article-auto-trash-recovery",
          attemptId: "attempt-auto-trash-recovery",
          targetKey: "media-resource:resource-auto-trash-recovery",
          remoteId: "remote-auto-trash-recovery",
          remoteUrl: "https://example.test/remote-auto-trash-recovery",
        },
      },
      postProcessingPayload: {
        batchId: batch.batchId,
        sourcePlatformId: "media",
        filename: "fixture.md",
        autoTrash: true,
        clientId: "client-auto-trash-recovery",
        articleId: "article-auto-trash-recovery",
      },
    });
    const processor = createPublicationPostProcessor({
      workspaceRoot: root,
      paths: { input, published },
      platforms: [{ id: "media", scanDir: "media" }],
      operationalStore: store,
      autoTrashArticle: async () => ({
        status: "blocked",
        reasonCode: "REMOVAL_BLOCKED",
      }),
    });
    const coordinator = createPostProcessingCoordinator({
      operationalStore: store,
      postProcessor: processor,
    });
    const result = await coordinator.drain({ collectResults: true });
    assert.equal(result.results[0].status, "failed");
    assert.equal(result.results[0].output.autoTrash.status, "blocked");
    assert.equal(store.listPostProcessingAttention().length, 1);
    assert.equal(
      store.listPostProcessingAttention()[0].reasonCode,
      "REMOVAL_BLOCKED",
    );
    store.close();
    store = createOperationalStore({ workspaceRoot: root });
    const attention = store.listPostProcessingAttention();
    assert.equal(attention.length, 1);
    assert.equal(
      attention[0].payload.postProcessingOutput.autoTrash.status,
      "blocked",
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("terminal multi-target archive blocking becomes attention instead of an infinite retry", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-08-terminal-archive-"),
  );
  const input = path.join(root, "input");
  const published = path.join(root, "published");
  fs.mkdirSync(path.join(input, "media"), { recursive: true });
  fs.writeFileSync(path.join(input, "media", "fixture.md"), "# title\n\nbody");
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const targetOne = {
      kind: "media",
      mediaResourceId: "resource-terminal-one",
    };
    const targetTwo = {
      kind: "media",
      mediaResourceId: "resource-terminal-two",
    };
    const batch = store.createSubmissionBatch({
      batchId: "batch-terminal-archive",
      items: [
        {
          articleId: "article-terminal-archive",
          target: targetOne,
          payload: {
            attemptId: "attempt-terminal-one",
            batchId: "batch-terminal-archive",
            sourcePlatformId: "media",
            filename: "fixture.md",
          },
        },
        {
          articleId: "article-terminal-archive",
          target: targetTwo,
          payload: {
            attemptId: "attempt-terminal-two",
            batchId: "batch-terminal-archive",
            sourcePlatformId: "media",
            filename: "fixture.md",
          },
        },
      ],
    });
    const first = store.claimSubmissionItemById({
      batchId: batch.batchId,
      itemId: batch.items[0].itemId,
      claimToken: "claim-terminal-one",
    });
    store.reservePublicationTarget({
      articleId: "article-terminal-archive",
      publicationId: "publication-terminal-one",
      attemptId: "attempt-terminal-one",
      target: targetOne,
      batchItemId: first.itemId,
      postProcessingPayload: {
        batchId: batch.batchId,
        sourcePlatformId: "media",
        filename: "fixture.md",
      },
    });
    store.commitRemoteOutcome({
      attemptId: "attempt-terminal-one",
      batchItemId: first.itemId,
      batchClaimToken: first.claimToken,
      outcome: {
        status: "published",
        evidence: {
          articleId: "article-terminal-archive",
          attemptId: "attempt-terminal-one",
          targetKey: "media-resource:resource-terminal-one",
          remoteId: "remote-terminal-one",
          remoteUrl: "https://example.test/remote-terminal-one",
        },
      },
      postProcessingPayload: {
        batchId: batch.batchId,
        sourcePlatformId: "media",
        filename: "fixture.md",
      },
    });
    const second = store.claimSubmissionItemById({
      batchId: batch.batchId,
      itemId: batch.items[1].itemId,
      claimToken: "claim-terminal-two",
    });
    store.reservePublicationTarget({
      articleId: "article-terminal-archive",
      publicationId: "publication-terminal-two",
      attemptId: "attempt-terminal-two",
      target: targetTwo,
      batchItemId: second.itemId,
      postProcessingPayload: {
        batchId: batch.batchId,
        sourcePlatformId: "media",
        filename: "fixture.md",
      },
    });
    store.commitRemoteOutcome({
      attemptId: "attempt-terminal-two",
      batchItemId: second.itemId,
      batchClaimToken: second.claimToken,
      outcome: {
        status: "failed",
        error: {
          code: "REMOTE_FAILED",
          category: "remote",
          retryability: "never",
          userMessage: "Remote failed",
        },
      },
      postProcessingPayload: {
        batchId: batch.batchId,
        sourcePlatformId: "media",
        filename: "fixture.md",
      },
    });
    const processor = createPublicationPostProcessor({
      workspaceRoot: root,
      paths: { input, published },
      platforms: [{ id: "media", scanDir: "media" }],
      operationalStore: store,
    });
    const result = await createPostProcessingCoordinator({
      operationalStore: store,
      postProcessor: processor,
    }).drain({ collectResults: true });
    assert.equal(
      result.results[0].errorCode,
      "POST_PROCESSING_ARCHIVE_BLOCKED",
    );
    assert.equal(store.listPostProcessingAttention().length, 1);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("real platform stop and pause do not claim the next submission item", async () => {
  for (const action of ["stop", "pause"]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `phase-08-${action}-`));
    const paths = { contentLibrary: root, tmp: path.join(root, "tmp") };
    let firstWorker;
    let firstRunId;
    let resolveFirstWorker;
    const firstWorkerReady = new Promise((resolve) => {
      resolveFirstWorker = resolve;
    });
    let workerCount = 0;
    const claimed = [];
    const items = ["item-stop-one", "item-stop-two"];
    const taskService = createDesktopTaskService({
      cwd: root,
      paths,
      fork: (script, args) => {
        const payload = JSON.parse(args[1]);
        const child = new EventEmitter();
        child.send = () => {};
        child.kill = () => child.emit("exit", 0);
        workerCount += 1;
        if (workerCount === 1) {
          firstWorker = child;
          firstRunId = payload.runId;
          resolveFirstWorker();
        } else {
          process.nextTick(() => {
            const task = payload.plan.tasks[0];
            child.emit("message", {
              schemaVersion: 1,
              runId: payload.runId,
              type: "result",
              payload: {
                ok: true,
                data: {
                  results: [
                    {
                      task,
                      outcome: {
                        status: "failed",
                        errorCode: "UNEXPECTED_NEXT_RUN",
                      },
                    },
                  ],
                },
              },
            });
            child.emit("exit", 0);
          });
        }
        return child;
      },
    });
    const workerPublisher = createWorkerPublisher({
      taskService,
      inspectAccount: async () => ({
        verified: true,
        accountProfileId: "account-1",
      }),
    });
    const commands = [1, 2].map((index) => ({
      articleId: `article-stop-${index}`,
      target: {
        kind: "platform",
        platformId: "toutiao",
        accountProfileId: "account-1",
      },
      title: "title",
      body: "body",
      workerTask: {
        sourcePlatformId: "source",
        filename: `article-${index}.md`,
        targetPlatformId: "toutiao",
        accountProfileId: "account-1",
      },
      postProcessingPayload: {},
    }));
    const orchestrator = createPublicationSubmissionOrchestrator({
      workerPublisher,
      workflow: {
        publish: (command) =>
          workerPublisher.publish({
            version: 1,
            articleId: command.articleId,
            attemptId: command.attemptId,
            target: command.target,
            title: command.title,
            body: command.body,
          }),
      },
      operationalStore: {
        createSubmissionBatch: (input) => ({
          batchId: input.batchId,
          items: input.items.map((item, index) => ({
            itemId: items[index],
            batchId: input.batchId,
            revision: 1,
            payload: item.payload,
          })),
        }),
        claimSubmissionItemById: (input) => {
          claimed.push(input.itemId);
          return {
            itemId: input.itemId,
            batchId: input.batchId,
            revision: 2,
            claimToken: input.claimToken,
            payload: {},
          };
        },
      },
    });

    try {
      const pending = orchestrator.submit(commands, { createBatch: true });
      await firstWorkerReady;
      const firstTask = commands[0].workerTask;
      firstWorker.emit("message", {
        schemaVersion: 1,
        runId: firstRunId,
        type: "state",
        payload: { phase: "remote-started", task: firstTask },
      });
      if (action === "stop") taskService.stopPlatformSubmit(firstRunId);
      else taskService.pausePlatformSubmit(firstRunId);
      firstWorker.emit("message", {
        schemaVersion: 1,
        runId: firstRunId,
        type: "result",
        payload: {
          ok: true,
          errorCode: "STOP_REQUESTED",
          data: {
            results: [
              {
                task: firstTask,
                outcome: { status: "failed", errorCode: "STOP_REQUESTED" },
              },
            ],
          },
        },
      });
      firstWorker.emit("exit", 0);
      const result = await pending;
      assert.equal(result.results.length, 1, action);
      assert.deepEqual(claimed, ["item-stop-one"], action);
      assert.equal(workerCount, 1, action);
    } finally {
      taskService.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("ordinary archive error code survives post-processing restart", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-08-archive-error-recovery-"),
  );
  const input = path.join(root, "input");
  const published = path.join(root, "published");
  fs.mkdirSync(path.join(input, "toutiao"), { recursive: true });
  fs.mkdirSync(published, { recursive: true });
  fs.writeFileSync(path.join(input, "toutiao", "fixture.md"), "fixture");
  fs.writeFileSync(path.join(published, "fixture.md"), "existing");
  let store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "fixture",
    });
    const target = {
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: profile.accountProfileId,
    };
    const batch = store.createSubmissionBatch({
      batchId: "batch-archive-error-recovery",
      items: [
        {
          articleId: "article-archive-error-recovery",
          target,
          payload: {
            sourcePlatformId: "toutiao",
            filename: "fixture.md",
          },
        },
      ],
    });
    const claim = store.claimSubmissionItemById({
      batchId: batch.batchId,
      itemId: batch.items[0].itemId,
      claimToken: "claim-archive-error-recovery",
    });
    const postProcessingPayload = {
      batchId: batch.batchId,
      sourcePlatformId: "toutiao",
      filename: "fixture.md",
    };
    store.reservePublicationTarget({
      articleId: "article-archive-error-recovery",
      publicationId: "publication-archive-error-recovery",
      attemptId: "attempt-archive-error-recovery",
      target,
      batchItemId: claim.itemId,
      postProcessingPayload,
    });
    store.commitRemoteOutcome({
      attemptId: "attempt-archive-error-recovery",
      batchItemId: claim.itemId,
      batchClaimToken: claim.claimToken,
      outcome: {
        status: "published",
        evidence: {
          articleId: "article-archive-error-recovery",
          attemptId: "attempt-archive-error-recovery",
          targetKey: `platform:toutiao:account:${profile.accountProfileId}`,
          accountProfileId: profile.accountProfileId,
          remoteId: "remote-archive-error-recovery",
          remoteUrl: "https://example.test/archive-error-recovery",
        },
      },
      postProcessingPayload,
    });
    const processor = createPublicationPostProcessor({
      workspaceRoot: root,
      paths: { input, published },
      platforms: [{ id: "toutiao", scanDir: "toutiao" }],
      operationalStore: store,
    });
    const coordinator = createPostProcessingCoordinator({
      operationalStore: store,
      postProcessor: processor,
    });
    const result = await coordinator.drain({ collectResults: true });
    assert.equal(result.results[0].errorCode, "PUBLISHED_ARCHIVE_CONFLICT");
    assert.equal(
      store.listPostProcessingAttention()[0].errorCode,
      "PUBLISHED_ARCHIVE_CONFLICT",
    );
    assert.equal(
      store.listPostProcessingAttention()[0].reasonCode,
      "PUBLISHED_ARCHIVE_CONFLICT",
    );
    assert.equal(
      store.listPostProcessingAttention()[0].payload.postProcessingErrorCode,
      "PUBLISHED_ARCHIVE_CONFLICT",
    );

    store.close();
    store = createOperationalStore({ workspaceRoot: root });
    const attention = store.listPostProcessingAttention();
    assert.equal(attention.length, 1);
    assert.equal(attention[0].errorCode, "PUBLISHED_ARCHIVE_CONFLICT");
    assert.equal(attention[0].reasonCode, "PUBLISHED_ARCHIVE_CONFLICT");
    assert.equal(
      attention[0].payload.postProcessingErrorCode,
      "PUBLISHED_ARCHIVE_CONFLICT",
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("latest retry error code overrides stale auto-trash output after restart", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-08-retry-error-recovery-"),
  );
  let store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "fixture",
    });
    const target = {
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: profile.accountProfileId,
    };
    const batch = store.createSubmissionBatch({
      batchId: "batch-retry-error-recovery",
      items: [
        {
          articleId: "article-retry-error-recovery",
          target,
          payload: {},
        },
      ],
    });
    const claim = store.claimSubmissionItemById({
      batchId: batch.batchId,
      itemId: batch.items[0].itemId,
      claimToken: "claim-retry-error-recovery",
    });
    const postProcessingPayload = {
      batchId: batch.batchId,
      sourcePlatformId: "toutiao",
      filename: "fixture.md",
    };
    store.reservePublicationTarget({
      articleId: "article-retry-error-recovery",
      publicationId: "publication-retry-error-recovery",
      attemptId: "attempt-retry-error-recovery",
      target,
      batchItemId: claim.itemId,
      postProcessingPayload,
    });
    store.commitRemoteOutcome({
      attemptId: "attempt-retry-error-recovery",
      batchItemId: claim.itemId,
      batchClaimToken: claim.claimToken,
      outcome: {
        status: "published",
        evidence: {
          articleId: "article-retry-error-recovery",
          attemptId: "attempt-retry-error-recovery",
          targetKey: `platform:toutiao:account:${profile.accountProfileId}`,
          accountProfileId: profile.accountProfileId,
          remoteId: "remote-retry-error-recovery",
          remoteUrl: "https://example.test/remote-retry-error-recovery",
        },
      },
      postProcessingPayload,
    });

    const firstToken = "post-retry-error-first";
    const job = store.claimPostProcessing({ claimToken: firstToken });
    store.completePostProcessing({
      jobId: job.jobId,
      claimToken: firstToken,
      success: false,
      output: {
        autoTrash: { status: "blocked", reasonCode: "REMOVAL_BLOCKED" },
      },
    });
    assert.equal(
      store.listPostProcessingAttention()[0].reasonCode,
      "REMOVAL_BLOCKED",
    );

    store.retryPostProcessing({ jobId: job.jobId });
    const retryToken = "post-retry-error-second";
    const retry = store.claimPostProcessing({ claimToken: retryToken });
    store.completePostProcessing({
      jobId: retry.jobId,
      claimToken: retryToken,
      success: false,
      errorCode: "PUBLISHED_ARCHIVE_CONFLICT",
    });
    assert.equal(
      store.listPostProcessingAttention()[0].reasonCode,
      "PUBLISHED_ARCHIVE_CONFLICT",
    );

    store.retryPostProcessing({ jobId: job.jobId });
    const autoTrashRetryToken = "post-retry-error-third";
    const autoTrashRetry = store.claimPostProcessing({
      claimToken: autoTrashRetryToken,
    });
    store.completePostProcessing({
      jobId: autoTrashRetry.jobId,
      claimToken: autoTrashRetryToken,
      success: false,
      output: {
        autoTrash: { status: "failed", reasonCode: "REMOVAL_RETRY_FAILED" },
      },
    });
    assert.equal(
      store.listPostProcessingAttention()[0].reasonCode,
      "REMOVAL_RETRY_FAILED",
    );

    store.close();
    store = createOperationalStore({ workspaceRoot: root });
    const attention = store.listPostProcessingAttention();
    assert.equal(attention.length, 1);
    assert.equal(attention[0].errorCode, "REMOVAL_RETRY_FAILED");
    assert.equal(attention[0].reasonCode, "REMOVAL_RETRY_FAILED");
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("duplicate media publication is rejected before creating a zombie batch", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-08-duplicate-media-"),
  );
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const target = {
      kind: "media",
      mediaResourceId: "resource-duplicate-media",
    };
    store.reservePublicationTarget({
      articleId: "article-duplicate-media",
      publicationId: "publication-duplicate-media",
      attemptId: "attempt-duplicate-media",
      target,
    });
    store.commitRemoteOutcome({
      attemptId: "attempt-duplicate-media",
      outcome: {
        status: "published",
        evidence: {
          articleId: "article-duplicate-media",
          attemptId: "attempt-duplicate-media",
          targetKey: "media-resource:resource-duplicate-media",
          remoteId: "remote-duplicate-media",
          remoteUrl: "https://example.test/remote-duplicate-media",
        },
      },
    });
    const orchestrator = createPublicationSubmissionOrchestrator({
      operationalStore: store,
      workflow: { publish: async () => ({ status: "published" }) },
    });
    await assert.rejects(
      () =>
        orchestrator.submit(
          [
            {
              articleId: "article-duplicate-media",
              target,
              title: "title",
              body: "body",
              postProcessingPayload: {},
            },
          ],
          { createBatch: true },
        ),
      { code: "PUBLICATION_DUPLICATE" },
    );
    assert.deepEqual(store.listSubmissionBatches(), []);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reconcile restores the durable submission link and drains archive work", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-08-reconcile-link-"),
  );
  let store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "Fixture account",
    });
    const target = {
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: profile.accountProfileId,
    };
    const batch = store.createSubmissionBatch({
      batchId: "batch-reconcile",
      items: [
        {
          articleId: "article-reconcile",
          target,
          payload: { sourcePlatformId: "toutiao", filename: "fixture.md" },
        },
      ],
    });
    const firstWorkflow = createPublicationWorkflow({
      clock: () => new Date(),
      operationalStore: store,
      publisher: {
        inspectAccount: async () => ({
          verified: true,
          accountProfileId: profile.accountProfileId,
        }),
        publish: async () => {
          throw new Error("remote timeout");
        },
      },
    });
    const first = await firstWorkflow.publish({
      articleId: "article-reconcile",
      publicationId: "publication-reconcile",
      attemptId: "attempt-reconcile",
      target,
      title: "title",
      body: "body",
      batchItemId: batch.items[0].itemId,
      postProcessingPayload: {
        sourcePlatformId: "toutiao",
        filename: "fixture.md",
        batchId: batch.batchId,
      },
    });
    assert.equal(first.status, "uncertain");
    assert.equal(
      store.getSubmissionBatch(batch.batchId).items[0].status,
      "failed",
    );
    store.close();
    store = createOperationalStore({ workspaceRoot: root });
    const archived = [];
    const recoveredWorkflow = createPublicationWorkflow({
      clock: () => new Date(),
      operationalStore: store,
      postProcessor: {
        process: async (job) => archived.push(job.payload),
      },
      publisher: {
        inspectAccount: async () => ({ verified: false }),
        publish: async () => ({ status: "failed" }),
      },
    });
    const result = await recoveredWorkflow.reconcile({
      attemptId: "attempt-reconcile",
      outcome: {
        status: "published",
        evidence: {
          articleId: "article-reconcile",
          attemptId: "attempt-reconcile",
          targetKey: `platform:toutiao:account:${profile.accountProfileId}`,
          accountProfileId: profile.accountProfileId,
          remoteId: "remote-reconcile",
          remoteUrl: "https://example.test/reconcile",
        },
      },
    });
    assert.equal(result.status, "published");
    const item = store.getSubmissionBatch(batch.batchId).items[0];
    assert.equal(item.status, "completed");
    assert.equal(item.payload.outcomeStatus, "published");
    assert.equal(store.getSubmissionBatch(batch.batchId).status, "completed");
    const database = new DatabaseSync(store.databasePath, { readOnly: true });
    try {
      const lease = database
        .prepare(
          "SELECT claim_token,claim_until FROM submission_items WHERE item_id=?",
        )
        .get(item.itemId);
      assert.equal(lease.claim_token, null);
      assert.equal(lease.claim_until, null);
    } finally {
      database.close();
    }
    assert.deepEqual(archived, [
      {
        sourcePlatformId: "toutiao",
        filename: "fixture.md",
        batchId: batch.batchId,
      },
    ]);
    assert.equal(store.claimPostProcessing({ claimToken: "post-done" }), null);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("multi-target archive eligibility is deferred without leaving failed attention", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-08-multi-target-archive-"),
  );
  const input = path.join(root, "input");
  const published = path.join(root, "published");
  fs.mkdirSync(path.join(input, "media"), { recursive: true });
  fs.writeFileSync(path.join(input, "media", "fixture.md"), "# title\n\nbody");
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const targetOne = { kind: "media", mediaResourceId: "resource-one" };
    const targetTwo = { kind: "media", mediaResourceId: "resource-two" };
    const autoTrashSelections = [];
    const batch = store.createSubmissionBatch({
      batchId: "batch-multi-target",
      items: [
        {
          articleId: "article-multi-target",
          target: targetOne,
          payload: {
            attemptId: "attempt-resource-one",
            batchId: "batch-multi-target",
            autoTrash: true,
            clientId: "client-multi-target",
            articleId: "article-multi-target",
            sourcePlatformId: "media",
            filename: "fixture.md",
          },
        },
        {
          articleId: "article-multi-target",
          target: targetTwo,
          payload: {
            attemptId: "attempt-resource-two",
            batchId: "batch-multi-target",
            autoTrash: true,
            clientId: "client-multi-target",
            articleId: "article-multi-target",
            sourcePlatformId: "media",
            filename: "fixture.md",
          },
        },
      ],
    });
    const workflow = createPublicationWorkflow({
      clock: () => new Date(),
      operationalStore: store,
      postProcessor: createPublicationPostProcessor({
        workspaceRoot: root,
        paths: { input, published },
        platforms: [{ id: "media", scanDir: "media" }],
        operationalStore: store,
        autoTrashArticle: async (selection) => {
          autoTrashSelections.push(selection);
          return { status: "committed" };
        },
      }),
      publisher: {
        inspectAccount: async () => ({ verified: true }),
        publish: async (inputValue) => ({
          status: "published",
          evidence: {
            articleId: inputValue.articleId,
            attemptId: inputValue.attemptId,
            targetKey:
              inputValue.target.mediaResourceId === "resource-one"
                ? "media-resource:resource-one"
                : "media-resource:resource-two",
            remoteId: `remote-${inputValue.target.mediaResourceId}`,
            remoteUrl: `https://example.test/${inputValue.target.mediaResourceId}`,
          },
        }),
      },
    });
    const firstClaim = store.claimSubmissionItemById({
      batchId: batch.batchId,
      itemId: batch.items[0].itemId,
      claimToken: "claim-one",
    });
    await workflow.publish({
      articleId: "article-multi-target",
      publicationId: "publication-resource-one",
      attemptId: "attempt-resource-one",
      target: targetOne,
      title: "title",
      body: "body",
      batchItemId: firstClaim.itemId,
      batchClaimToken: firstClaim.claimToken,
      postProcessingPayload: {
        batchId: batch.batchId,
        autoTrash: true,
        clientId: "client-multi-target",
        articleId: "article-multi-target",
        sourcePlatformId: "media",
        filename: "fixture.md",
      },
    });
    assert.deepEqual(store.listPostProcessingAttention(), []);

    const secondClaim = store.claimSubmissionItemById({
      batchId: batch.batchId,
      itemId: batch.items[1].itemId,
      claimToken: "claim-two",
    });
    await workflow.publish({
      articleId: "article-multi-target",
      publicationId: "publication-resource-two",
      attemptId: "attempt-resource-two",
      target: targetTwo,
      title: "title",
      body: "body",
      batchItemId: secondClaim.itemId,
      batchClaimToken: secondClaim.claimToken,
      postProcessingPayload: {
        batchId: batch.batchId,
        autoTrash: true,
        clientId: "client-multi-target",
        articleId: "article-multi-target",
        sourcePlatformId: "media",
        filename: "fixture.md",
      },
    });
    assert.deepEqual(store.listPostProcessingAttention(), []);
    assert.equal(store.getSubmissionBatch(batch.batchId).status, "completed");
    assert.deepEqual(autoTrashSelections, [
      { clientId: "client-multi-target", articleId: "article-multi-target" },
      { clientId: "client-multi-target", articleId: "article-multi-target" },
    ]);
    assert.equal(fs.existsSync(path.join(input, "media", "fixture.md")), false);
    assert.equal(fs.existsSync(path.join(published, "fixture.md")), true);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function orchestratorFixture(workflow, extra) {
  const released = [];
  const item = {
    itemId: "item-1",
    batchId: "batch-1",
    revision: 1,
    payload: { batchId: "batch-1" },
  };
  const orchestrator = createPublicationSubmissionOrchestrator({
    workflow,
    operationalStore: {
      findSubmissionItem: () => item,
      claimSubmissionItemById: (input) => ({
        ...item,
        revision: 2,
        claimToken: input.claimToken,
      }),
      updateSubmissionItem: (input) => released.push(input),
    },
    ...(extra || {}),
  });
  return { orchestrator, released };
}

function orchestratorCommand(overrides) {
  return Object.assign(
    {
      articleId: "article-1",
      target: {
        kind: "platform",
        platformId: "toutiao",
        accountProfileId: "account-1",
      },
      title: "title",
      body: "body",
      postProcessingPayload: { batchId: "batch-1" },
    },
    overrides,
  );
}

test("submission claim is released when worker registration fails", async () => {
  let published = false;
  const { orchestrator, released } = orchestratorFixture(
    {
      publish: async () => {
        published = true;
        return { status: "submitted" };
      },
    },
    {
      workerPublisher: {
        registerAttempt: () => {
          throw Object.assign(new Error("worker registration failed"), {
            code: "WORKER_REGISTER_FAILED",
          });
        },
      },
    },
  );
  await assert.rejects(
    () =>
      orchestrator.submit([
        orchestratorCommand({ workerTask: { filename: "fixture.md" } }),
      ]),
    { code: "WORKER_REGISTER_FAILED" },
  );
  assert.equal(published, false);
  assert.equal(released.length, 1);
  assert.equal(released[0].status, "queued");
});

test("submission claim is released for pre-intent duplicate and uncertain errors only", async () => {
  for (const code of ["PUBLICATION_DUPLICATE", "PUBLICATION_UNCERTAIN"]) {
    const { orchestrator, released } = orchestratorFixture({
      publish: async () => {
        throw Object.assign(new Error(code), { code });
      },
    });
    await assert.rejects(() => orchestrator.submit([orchestratorCommand()]), {
      code,
    });
    assert.equal(released.length, 1, code);
    assert.equal(released[0].status, "failed", code);
  }
  const remote = orchestratorFixture({
    publish: async () => {
      throw Object.assign(new Error("remote call failed"), {
        code: "REMOTE_CALL_FAILED",
      });
    },
  });
  await assert.rejects(
    () => remote.orchestrator.submit([orchestratorCommand()]),
    { code: "REMOTE_CALL_FAILED" },
  );
  assert.equal(remote.released.length, 0);
});

test("production submission surfaces do not retain retired orchestration paths", () => {
  const root = path.resolve(__dirname, "..");
  const sources = [
    fs.readFileSync(
      path.join(root, "desktop", "ipc", "publication-ipc.js"),
      "utf8",
    ),
    fs.readFileSync(
      path.join(root, "desktop", "ipc", "platform-ipc.js"),
      "utf8",
    ),
    fs.readFileSync(
      path.join(root, "src", "platforms", "toutiao", "adapter.js"),
      "utf8",
    ),
    fs.readFileSync(
      path.join(root, "src", "platforms", "lieju", "adapter.js"),
      "utf8",
    ),
    fs.readFileSync(
      path.join(root, "src", "platforms", "hepan", "adapter.js"),
      "utf8",
    ),
  ].join("\n");
  assert.doesNotMatch(
    sources,
    /publicationLedger|applyPostPublishDisposition|legacyStatus/,
  );
});

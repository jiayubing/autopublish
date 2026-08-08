"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const domain = require("../src/domain");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createPublicationWorkflow,
} = require("../src/application/publication-workflow");
const {
  createPublicationSubmissionOrchestrator,
} = require("../desktop/services/publication-submission-orchestrator");
const {
  createDesktopTaskService,
} = require("../desktop/services/desktop-task-service");
const {
  createWorkerPublisher,
} = require("../desktop/services/worker-publisher");

function prepareRegularAttempt(transitionPorts, articleId, profile) {
  const title = `title ${articleId}`;
  const body = `body ${articleId}`;
  const target = {
    kind: "platform",
    platformId: profile.platformId,
    accountProfileId: profile.accountProfileId,
  };
  const admitted =
    transitionPorts.regularQueueTransitions.admitRegularQueueItem({
      clientId: "client-1",
      articleId,
      batchId: `regular-batch-${articleId}`,
      itemId: `regular-item-${articleId}`,
      publicationId: `regular-publication-${articleId}`,
      attemptId: `regular-attempt-${articleId}`,
      target,
      publicationSnapshot: {
        articleId,
        title,
        body,
        fingerprint: domain.contentFingerprint(title, body),
      },
      payload: { clientId: "client-1" },
    });
  transitionPorts.regularQueueGroupTransitions.setRegularQueueGroupRunIntent({
    queueGroupId: admitted.queueGroupId,
    running: true,
  });
  const claim =
    transitionPorts.regularQueueGroupTransitions.claimRegularQueueGroupHead({
      queueGroupId: admitted.queueGroupId,
      claimToken: `regular-claim-${articleId}`,
      leaseMs: 30000,
    });
  const evidence = domain.createTextOnlyPreparedSubmissionEvidenceV1(claim);
  transitionPorts.regularQueueGroupTransitions.beginRegularRemoteSubmission({
    regularPublicationAttemptId: claim.regularPublicationAttemptId,
    claimToken: claim.claimToken,
    preparedSubmissionEvidenceV1: evidence,
  });
  return { admitted, claim, evidence, target };
}

function acceptRegularAttempt(transitionPorts, prepared) {
  return transitionPorts.regularOutcomeTransitions.recordRegularAccepted({
    regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
    observation: {
      status: "accepted",
      code: "REGULAR_ACCEPTED",
      observedAt: "2026-08-07T01:00:02.000Z",
      providerEventAt: "2026-08-07T01:00:01.000Z",
      remoteId: `remote-${prepared.claim.regularPublicationAttemptId}`,
      remoteUrl: "https://example.test/published",
    },
  });
}

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
  const orchestrator = createPublicationSubmissionOrchestrator({
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
  await assert.rejects(
    () =>
      orchestrator.submit(
        [
          {
            articleId: "article-media",
            target: { kind: "media", mediaResourceId: "resource-media" },
            title: "bad\u0000title",
            body: "body",
          },
        ],
        { createBatch: true },
      ),
    { code: "PUBLISH_INPUT_INVALID" },
  );
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
        status: "failed",
        error: {
          code: "REMOTE_REJECTED",
          category: "remote",
          retryability: "never",
          userMessage: "Remote rejected the submission",
        },
      },
    });
    assert.equal(
      store.getSubmissionBatch(batch.batchId).items[0].status,
      "failed",
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
    assert.equal(typeof workflow.reconcile, "undefined");
    assert.deepEqual(archived, []);
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

test("named regular success creates immutable publication without legacy auto-trash work", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-08-regular-success-"),
  );
  const transitionPorts = {};
  let store = createOperationalStore({ workspaceRoot: root, transitionPorts });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "Fixture account",
    });
    const prepared = prepareRegularAttempt(
      transitionPorts,
      "article-regular-success",
      profile,
    );
    acceptRegularAttempt(transitionPorts, prepared);
    assert.equal(store.listPostProcessingAttention().length, 0);
    assert.equal(
      store.claimPostProcessing({ claimToken: "legacy-post" }),
      null,
    );
    store.close();
    const reopenedPorts = {};
    store = createOperationalStore({
      workspaceRoot: root,
      transitionPorts: reopenedPorts,
    });
    const record = store.listPublicationRecords({
      articleIds: ["article-regular-success"],
    })[0];
    assert.equal(record.status, "published");
    const snapshot =
      reopenedPorts.regularOutcomeTransitions.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
      });
    assert.equal(snapshot.publicationEvidenceV1.resultCode, "REGULAR_ACCEPTED");
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("published article cannot reserve a second target", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-08-published-target-"),
  );
  const transitionPorts = {};
  const store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts,
  });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "Fixture account",
    });
    const targetTwo = {
      kind: "media",
      mediaResourceId: "resource-published-two",
    };
    const prepared = prepareRegularAttempt(
      transitionPorts,
      "article-published-target",
      profile,
    );
    acceptRegularAttempt(transitionPorts, prepared);
    assert.throws(
      () =>
        store.reservePublicationTarget({
          articleId: "article-published-target",
          publicationId: "publication-published-two",
          attemptId: "attempt-published-two",
          target: targetTwo,
        }),
      { code: "PUBLICATION_DUPLICATE" },
    );
    assert.equal(
      store.listPublicationRecords({ articleIds: ["article-published-target"] })
        .length,
      1,
    );
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

test("generic success writer fails closed without creating archive work", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-08-generic-success-closed-"),
  );
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "Fixture account",
    });
    store.reservePublicationTarget({
      articleId: "article-generic-success-closed",
      publicationId: "publication-generic-success-closed",
      attemptId: "attempt-generic-success-closed",
      target: {
        kind: "platform",
        platformId: "toutiao",
        accountProfileId: profile.accountProfileId,
      },
    });
    assert.throws(
      () =>
        store.commitRemoteOutcome({
          attemptId: "attempt-generic-success-closed",
          outcome: { status: "published" },
        }),
      { code: "PUBLICATION_SUCCESS_WRITER_CLOSED" },
    );
    assert.equal(
      store.claimPostProcessing({ claimToken: "post-closed" }),
      null,
    );
    assert.equal(
      store.listPublicationRecords({
        articleIds: ["article-generic-success-closed"],
      })[0].status,
      "queued",
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("named regular rejection closes the attempt without legacy retry work", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-08-regular-rejected-"),
  );
  const transitionPorts = {};
  const store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts,
  });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "Fixture account",
    });
    const prepared = prepareRegularAttempt(
      transitionPorts,
      "article-regular-rejected",
      profile,
    );
    const result =
      transitionPorts.regularOutcomeTransitions.recordRegularArticleRejected({
        regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
        observation: {
          status: "article_rejected",
          code: "REMOTE_REJECTED",
          observedAt: "2026-08-07T01:00:02.000Z",
        },
      });
    assert.equal(result.status, "article_rejected");
    assert.equal(
      store.listPublicationRecords({
        articleIds: ["article-regular-rejected"],
      })[0].status,
      "failed",
    );
    assert.equal(
      store.claimPostProcessing({ claimToken: "legacy-retry" }),
      null,
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("named publication success rejects a duplicate without creating a second batch", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-08-duplicate-media-"),
  );
  const transitionPorts = {};
  const store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts,
  });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "Fixture account",
    });
    const prepared = prepareRegularAttempt(
      transitionPorts,
      "article-duplicate-media",
      profile,
    );
    acceptRegularAttempt(transitionPorts, prepared);
    assert.throws(
      () =>
        transitionPorts.regularQueueTransitions.admitRegularQueueItem({
          clientId: "client-1",
          articleId: "article-duplicate-media",
          batchId: "regular-batch-duplicate-second",
          itemId: "regular-item-duplicate-second",
          publicationId: "regular-publication-duplicate-second",
          attemptId: "regular-attempt-duplicate-second",
          target: prepared.target,
          publicationSnapshot: {
            articleId: "article-duplicate-media",
            title: "title",
            body: "body",
            fingerprint: domain.contentFingerprint("title", "body"),
          },
          payload: { clientId: "client-1" },
        }),
      { code: "PUBLICATION_DUPLICATE" },
    );
    assert.equal(store.listSubmissionBatches().length, 1);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("named regular accepted transition closes the original attempt after restart", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-08-named-accepted-restart-"),
  );
  const firstPorts = {};
  let store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts: firstPorts,
  });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "Fixture account",
    });
    const prepared = prepareRegularAttempt(
      firstPorts,
      "article-named-accepted-restart",
      profile,
    );
    store.close();

    const reopenedPorts = {};
    store = createOperationalStore({
      workspaceRoot: root,
      transitionPorts: reopenedPorts,
    });
    const result = acceptRegularAttempt(reopenedPorts, prepared);
    assert.equal(result.status, "published");
    const batch = store.getSubmissionBatch(prepared.admitted.batchId);
    assert.equal(batch.items[0].status, "completed");
    assert.equal(batch.status, "completed");
    assert.equal(
      reopenedPorts.regularOutcomeTransitions.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: prepared.claim.regularPublicationAttemptId,
      }).publicationEvidenceV1.contentFingerprint,
      prepared.evidence.contentFingerprint,
    );
    assert.equal(store.claimPostProcessing({ claimToken: "post-done" }), null);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("publication workflow rejects a second target before remote execution", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-08-active-target-workflow-"),
  );
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const targetOne = { kind: "media", mediaResourceId: "resource-one" };
    const targetTwo = { kind: "media", mediaResourceId: "resource-two" };
    store.reservePublicationTarget({
      articleId: "article-active-target",
      publicationId: "publication-resource-one",
      attemptId: "attempt-resource-one",
      target: targetOne,
    });
    let remoteCalls = 0;
    const workflow = createPublicationWorkflow({
      clock: () => new Date(),
      operationalStore: store,
      postProcessor: {
        process: async () => ({ status: "completed" }),
      },
      publisher: {
        publish: async () => {
          remoteCalls += 1;
          return { status: "failed" };
        },
      },
    });
    await assert.rejects(
      () =>
        workflow.publish({
          articleId: "article-active-target",
          publicationId: "publication-resource-two",
          attemptId: "attempt-resource-two",
          target: targetTwo,
          title: "title",
          body: "body",
        }),
      { code: "PUBLICATION_DUPLICATE" },
    );
    assert.equal(remoteCalls, 0);
    assert.equal(
      store.listPublicationRecords({ articleIds: ["article-active-target"] })
        .length,
      1,
    );
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

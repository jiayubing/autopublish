const { it } = require("node:test");
const assert = require("node:assert/strict");
const {
  registerContentSubmissionIpc,
} = require("../desktop/ipc/content-submission-ipc");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise(function (resolvePromise, rejectPromise) {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

it("returns the complete queue-group snapshot after pausing one group", async function () {
  const handlers = new Map();
  const calls = [];
  const groups = [
    { queueGroupId: "group-a" },
    { queueGroupId: "group-b" },
  ];
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    submissionMaintenance: {},
    submissionWorkflow: {
      regularQueueGroups: {
        list: () => groups,
        start: async () => undefined,
        pause: (input) => calls.push(input),
        startAll: async () => undefined,
        pauseAll: () => ({ groups }),
      },
    },
  });

  const result = await handlers.get("content:pause-regular-queue-group")(
    null,
    { queueGroupId: "group-a" },
  );

  assert.deepEqual(calls, [{ queueGroupId: "group-a" }]);
  assert.deepEqual(result, { ok: true, data: { items: groups } });
});

it("validates and forwards the queue-group submission interval command", async function () {
  const handlers = new Map();
  const calls = [];
  const groups = [{ queueGroupId: "group-a", submissionIntervalSeconds: 45 }];
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    submissionMaintenance: {},
    submissionWorkflow: {
      regularQueueGroups: {
        list: () => groups,
        updateSubmissionInterval: (input) => {
          calls.push(input);
          return groups;
        },
        start: async () => undefined,
        pause: () => undefined,
        startAll: async () => undefined,
        pauseAll: () => ({ groups }),
      },
    },
  });
  const channel = "content:update-regular-queue-group-submission-interval";
  const input = {
    queueGroupId: "group-a",
    submissionIntervalSeconds: 45,
    expectedRevision: 2,
  };
  const result = await handlers.get(channel)(null, input);
  assert.deepEqual(calls, [input]);
  assert.deepEqual(result, { ok: true, data: { items: groups } });

  const invalid = await handlers.get(channel)(null, {
    ...input,
    submissionIntervalSeconds: 3601,
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, "REGULAR_QUEUE_CONFIG_INVALID");
});
it("does not register the retired submission batch cancellation capability", async function () {
  const handlers = new Map();
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    submissionMaintenance: {},
  });
  assert.equal(handlers.has("content:cancel-submission-batch"), false);
});

it("does not register the retired failed queue-copy cleanup capability", async function () {
  const handlers = new Map();
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    submissionMaintenance: {},
  });
  assert.equal(
    handlers.has("content:preview-cleanup-failed-submission-items"),
    false,
  );
  assert.equal(
    handlers.has("content:cleanup-failed-submission-items"),
    false,
  );
  assert.equal(
    handlers.has("content:preview-trashed-article-queue-residue"),
    true,
  );
  assert.equal(
    handlers.has("content:cleanup-trashed-article-queue-residue"),
    true,
  );
});

it("keeps residue cleanup counts and reason codes while stripping filesystem fields", async function () {
  const handlers = new Map();
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    submissionMaintenance: {
      previewTrashedArticleQueueResidue: () => ({
        cleanableCount: 1,
        reportedCount: 0,
        items: [
          {
            publicationId: "pub-1",
            status: "failed",
            filePath: "C:\\secret.md",
            sidecarPath: "C:\\secret.md.submission.json",
            reasonCode: "PUBLICATION_ATTEMPT_MISMATCH",
          },
        ],
      }),
      cleanupTrashedArticleQueueResidue: () => ({
        status: "failed",
        cleanedCount: 0,
        failedCount: 1,
        remainingCount: 1,
        items: [
          {
            publicationId: "pub-1",
            status: "failed",
            path: "C:\\secret.md",
            reasonCode: "PUBLICATION_ATTEMPT_MISMATCH",
          },
        ],
      }),
    },
  });
  const preview = await handlers.get(
    "content:preview-trashed-article-queue-residue",
  )();
  const result = await handlers.get(
    "content:cleanup-trashed-article-queue-residue",
  )(null, { confirmed: true });
  assert.deepEqual(preview, {
    ok: true,
    data: {
      cleanableCount: 1,
      reportedCount: 0,
      items: [
        {
          publicationId: "pub-1",
          status: "failed",
          reasonCode: "PUBLICATION_ATTEMPT_MISMATCH",
        },
      ],
    },
  });
  assert.deepEqual(result, {
    ok: true,
    data: {
      status: "failed",
      cleanedCount: 0,
      failedCount: 1,
      remainingCount: 1,
      items: [
        {
          publicationId: "pub-1",
          status: "failed",
          reasonCode: "PUBLICATION_ATTEMPT_MISMATCH",
        },
      ],
    },
  });
});

it("awaits async paid-media preflight and admission before projecting a success", async function () {
  const handlers = new Map();
  const calls = [];
  const preflightGate = deferred();
  const confirmationGate = deferred();
  let preflightCompleted = false;
  let admissionCompleted = false;
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    submissionMaintenance: {},
    paidMediaPreflightService: {
      preflight: async (input) => {
        calls.push(["preflight", input]);
        await preflightGate.promise;
        preflightCompleted = true;
        return {
          status: "ready",
          canConfirm: true,
          confirmationToken: "token-1",
          articleRefs: input.articleRefs,
          mediaResourceId: input.mediaResourceId,
        };
      },
      confirm: async (input) => {
        calls.push(["confirm", input]);
        await confirmationGate.promise;
        admissionCompleted = true;
        return {
          batchId: "batch-1",
          targetKey: "media-resource-1",
          mediaResourceId: "media-1",
          status: "queued",
          articleCount: 1,
          idempotent: false,
          items: [],
          articleRefs: [],
          confirmationFingerprint: "fingerprint-1",
          quotedPrice: 1,
          estimatedTotal: 1,
        };
      },
    },
  });
  const previewPromise = handlers.get("content:preview-paid-media-preflight")(
    null,
    {
      articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
      mediaResourceId: "media-1",
    },
  );
  let previewSettled = false;
  previewPromise.then(function () {
    previewSettled = true;
  });
  await Promise.resolve();
  assert.equal(previewSettled, false);
  assert.equal(preflightCompleted, false);
  preflightGate.resolve();
  const preview = await previewPromise;
  assert.equal(preview.ok, true);
  assert.equal(preview.data.status, "ready");
  assert.equal(preflightCompleted, true);

  const confirmationPromise = handlers.get("content:confirm-paid-media-batch")(
    null,
    { confirmationToken: "token-1", confirmed: true },
  );
  let confirmationSettled = false;
  confirmationPromise.then(function () {
    confirmationSettled = true;
  });
  await Promise.resolve();
  assert.equal(confirmationSettled, false);
  assert.equal(admissionCompleted, false);
  confirmationGate.resolve();
  const confirmed = await confirmationPromise;
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.data.batchId, "batch-1");
  assert.equal(admissionCompleted, true);
  assert.deepEqual(calls, [
    [
      "preflight",
      {
        articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
        mediaResourceId: "media-1",
      },
    ],
    ["confirm", { confirmationToken: "token-1", confirmed: true }],
  ]);
});

it("awaits async paid-media rejections and never projects an empty success", async function () {
  const handlers = new Map();
  const preflightGate = deferred();
  const confirmationGate = deferred();
  let admissionFailureObserved = false;
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    submissionMaintenance: {},
    paidMediaPreflightService: {
      preflight: async () => {
        await preflightGate.promise;
        const error = new Error("resource query failed");
        error.code = "PAID_MEDIA_RESOURCE_QUERY_FAILED";
        throw error;
      },
      confirm: async () => {
        await confirmationGate.promise;
        admissionFailureObserved = true;
        const error = new Error("paid admission failed");
        error.code = "PAID_ADMISSION_FAILED";
        throw error;
      },
    },
  });

  const previewPromise = handlers.get("content:preview-paid-media-preflight")(
    null,
    {
      articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
      mediaResourceId: "media-1",
    },
  );
  preflightGate.resolve();
  assert.deepEqual(await previewPromise, {
    ok: false,
    error: {
      code: "PAID_MEDIA_RESOURCE_QUERY_FAILED",
      message: "resource query failed",
    },
  });

  const confirmationPromise = handlers.get("content:confirm-paid-media-batch")(
    null,
    {
      confirmationToken: "token-1",
      confirmed: true,
    },
  );
  let confirmationSettled = false;
  confirmationPromise.then(function () {
    confirmationSettled = true;
  });
  await Promise.resolve();
  assert.equal(confirmationSettled, false);
  assert.equal(admissionFailureObserved, false);
  confirmationGate.resolve();
  const confirmation = await confirmationPromise;
  assert.equal(admissionFailureObserved, true);
  assert.deepEqual(confirmation, {
    ok: false,
    error: { code: "PAID_ADMISSION_FAILED", message: "paid admission failed" },
  });
});

it("rejects paid-media confirmation without explicit confirmation", async function () {
  const handlers = new Map();
  let called = false;
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    submissionMaintenance: {},
    paidMediaPreflightService: {
      confirm: () => {
        called = true;
        return {};
      },
    },
  });
  const result = await handlers.get("content:confirm-paid-media-batch")(null, {
    confirmationToken: "token-1",
    confirmed: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PAID_MEDIA_CONFIRMATION_REQUIRED");
  assert.equal(called, false);
});

it("awaits paid-media operations before projecting their result", async function () {
  const handlers = new Map();
  let releasePreflight;
  let releaseConfirm;
  const preflightPending = new Promise((resolve) => {
    releasePreflight = resolve;
  });
  const confirmPending = new Promise((resolve) => {
    releaseConfirm = resolve;
  });
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    submissionMaintenance: {},
    paidMediaPreflightService: {
      preflight: () => preflightPending,
      confirm: () => confirmPending,
    },
  });

  let preflightSettled = false;
  const preflightResponse = handlers
    .get("content:preview-paid-media-preflight")(null, {
      articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
      mediaResourceId: "media-1",
    })
    .then((value) => {
      preflightSettled = true;
      return value;
    });
  await Promise.resolve();
  assert.equal(preflightSettled, false);
  releasePreflight({
    status: "ready",
    canConfirm: true,
    confirmationToken: "token-1",
  });
  const projectedPreflight = await preflightResponse;
  assert.equal(projectedPreflight.ok, true);
  assert.equal(projectedPreflight.data.status, "ready");
  assert.equal(projectedPreflight.data.canConfirm, true);
  assert.equal(projectedPreflight.data.confirmationToken, "token-1");

  let confirmSettled = false;
  const confirmResponse = handlers
    .get("content:confirm-paid-media-batch")(null, {
      confirmationToken: "token-1",
      confirmed: true,
    })
    .then((value) => {
      confirmSettled = true;
      return value;
    });
  await Promise.resolve();
  assert.equal(confirmSettled, false);
  releaseConfirm({
    batchId: "batch-1",
    status: "queued",
    articleCount: 1,
    items: [],
  });
  const projectedConfirm = await confirmResponse;
  assert.equal(projectedConfirm.ok, true);
  assert.equal(projectedConfirm.data.batchId, "batch-1");
  assert.equal(projectedConfirm.data.status, "queued");
  assert.equal(projectedConfirm.data.articleCount, 1);
  assert.deepEqual(projectedConfirm.data.items, []);
});

it("waits for paid-media rejection and maps it without an orphaned background effect", async function () {
  const handlers = new Map();
  let rejectConfirm;
  let started = 0;
  let completed = 0;
  const pending = new Promise((resolve, reject) => {
    rejectConfirm = reject;
  });
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    submissionMaintenance: {},
    paidMediaPreflightService: {
      confirm: async () => {
        started += 1;
        try {
          return await pending;
        } finally {
          completed += 1;
        }
      },
    },
  });

  let settled = false;
  const response = handlers
    .get("content:confirm-paid-media-batch")(null, {
      confirmationToken: "token-1",
      confirmed: true,
    })
    .then((value) => {
      settled = true;
      return value;
    });
  await Promise.resolve();
  assert.equal(started, 1);
  assert.equal(settled, false);
  assert.equal(completed, 0);
  const error = new Error("admission rejected");
  error.code = "PUBLICATION_TARGET_CONFLICT";
  rejectConfirm(error);
  assert.deepEqual(await response, {
    ok: false,
    error: {
      code: "PUBLICATION_TARGET_CONFLICT",
      message: "admission rejected",
    },
  });
  assert.equal(completed, 1);
  await Promise.resolve();
  assert.equal(completed, 1);
});

it("exposes paid-media batch snapshot, single start, and client-scoped start all", async function () {
  const handlers = new Map();
  let finishStart;
  let pauseCalls = 0;
  let cancelCalls = 0;
  let startAllCalls = 0;
  const batch = {
    batchId: "paid-batch-1",
    mediaResourceId: "media-1",
    status: "queued",
    pauseIntent: "manual",
    paused: true,
    runState: "paused",
    articleCount: 1,
    quotedPrice: 12.5,
    estimatedTotal: 12.5,
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
    secret: "must-not-cross-ipc",
    items: [
      {
        itemId: "paid-item-1",
        articleIdentityV1: {
          version: 1,
          clientId: "client-1",
          articleId: "article-1",
        },
        status: "queued",
        phase: "paid-admitted",
        claimToken: "secret-claim",
      },
    ],
  };
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    submissionMaintenance: {},
    paidMediaExecutionService: {
      list: async () => ({ items: [batch] }),
      start: async () =>
        new Promise((resolve) => {
          finishStart = () => resolve({ executionStatus: "submitted", batch });
        }),
      startAll: async ({ clientId }) => {
        startAllCalls += 1;
        return {
          executionStatus: "paid_batches_started",
          results: [{ batchId: `${clientId}-paid-batch`, executionStatus: "order_created" }],
        };
      },
      pause: async () => {
        pauseCalls += 1;
        return { batch };
      },
      cancelRemaining: async ({ batchId }) => {
        cancelCalls += 1;
        return {
          executionStatus: "remaining_cancelled",
          cancelledCount: 1,
          idempotentCount: 0,
          skippedCount: 0,
          batch: { ...batch, batchId },
        };
      },
    },
  });

  const listed = await handlers.get("content:list-paid-media-batches")({});
  assert.equal(listed.ok, true, JSON.stringify(listed));
  assert.equal(listed.data.items[0].secret, undefined);
  assert.equal(listed.data.items[0].items[0].claimToken, undefined);

  const starting = handlers.get("content:start-paid-media-batch")(
    {},
    {
      batchId: batch.batchId,
    },
  );
  const paused = await handlers.get("content:pause-paid-media-batch")(
    {},
    {
      batchId: batch.batchId,
    },
  );
  assert.equal(paused.ok, true, JSON.stringify(paused));
  assert.equal(pauseCalls, 1);
  const startedAll = await handlers.get("content:start-all-paid-media-batches")(
    {},
    { clientId: "client-1" },
  );
  assert.equal(startedAll.ok, true, JSON.stringify(startedAll));
  assert.deepEqual(startedAll.data, {
    executionStatus: "paid_batches_started",
    results: [{ batchId: "client-1-paid-batch", executionStatus: "order_created" }],
  });
  assert.equal(startAllCalls, 1);
  const cancelled = await handlers.get(
    "content:cancel-remaining-paid-media-batch-items",
  )({}, { batchId: batch.batchId });
  assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
  assert.equal(cancelled.data.cancelledCount, 1);
  assert.equal(cancelCalls, 1);
  finishStart();
  const started = await starting;
  assert.equal(started.ok, true, JSON.stringify(started));
  assert.equal(started.data.executionStatus, "submitted");
});


it("auto-starts admitted regular queue groups without turning admission into a start command", async function () {
  const handlers = new Map();
  const kicks = [];
  const articleRef = { clientId: "client-1", articleId: "article-1" };
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    submissionMaintenance: {},
    submissionWorkflow: {
      regularQueue: {
        admit: (input) => ({
          batchId: "batch-1",
          target: {
            platformId: input.platformId,
            accountProfileId: input.accountProfileId,
          },
          articleRefs: input.articleRefs,
          items: [
            {
              articleRef,
              articleId: articleRef.articleId,
              itemId: "item-1",
              batchId: "batch-1",
              queueGroupId: "group-1",
              status: "queued",
            },
            {
              articleRef,
              articleId: articleRef.articleId,
              queueGroupId: "group-1",
              status: "idempotent",
            },
          ],
          admittedCount: 1,
          idempotentCount: 1,
          missingCount: 0,
          conflictCount: 0,
        }),
      },
      regularQueueGroups: {
        kick: (input) => kicks.push(input),
      },
    },
  });

  const result = await handlers.get("content:admit-regular-queue-items")(null, {
    articleRefs: [articleRef],
    platformId: "lieju",
    accountProfileId: "profile-1",
    autoStart: true,
    confirmed: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(kicks, [{ queueGroupId: "group-1" }]);
  assert.equal(result.data.admittedCount, 1);
});

it("keeps a committed regular admission successful when best-effort auto-start fails", async function () {
  const handlers = new Map();
  const articleRef = { clientId: "client-1", articleId: "article-1" };
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    submissionMaintenance: {},
    submissionWorkflow: {
      regularQueue: {
        admit: () => ({
          batchId: "batch-1",
          target: { platformId: "lieju", accountProfileId: "profile-1" },
          articleRefs: [articleRef],
          items: [
            {
              articleRef,
              articleId: articleRef.articleId,
              queueGroupId: "group-1",
              status: "queued",
            },
          ],
          admittedCount: 1,
          idempotentCount: 0,
          missingCount: 0,
          conflictCount: 0,
        }),
      },
      regularQueueGroups: {
        kick: () => {
          throw Object.assign(new Error("synthetic kick failure"), {
            code: "SYNTHETIC_KICK_FAILURE",
          });
        },
      },
    },
  });

  const result = await handlers.get("content:admit-regular-queue-items")(null, {
    articleRefs: [articleRef],
    platformId: "lieju",
    accountProfileId: "profile-1",
    autoStart: true,
    confirmed: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.admittedCount, 1);
});

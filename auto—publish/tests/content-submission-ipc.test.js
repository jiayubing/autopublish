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
it("forwards only the preview action plan token for batch cancellation", async function () {
  const handlers = new Map();
  let received;
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    contentSubmissionService: {
      cancelBatch: (input) => {
        received = input;
        return {
          batchId: input.batchId,
          planId: input.planId,
          cancelledCount: 1,
          blockedItems: [],
        };
      },
    },
  });
  const result = await handlers.get("content:cancel-submission-batch")(null, {
    batchId: "batch-1",
    planId: "plan-1",
    confirmed: true,
  });
  assert.deepEqual(received, {
    batchId: "batch-1",
    planId: "plan-1",
    confirmed: true,
  });
  assert.deepEqual(result, {
    ok: true,
    data: {
      batchId: "batch-1",
      planId: "plan-1",
      cancelledCount: 1,
      blockedItems: [],
    },
  });
});

it("rejects a content submission batch without explicit account profile bindings", async function () {
  const handlers = new Map();
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    contentSubmissionService: { createBatch: () => ({}) },
  });
  const result = await handlers.get("content:create-submission-batch")(null, {
    clientId: "client-1",
    articleIds: ["article-1"],
    targetPlatformIds: ["toutiao"],
    confirmed: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "ACCOUNT_PROFILE_REQUIRED");
});

it("exposes reconciliation cleanup previews and keeps queue paths out of the renderer response", async function () {
  const handlers = new Map();
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    contentSubmissionService: {
      previewCleanupFailedItems: () => ({
        batchId: "batch-1",
        cleanableCount: 1,
        uncleanableCount: 0,
        items: [
          {
            articleId: "article-1",
            status: "failed",
            filePath: "C:\\secret.md",
            sidecarPath: "C:\\secret.md.submission.json",
            cleanable: true,
          },
        ],
      }),
      cleanupFailedItems: () => ({
        batchId: "batch-1",
        cleanedCount: 1,
        skippedCount: 0,
        items: [
          {
            articleId: "article-1",
            status: "failed-cleaned",
            filePath: "C:\\secret.md",
          },
        ],
      }),
    },
  });

  const preview = await handlers.get(
    "content:preview-cleanup-failed-submission-items",
  )(null, { batchId: "batch-1" });
  const result = await handlers.get("content:cleanup-failed-submission-items")(
    null,
    { batchId: "batch-1", confirmed: true },
  );
  assert.deepEqual(preview, {
    ok: true,
    data: {
      batchId: "batch-1",
      cleanableCount: 1,
      uncleanableCount: 0,
      items: [{ articleId: "article-1", status: "failed", cleanable: true }],
    },
  });
  assert.deepEqual(result, {
    ok: true,
    data: {
      batchId: "batch-1",
      cleanedCount: 1,
      skippedCount: 0,
      items: [{ articleId: "article-1", status: "failed-cleaned" }],
    },
  });
});

it("keeps residue cleanup counts and reason codes while stripping filesystem fields", async function () {
  const handlers = new Map();
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    contentSubmissionService: {
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
    contentSubmissionService: {},
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
    contentSubmissionService: {},
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
    contentSubmissionService: {},
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
    contentSubmissionService: {},
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
    contentSubmissionService: {},
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

it("exposes paid-media batch snapshot, start, and pause as independent commands", async function () {
  const handlers = new Map();
  let finishStart;
  let pauseCalls = 0;
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
    contentSubmissionService: {},
    paidMediaExecutionService: {
      list: async () => ({ items: [batch] }),
      start: async () =>
        new Promise((resolve) => {
          finishStart = () => resolve({ executionStatus: "submitted", batch });
        }),
      pause: async () => {
        pauseCalls += 1;
        return { batch };
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
  finishStart();
  const started = await starting;
  assert.equal(started.ok, true, JSON.stringify(started));
  assert.equal(started.data.executionStatus, "submitted");
});

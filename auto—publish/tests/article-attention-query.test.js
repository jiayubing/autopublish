const { it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createArticleAttentionQuery,
} = require("../desktop/services/article-attention-query");
const {
  ACTIONS,
  ATTENTION_KINDS,
} = require("../desktop/services/article-attention-policy");
const {
  createArticleAttentionResolver,
} = require("../desktop/services/article-attention-resolver");
const { setDiagnosticReporter } = require("../src/diagnostics/diagnostic-producer");

const regularPort = {
  prepareRegularUncertainResolution: async () => ({
    confirmationToken: "regular-token",
  }),
  confirmRegularAccepted: async () => ({ status: "published" }),
  confirmRegularNotAccepted: async () => ({ status: "not_accepted" }),
};

it("projects only manual removal repair, not automatic recovery", () => {
  const query = createArticleAttentionQuery({
    readers: {
      listTransactions: () => [
        {
          id: "auto",
          transactionId: "auto",
          clientId: "c",
          articleId: "a",
          status: "pending_auto_recovery",
          phase: "queue-actions",
        },
        {
          id: "repair",
          transactionId: "repair",
          clientId: "c",
          articleId: "b",
          status: "needs_repair",
          phase: "needs_repair",
        },
      ],
    },
    articleRemovalService: { retryArticleRemovalTransaction: () => ({}) },
  });
  const items = query.list().items;
  assert.equal(items.some((item) => item.transactionId === "auto"), false);
  const repair = items.find((item) => item.transactionId === "repair");
  assert.equal(repair.kind, ATTENTION_KINDS.REMOVAL_NEEDS_REPAIR);
  assert.equal(repair.owner, "article-removal-recovery");
  assert.equal(repair.freeze.article, true);
  assert.deepEqual(repair.allowedActions, [ACTIONS.RETRY_REMOVAL, ACTIONS.INSPECT]);
});

it("projects ordinary and paid uncertainty as distinct frozen attention types", () => {
  const query = createArticleAttentionQuery({
    operationalStore: {
      listPublicationAttention: () => [
        {
          publicationId: "publication-1",
          articleId: "article-1",
          status: "uncertain",
          attemptId: "attempt-1",
        },
        {
          publicationId: "publication-2",
          articleId: "article-2",
          status: "uncertain",
          attemptId: "attempt-2",
          orderCreationAttemptId: "order-attempt-2",
        },
      ],
    },
    regularPlatformOutcomeService: regularPort,
    paidOrderCreationResolutionService: {
      prepareBindOrderNumber: async () => ({ confirmationToken: "paid-bind" }),
      bindOrderNumber: async () => ({ status: "bound" }),
      prepareConfirmNoOrder: async () => ({ confirmationToken: "paid-none" }),
      confirmNoOrder: async () => ({ status: "no_order" }),
    },
  });
  const items = query.list().items;
  const regular = items.find((item) => item.publicationId === "publication-1");
  const paid = items.find((item) => item.publicationId === "publication-2");
  assert.equal(regular.kind, ATTENTION_KINDS.REGULAR_PLATFORM_UNCERTAIN);
  assert.equal(paid.kind, ATTENTION_KINDS.PAID_ORDER_CREATION_UNCERTAIN);
  assert.equal(regular.freeze.article, true);
  assert.equal(paid.freeze.article, true);
  assert.equal(
    regular.allowedActions.includes(["retry", "publication"].join("-")),
    false,
  );
  assert.deepEqual(paid.allowedActions, [
    ACTIONS.BIND_PAID_ORDER_NUMBER,
    ACTIONS.CONFIRM_PAID_ORDER_ABSENT,
    ACTIONS.INSPECT,
  ]);
});

it("keeps independent attention items for the same article", () => {
  const query = createArticleAttentionQuery({
    readers: {
      listTransactions: () => [
        {
          transactionId: "repair-same-article",
          clientId: "client-same",
          articleId: "article-same",
          publicationId: "publication-same",
          status: "needs_repair",
          phase: "needs_repair",
        },
      ],
      listOrderAttention: () => [
        {
          orderId: "order-same",
          clientId: "client-same",
          articleId: "article-same",
          anomaly: {
            reason: "unknown-status",
            openedAt: "2026-08-15T00:00:00.000Z",
          },
        },
      ],
    },
    operationalStore: {
      listPublicationAttention: () => [
        {
          publicationId: "publication-same",
          attemptId: "attempt-same",
          clientId: "client-same",
          articleId: "article-same",
          status: "uncertain",
        },
      ],
    },
    articleRemovalService: { retryArticleRemovalTransaction: () => ({}) },
    orderReconciliationPort: {
      prepareOrderStatusAnomalyResolution: async () => ({
        confirmationToken: "order",
      }),
      resumeOrderTracking: async () => ({ status: "tracking_resumed" }),
      confirmOrderPublished: async () => ({ status: "published" }),
      confirmOrderNotPublished: async () => ({ status: "not_published" }),
    },
    regularPlatformOutcomeService: regularPort,
  });

  const items = query.list().items;
  assert.deepEqual(
    new Set(items.map((item) => item.kind)),
    new Set([
      ATTENTION_KINDS.REMOVAL_NEEDS_REPAIR,
      ATTENTION_KINDS.REGULAR_PLATFORM_UNCERTAIN,
      ATTENTION_KINDS.ORDER_STATUS_ANOMALY,
    ]),
  );
  assert.equal(
    items.filter((item) => item.articleId === "article-same").length,
    3,
  );
});

it("projects order anomalies with independent identity and preserves priority ordering", () => {
  const query = createArticleAttentionQuery({
    readers: {
      listOrderAttention: () => [
        {
          orderNid: "order-1",
          title: "订单一",
          statusCode: "4",
          anomaly: { reason: "order-missing", openedAt: "2026-08-15T00:00:00.000Z" },
        },
      ],
    },
    capabilities: {
      order_status_anomaly: { canResolveOrderStatusAnomaly: true },
    },
  });
  const item = query.list().items[0];
  assert.equal(item.kind, ATTENTION_KINDS.ORDER_STATUS_ANOMALY);
  assert.equal(item.orderId, "order-1");
  assert.equal(item.owner, "order-reconciliation");
  assert.equal(item.freeze.article, true);
  assert.deepEqual(item.allowedActions, [
    ACTIONS.RESUME_ORDER_TRACKING,
    ACTIONS.CONFIRM_ORDER_PUBLISHED,
    ACTIONS.CONFIRM_ORDER_NOT_PUBLISHED,
    ACTIONS.INSPECT,
  ]);
  assert.equal(item.resolutionPriority, 460);
});

it("does not let an unavailable order projection hide other attention items", () => {
  const diagnostics = [];
  const restoreDiagnostics = setDiagnosticReporter((record) => {
    diagnostics.push(record);
    return true;
  });
  try {
    const query = createArticleAttentionQuery({
      readers: {
        listOrderAttention: () => {
          throw new Error("synthetic order reader failure");
        },
      },
      operationalStore: {
        listPublicationAttention: () => [
          {
            publicationId: "publication-safe",
            articleId: "article-safe",
            status: "uncertain",
            attemptId: "attempt-safe",
          },
        ],
      },
    });
    assert.equal(query.list().items.length, 1);
    assert.equal(
      diagnostics.some((record) => record.code === "ARTICLE_ATTENTION_ORDER_READ_FAILED"),
      true,
    );
    assert.equal(JSON.stringify(diagnostics).includes("synthetic"), false);
  } finally {
    restoreDiagnostics();
  }
});

it("deduplicates stable attention identities and rebuilds only for a newer revision", () => {
  let revision = 4;
  let reads = 0;
  let publications = [
    {
      publicationId: "publication-1",
      clientId: "client-1",
      articleId: "article-1",
      status: "uncertain",
      attemptId: "attempt-1",
    },
  ];
  const query = createArticleAttentionQuery({
    getRevision: () => revision,
    operationalStore: {
      listPublicationAttention() {
        reads += 1;
        return publications;
      },
    },
  });

  const first = query.list({ clientId: "client-1" });
  publications = [publications[0], { ...publications[0] }];
  const cached = query.list({ clientId: "client-1" });
  assert.equal(first.revision, 4);
  assert.equal(cached.items.length, 1);
  assert.equal(reads, 1);

  revision = 5;
  const rebuilt = query.list({ clientId: "client-1" });
  assert.equal(rebuilt.revision, 5);
  assert.equal(rebuilt.items.length, 1);
  assert.equal(rebuilt.items[0].attentionId, first.items[0].attentionId);
  assert.equal(reads, 2);
  assert.equal(query.list({ clientId: "other-client" }).items.length, 0);
});

it("fails closed to safe navigation when optional lookups fail and never probes generic retry", () => {
  const diagnostics = [];
  const restoreDiagnostics = setDiagnosticReporter(function (record) {
    diagnostics.push(record);
    return true;
  });
  let genericProbeCalls = 0;
  const query = createArticleAttentionQuery({
    readers: {
      getArticle() {
        throw new Error("synthetic article lookup failure");
      },
      getTrashedArticle() {
        throw new Error("synthetic trash lookup failure");
      },
      platformCapabilities() {
        throw new Error("synthetic capability failure");
      },
    },
    operationalStore: {
      listPublicationAttention: () => [
        {
          publicationId: "publication-failed",
          clientId: "client-1",
          articleId: "article-1",
          status: "failed",
          attemptId: "attempt-1",
        },
      ],
    },
    capabilities: {
      regular_platform_failed: { canInspect: false },
    },
    contentSubmissionService: {
      previewRetryFailedPublication() {
        genericProbeCalls += 1;
        throw new Error("must not be called");
      },
      retryFailedPublication() {
        genericProbeCalls += 1;
        throw new Error("must not be called");
      },
    },
  });

  try {
    const snapshot = query.list();
    assert.equal(snapshot.items.length, 1);
    assert.deepEqual(snapshot.items[0].allowedActions, [ACTIONS.OPEN_PUBLICATION]);
    assert.equal(snapshot.counts.actionable, 0);
    assert.equal(genericProbeCalls, 0);
    assert.equal(
      diagnostics.some((record) => record.code === "ARTICLE_ATTENTION_LOOKUP_FAILED"),
      true,
    );
    assert.equal(JSON.stringify(diagnostics).includes("synthetic"), false);
  } finally {
    restoreDiagnostics();
  }
});

it("requires a preview token, preserves failed resolution, and fences duplicate resolutions", async () => {
  let attempts = 0;
  let fail = true;
  const removalPort = {
    retryArticleRemovalTransaction() {
      attempts += 1;
      if (fail) {
        const error = new Error("synthetic repair failure");
        error.code = "ARTICLE_REMOVAL_REPAIR_FAILED";
        throw error;
      }
      return { status: "committed" };
    },
  };
  const query = createArticleAttentionQuery({
    readers: {
      listTransactions: () => [
        {
          id: "repair-1",
          transactionId: "repair-1",
          clientId: "client-1",
          articleId: "article-1",
          status: "needs_repair",
          phase: "needs_repair",
        },
      ],
    },
    articleRemovalService: removalPort,
  });
  const resolver = createArticleAttentionResolver({
    query,
    articleRemovalService: removalPort,
  });
  const item = query.list().items[0];
  const expectedRevision = query.getRevision();

  const preview = await resolver.preview({
    attentionId: item.attentionId,
    action: ACTIONS.RETRY_REMOVAL,
    expectedRevision,
  });
  await assert.rejects(
    () =>
      resolver.resolve({
        attentionId: item.attentionId,
        action: ACTIONS.RETRY_REMOVAL,
        expectedRevision,
      }),
    { code: "ARTICLE_ATTENTION_CONFIRMATION_REQUIRED" },
  );
  await assert.rejects(
    () =>
      resolver.resolve({
        attentionId: item.attentionId,
        action: ACTIONS.RETRY_REMOVAL,
        expectedRevision,
        confirmed: true,
        confirmationToken: preview.confirmationToken,
      }),
    { code: "ARTICLE_REMOVAL_REPAIR_FAILED" },
  );
  assert.equal(query.getRevision(), expectedRevision);
  assert.equal(attempts, 1);

  fail = false;
  const resolved = await resolver.resolve({
    attentionId: item.attentionId,
    action: ACTIONS.RETRY_REMOVAL,
    expectedRevision,
    confirmed: true,
    confirmationToken: preview.confirmationToken,
  });
  assert.equal(resolved.outcome, "resolved");
  assert.equal(query.getRevision(), expectedRevision + 1);
  assert.equal(attempts, 2);

  await assert.rejects(
    () =>
      resolver.resolve({
        attentionId: item.attentionId,
        action: ACTIONS.RETRY_REMOVAL,
        expectedRevision,
        confirmed: true,
        confirmationToken: preview.confirmationToken,
      }),
    { code: "ARTICLE_ATTENTION_STALE" },
  );
});

it("resolves paid order creation by independent attention id and input-bound token", async () => {
  const calls = [];
  const paid = {
    prepareBindOrderNumber: async (input) => {
      calls.push(["prepare-bind", input]);
      return { confirmationToken: "paid-token" };
    },
    bindOrderNumber: async (input) => {
      calls.push(["bind", input]);
      return { status: "bound" };
    },
    prepareConfirmNoOrder: async () => ({ confirmationToken: "paid-none" }),
    confirmNoOrder: async () => ({ status: "no_order" }),
  };
  const query = createArticleAttentionQuery({
    operationalStore: {
      listPublicationAttention: () => [
        {
          publicationId: "publication-paid",
          articleId: "article-paid",
          status: "uncertain",
          attemptId: "attempt-paid",
          orderCreationAttemptId: "order-attempt-paid",
        },
      ],
    },
    paidOrderCreationResolutionService: paid,
  });
  const resolver = createArticleAttentionResolver({
    query,
    paidOrderCreationResolutionService: paid,
  });
  const item = query.list().items[0];
  const input = { orderId: "order-123" };
  const preview = await resolver.preview({
    attentionId: item.attentionId,
    action: ACTIONS.BIND_PAID_ORDER_NUMBER,
    expectedRevision: query.getRevision(),
    resolutionInput: input,
  });
  await resolver.resolve({
    attentionId: item.attentionId,
    action: ACTIONS.BIND_PAID_ORDER_NUMBER,
    expectedRevision: preview.revision,
    confirmed: true,
    confirmationToken: preview.confirmationToken,
    resolutionInput: input,
  });
  assert.deepEqual(calls, [
    [
      "prepare-bind",
      { orderCreationAttemptId: "order-attempt-paid", orderId: "order-123" },
    ],
    [
      "bind",
      {
        orderCreationAttemptId: "order-attempt-paid",
        orderId: "order-123",
        confirmationToken: "paid-token",
      },
    ],
  ]);
});

it("resolves ordinary uncertainty only through the named outcome port", async () => {
  const calls = [];
  const regular = {
    prepareRegularUncertainResolution: async (input) => {
      calls.push(["prepare", input]);
      return { confirmationToken: "regular-token" };
    },
    confirmRegularAccepted: async (input) => {
      calls.push(["accepted", input]);
      return { status: "published" };
    },
    confirmRegularNotAccepted: async () => ({ status: "not_accepted" }),
  };
  const query = createArticleAttentionQuery({
    operationalStore: {
      listPublicationAttention: () => [
        {
          publicationId: "publication-regular",
          articleId: "article-regular",
          status: "uncertain",
          attemptId: "attempt-regular",
        },
      ],
    },
    regularPlatformOutcomeService: regular,
  });
  const resolver = createArticleAttentionResolver({
    query,
    regularPlatformOutcomeService: regular,
    clock: () => new Date("2026-08-15T00:00:00.000Z"),
  });
  const item = query.list().items[0];
  const preview = await resolver.preview({
    attentionId: item.attentionId,
    action: ACTIONS.CONFIRM_REGULAR_ACCEPTED,
    expectedRevision: query.getRevision(),
    resolutionInput: {
      observedAt: "2026-08-14T23:59:00.000Z",
      remoteUrl: "https://example.test/published/regular",
    },
  });
  await resolver.resolve({
    attentionId: item.attentionId,
    action: ACTIONS.CONFIRM_REGULAR_ACCEPTED,
    expectedRevision: preview.revision,
    confirmed: true,
    confirmationToken: preview.confirmationToken,
    resolutionInput: preview.resolutionInput,
  });
  assert.equal(calls[0][0], "prepare");
  assert.equal(calls[0][1].regularPublicationAttemptId, "attempt-regular");
  assert.equal(calls[1][0], "accepted");
  assert.equal(calls[1][1].confirmationToken, "regular-token");
});

it("resolves an order anomaly through its three-action reconciliation port", async () => {
  const calls = [];
  const order = {
    listOrders: () => [
      {
        orderNid: "order-anomaly",
        anomaly: { reason: "order-missing", openedAt: "2026-08-15T00:00:00.000Z" },
      },
    ],
    prepareOrderStatusAnomalyResolution: async (input) => {
      calls.push(["prepare", input]);
      return { confirmationToken: "order-token" };
    },
    resumeOrderTracking: async (input) => {
      calls.push(["resume", input]);
      return { status: "tracking_resumed" };
    },
    confirmOrderPublished: async () => ({ status: "published" }),
    confirmOrderNotPublished: async () => ({ status: "not_published" }),
  };
  const query = createArticleAttentionQuery({ orderReconciliationPort: order });
  const resolver = createArticleAttentionResolver({
    query,
    orderReconciliationPort: order,
  });
  const item = query.list().items[0];
  assert.deepEqual(item.allowedActions, [
    ACTIONS.RESUME_ORDER_TRACKING,
    ACTIONS.CONFIRM_ORDER_PUBLISHED,
    ACTIONS.CONFIRM_ORDER_NOT_PUBLISHED,
    ACTIONS.INSPECT,
  ]);
  const preview = await resolver.preview({
    attentionId: item.attentionId,
    action: ACTIONS.RESUME_ORDER_TRACKING,
    expectedRevision: query.getRevision(),
  });
  await resolver.resolve({
    attentionId: item.attentionId,
    action: ACTIONS.RESUME_ORDER_TRACKING,
    expectedRevision: preview.revision,
    confirmed: true,
    confirmationToken: preview.confirmationToken,
  });
  assert.deepEqual(calls, [
    ["prepare", { orderId: "order-anomaly" }],
    [
      "resume",
      { orderId: "order-anomaly", confirmationToken: "order-token" },
    ],
  ]);
});

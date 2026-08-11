const { it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createArticleAttentionQuery,
} = require("../desktop/services/article-attention-query");
const {
  createArticleAttentionResolver,
} = require("../desktop/services/article-attention-resolver");
const { setDiagnosticReporter } = require("../src/diagnostics/diagnostic-producer");

it("distinguishes automatic removal recovery from a transaction needing manual repair", () => {
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
  assert.equal(
    items.find((item) => item.transactionId === "auto").kind,
    "removal_auto_recovery",
  );
  assert.deepEqual(
    items.find((item) => item.transactionId === "auto").allowedActions,
    ["inspect"],
  );
  assert.equal(
    items.find((item) => item.transactionId === "repair").kind,
    "removal_needs_repair",
  );
  assert.ok(
    items
      .find((item) => item.transactionId === "repair")
      .allowedActions.includes("retry-removal"),
  );
});

it("keeps generic attention read-only for uncertain attempts", () => {
  const publications = [
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
      remoteId: "remote-2",
      remoteUrl: "https://example.test/remote-2",
    },
  ];
  const query = createArticleAttentionQuery({
    operationalStore: { listPublicationAttention: () => publications },
    publicationWorkflow: { reconcile: async () => ({}) },
  });
  const items = query.list().items;
  assert.deepEqual(
    items.find((item) => item.publicationId === "publication-1").allowedActions,
    ["open-publication"],
  );
  assert.deepEqual(
    items.find((item) => item.publicationId === "publication-2").allowedActions,
    ["open-publication"],
  );
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

it("fails closed to safe read-only attention when optional lookups fail", () => {
  const diagnostics = [];
  const restoreDiagnostics = setDiagnosticReporter(function(record) {
    diagnostics.push(record);
    return true;
  });
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
          articleExists: true,
          articleStatus: "saved",
          status: "failed",
          attemptId: "attempt-1",
        },
      ],
    },
    capabilities: {
      failed_submission: { canInspect: false },
    },
    contentSubmissionService: {
      previewRetryFailedPublication() {
        throw new Error("synthetic retry preview failure");
      },
      retryFailedPublication() {
        throw new Error("must not be exposed");
      },
    },
  });

  try {
    const snapshot = query.list();
    assert.equal(snapshot.items.length, 1);
    assert.deepEqual(snapshot.items[0].allowedActions, ["open-publication"]);
    assert.equal(snapshot.counts.actionable, 0);
    assert.ok(diagnostics.some((record) => record.code === "ARTICLE_ATTENTION_LOOKUP_FAILED"));
    assert.ok(diagnostics.some((record) => record.code === "ARTICLE_ATTENTION_CAPABILITY_PROBE_FAILED"));
    assert.ok(diagnostics.some((record) => record.code === "ARTICLE_ATTENTION_RETRY_PREVIEW_FAILED"));
    assert.equal(JSON.stringify(diagnostics).includes("synthetic"), false);
  } finally {
    restoreDiagnostics();
  }
});

it("requires confirmation, preserves explicit failures, and fences duplicate resolutions", async () => {
  let attempts = 0;
  let fail = true;
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
    articleRemovalService: {
      retryArticleRemovalTransaction() {
        attempts += 1;
        if (fail) {
          const error = new Error("synthetic repair failure");
          error.code = "ARTICLE_REMOVAL_REPAIR_FAILED";
          throw error;
        }
        return { status: "committed" };
      },
    },
  });
  const resolver = createArticleAttentionResolver({
    query,
    articleRemovalService: {
      retryArticleRemovalTransaction() {
        attempts += 1;
        if (fail) {
          const error = new Error("synthetic repair failure");
          error.code = "ARTICLE_REMOVAL_REPAIR_FAILED";
          throw error;
        }
        return { status: "committed" };
      },
    },
  });
  const item = query.list().items[0];
  const expectedRevision = query.getRevision();

  await assert.rejects(
    () =>
      resolver.resolve({
        attentionId: item.attentionId,
        action: "retry-removal",
        expectedRevision,
      }),
    { code: "ARTICLE_ATTENTION_CONFIRMATION_REQUIRED" },
  );
  await assert.rejects(
    () =>
      resolver.resolve({
        attentionId: item.attentionId,
        action: "retry-removal",
        expectedRevision,
        confirmed: true,
      }),
    { code: "ARTICLE_REMOVAL_REPAIR_FAILED" },
  );
  assert.equal(query.getRevision(), expectedRevision);
  assert.equal(attempts, 1);

  fail = false;
  const resolved = await resolver.resolve({
    attentionId: item.attentionId,
    action: "retry-removal",
    expectedRevision,
    confirmed: true,
  });
  assert.equal(resolved.outcome, "resolved");
  assert.equal(query.getRevision(), expectedRevision + 1);
  assert.equal(attempts, 2);

  await assert.rejects(
    () =>
      resolver.resolve({
        attentionId: item.attentionId,
        action: "retry-removal",
        expectedRevision,
        confirmed: true,
      }),
    { code: "ARTICLE_ATTENTION_STALE" },
  );
  assert.equal(attempts, 2);
});

it("keeps Ticket 14 resolutions out of generic attention commands while preserving a reachable DTO projection", async () => {
  const query = createArticleAttentionQuery({
    operationalStore: {
      listPublicationAttention: () => [
        {
          publicationId: "publication-paid-1",
          articleId: "article-paid-1",
          status: "uncertain",
          attemptId: "attempt-paid-1",
          orderCreationAttemptId: "order-attempt-1",
          resolutionActions: [
            "bind-paid-order-number",
            "confirm-paid-order-absent",
          ],
        },
      ],
    },
  });
  const snapshot = query.list();
  const item = snapshot.items[0];
  assert.equal(snapshot.counts.actionable, 1);
  assert.deepEqual(item.allowedActions, ["open-publication"]);
  assert.deepEqual(item.resolutionActions, [
    "bind-paid-order-number",
    "confirm-paid-order-absent",
  ]);

  const resolver = createArticleAttentionResolver({ query });
  for (const action of item.allowedActions) {
    const preview = resolver.preview({ attentionId: item.attentionId, action });
    assert.equal(preview.action, action);
    assert.equal(preview.attentionId, item.attentionId);
    assert.equal(preview.revision, query.getRevision());
  }
  await assert.rejects(
    () =>
      resolver.resolve({
        attentionId: item.attentionId,
        action: "open-publication",
        expectedRevision: query.getRevision() + 1,
      }),
    { code: "ARTICLE_ATTENTION_STALE" },
  );
  const resolved = await resolver.resolve({
    attentionId: item.attentionId,
    action: "open-publication",
    expectedRevision: query.getRevision(),
  });
  assert.equal(resolved.outcome, "open-publication");
  assert.throws(
    () =>
      resolver.preview({
        attentionId: item.attentionId,
        action: "bind-paid-order-number",
      }),
    { code: "ARTICLE_ATTENTION_ACTION_NOT_ALLOWED" },
  );
  await assert.rejects(
    () =>
      resolver.resolve({
        attentionId: item.attentionId,
        action: "confirm-paid-order-absent",
        expectedRevision: query.getRevision(),
        confirmed: true,
      }),
    { code: "ARTICLE_ATTENTION_ACTION_NOT_ALLOWED" },
  );
});

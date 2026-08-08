const { it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createArticleAttentionQuery,
} = require("../desktop/services/article-attention-query");
const {
  createArticleAttentionResolver,
} = require("../desktop/services/article-attention-resolver");

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

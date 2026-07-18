const assert = require("node:assert/strict");
const test = require("node:test");

const { createArticleAttentionQuery } = require("../desktop/services/article-attention-query");
const { createArticleAttentionResolver } = require("../desktop/services/article-attention-resolver");

test("article attention resolver previews and delegates a safe missing-pair finalize", () => {
  const calls = [];
  const query = createArticleAttentionQuery({ readers: { listResidues: () => ({ items: [{ clientId: "client-1", articleId: "article-1", batchId: "batch-1", publicationId: "pub-1", attemptId: "attempt-1", targetPlatformId: "hepan", status: "failed", pairState: "both_absent", repairAction: "cleanup" }] }) } });
  const invalidations = [];
  const resolver = createArticleAttentionResolver({
    query,
    contentSubmissionService: { cleanupArticleSubmissionItem: (action) => { calls.push(action); return { status: "failed-cleaned", idempotent: true }; } },
    onDataInvalidated: (scopes, reasonCode) => invalidations.push({ scopes, reasonCode })
  });
  const item = query.list().items[0];
  const preview = resolver.preview({ attentionId: item.attentionId, action: "finalize" });
  assert.equal(preview.requiresConfirmation, true);
  assert.throws(() => resolver.resolve({ attentionId: item.attentionId, action: "finalize", expectedRevision: item.revision }), (error) => error.code === "ARTICLE_ATTENTION_CONFIRMATION_REQUIRED" || error.code === "ARTICLE_ATTENTION_STALE");
  const result = resolver.resolve({ attentionId: item.attentionId, action: "finalize", expectedRevision: query.getRevision(), confirmed: true });
  assert.equal(result.outcome, "resolved");
  assert.equal(calls[0].action, "cleanup");
  assert.deepEqual(invalidations[0].scopes, ["articleAttention", "platformQueue", "navigationSummary"]);
});

test("article attention resolver rejects an old revision before writing", () => {
  const query = createArticleAttentionQuery({ readers: { listResidues: () => ({ items: [{ clientId: "client-1", articleId: "article-1", batchId: "batch-1", publicationId: "pub-1", attemptId: "attempt-1", targetPlatformId: "hepan", status: "failed", pairState: "both_absent", repairAction: "cleanup" }] }) } });
  let called = false;
  const resolver = createArticleAttentionResolver({ query, contentSubmissionService: { cleanupArticleSubmissionItem: () => { called = true; } } });
  const item = query.list().items[0];
  query.invalidate();
  assert.throws(() => resolver.resolve({ attentionId: item.attentionId, action: "finalize", expectedRevision: 1, confirmed: true }), (error) => error.code === "ARTICLE_ATTENTION_STALE");
  assert.equal(called, false);
});

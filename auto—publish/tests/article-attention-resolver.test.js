const assert = require("node:assert/strict");
const test = require("node:test");

const { createArticleAttentionQuery } = require("../desktop/services/article-attention-query");
const { createArticleAttentionResolver } = require("../desktop/services/article-attention-resolver");

test("article attention resolver previews and delegates a safe missing-pair finalize", () => {
  const calls = [];
  const query = createArticleAttentionQuery({ contentSubmissionService: { cleanupArticleSubmissionItem: () => ({}) }, readers: { listResidues: () => ({ items: [{ clientId: "client-1", articleId: "article-1", batchId: "batch-1", publicationId: "pub-1", attemptId: "attempt-1", targetPlatformId: "hepan", status: "failed", pairState: "both_absent", repairAction: "cleanup" }] }) } });
  const invalidations = [];
  const resolver = createArticleAttentionResolver({
    query,
    contentSubmissionService: { cleanupArticleSubmissionItem: (action) => { calls.push(action); return { status: "failed-cleaned", idempotent: true }; } },
    onDataInvalidated: (reasonCode) => invalidations.push(reasonCode)
  });
  const item = query.list().items[0];
  const preview = resolver.preview({ attentionId: item.attentionId, action: "finalize" });
  assert.equal(preview.requiresConfirmation, true);
  assert.throws(() => resolver.resolve({ attentionId: item.attentionId, action: "finalize", expectedRevision: item.revision }), (error) => error.code === "ARTICLE_ATTENTION_CONFIRMATION_REQUIRED" || error.code === "ARTICLE_ATTENTION_STALE");
  const result = resolver.resolve({ attentionId: item.attentionId, action: "finalize", expectedRevision: query.getRevision(), confirmed: true });
  assert.equal(result.outcome, "resolved");
  assert.equal(calls[0].action, "cleanup");
  assert.equal(invalidations[0], "ARTICLE_ATTENTION_RESOLVED");
});

test("article attention resolver rejects an old revision before writing", () => {
  const query = createArticleAttentionQuery({ contentSubmissionService: { cleanupArticleSubmissionItem: () => ({}) }, readers: { listResidues: () => ({ items: [{ clientId: "client-1", articleId: "article-1", batchId: "batch-1", publicationId: "pub-1", attemptId: "attempt-1", targetPlatformId: "hepan", status: "failed", pairState: "both_absent", repairAction: "cleanup" }] }) } });
  let called = false;
  const resolver = createArticleAttentionResolver({ query, contentSubmissionService: { cleanupArticleSubmissionItem: () => { called = true; } } });
  const item = query.list().items[0];
  query.invalidate();
  assert.throws(() => resolver.resolve({ attentionId: item.attentionId, action: "finalize", expectedRevision: 1, confirmed: true }), (error) => error.code === "ARTICLE_ATTENTION_STALE");
  assert.equal(called, false);
});

test("article attention resolver delegates archive retry to the archive service contract", () => {
  const calls = [];
  const archiveService = {
    retryArchive: (item) => {
      calls.push(item);
      return { status: "archived", domainHandled: true, changedScopes: ["articleAttention"] };
    }
  };
  const query = createArticleAttentionQuery({
    archiveService,
    readers: {
      listArchiveFailures: () => [{
        clientId: "client-1", articleId: "article-1", batchId: "batch-1",
        publicationId: "pub-1", attemptId: "attempt-1", targetPlatformId: "hepan",
        status: "published", reasonCode: "PUBLISHED_ARCHIVE_FAILED"
      }]
    }
  });
  const resolver = createArticleAttentionResolver({ query, archiveService });
  const item = query.list().items[0];

  const result = resolver.resolve({ attentionId: item.attentionId, action: "retry-archive", expectedRevision: query.getRevision(), confirmed: true });

  assert.equal(result.result.status, "archived");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].publicationId, "pub-1");
});

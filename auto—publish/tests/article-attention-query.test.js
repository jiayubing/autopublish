const assert = require("node:assert/strict");
const test = require("node:test");

const { createArticleAttentionQuery } = require("../desktop/services/article-attention-query");

test("publication-only failed fixture exposes only actions supported by its current facts", () => {
  const query = createArticleAttentionQuery({
    contentSubmissionService: {
      previewRetryFailedPublication: () => ({}),
      retryFailedPublication: () => ({}),
      cleanupArticleSubmissionItem: () => ({})
    },
    readers: {
      listResidues: () => ({ items: [] }),
      listTransactions: () => [],
      listPublications: () => [{
        publicationId: "pub-failed",
        clientId: "client-1",
        articleId: "article-1",
        platformId: "hepan",
        status: "failed",
        attempts: [{ attemptId: "attempt-failed", status: "failed", reasonCode: "REMOTE_REJECTED" }]
      }],
      getArticle: () => ({ status: "saved", title: "可重试文章" }),
      platformCapabilities: () => ({ hepan: { contentQueueImport: true } })
    },
    getRevision: () => 7
  });
  const item = query.list({ clientId: "client-1" }).items[0];
  assert.deepEqual(item.allowedActions, ["retry-publication", "open-publication"]);
  assert.equal(item.allowedActions.includes("cleanup"), false);
  assert.equal(item.allowedActions.includes("retry"), false);
});

test("removed failed publication is excluded from attention while remaining queryable as history", () => {
  const query = createArticleAttentionQuery({
    contentSubmissionService: {
      previewRetryFailedPublication: () => ({}),
      retryFailedPublication: () => ({}),
      cleanupArticleSubmissionItem: () => ({})
    },
    readers: {
      listResidues: () => ({ items: [] }),
      listTransactions: () => [],
      listPublications: () => [{ publicationId: "pub-removed", clientId: "client-1", articleId: "article-removed", platformId: "hepan", status: "failed", attempts: [{ attemptId: "attempt-removed", status: "failed" }] }],
      getArticle: () => { const error = new Error("missing"); error.code = "ARTICLE_NOT_FOUND"; throw error; },
      getTrashedArticle: () => ({ status: "saved", titleSnapshot: "已删除历史" })
    }
  });
  assert.equal(query.list({ clientId: "client-1" }).items.some((item) => item.publicationId === "pub-removed"), false);
});

test("article attention query aggregates safe, actionable DTOs without filesystem paths", () => {
  const query = createArticleAttentionQuery({
    contentSubmissionService: { cleanupArticleSubmissionItem: () => ({}) },
    readers: {
      listResidues: () => ({ items: [
        { clientId: "client-1", articleId: "article-1", batchId: "batch-1", publicationId: "pub-1", attemptId: "attempt-1", targetPlatformId: "hepan", status: "failed", pairState: "both_absent", repairAction: "cleanup", mainExists: false, sidecarExists: false, titleSnapshot: "残留文章" },
        { clientId: "client-1", articleId: "article-2", batchId: "batch-2", publicationId: "pub-2", attemptId: "attempt-2", targetPlatformId: "hepan", status: "failed", pairState: "content_changed", reasonCode: "SUBMISSION_QUEUE_CHANGED", filePath: "C:\\secret.md" }
      ] }),
      listTransactions: () => [{ id: "removal-1", clientId: "client-1", articleId: "article-3", status: "needs_repair", phase: "needs_repair", errorCode: "SUBMISSION_QUEUE_CHANGED", updatedAt: "2026-07-19T00:00:00.000Z", articles: [{ clientId: "client-1", articleId: "article-3" }] }],
      listPublications: () => [{ publicationId: "pub-3", clientId: "client-1", articleId: "article-4", platformId: "toutiao", status: "uncertain", attempts: [{ attemptId: "attempt-3", status: "uncertain" }] }],
      listArchiveFailures: () => [{ publicationId: "pub-4", clientId: "client-1", articleId: "article-5", platformId: "lieju", status: "published", reasonCode: "PUBLISHED_ARCHIVE_FAILED" }]
    }
  });

  const result = query.list({ clientId: "client-1" });
  assert.equal(result.items.length, 5);
  assert.equal(result.items.find((item) => item.articleId === "article-1").kind, "missing_pair_finalize");
  assert.equal(result.items.find((item) => item.articleId === "article-2").kind, "queue_pair_conflict");
  assert.equal(result.items.find((item) => item.transactionId === "removal-1").kind, "removal_needs_repair");
  assert.equal(result.items.find((item) => item.publicationId === "pub-3").kind, "publication_uncertain");
  assert.equal(result.items.find((item) => item.publicationId === "pub-4").kind, "published_archive_failed");
  result.items.forEach((item) => {
    assert.equal(Object.prototype.hasOwnProperty.call(item, "filePath"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(item, "sidecarPath"), false);
  });
});

test("article attention query revision changes only after explicit invalidation", () => {
  const query = createArticleAttentionQuery({ readers: { listResidues: () => ({ items: [] }) } });
  const first = query.list().revision;
  assert.equal(query.list().revision, first);
  query.invalidate();
  assert.equal(query.list().revision, first + 1);
});

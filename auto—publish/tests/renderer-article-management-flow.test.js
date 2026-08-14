const assert = require("node:assert/strict");
const test = require("node:test");
const { deriveArticleLifecycle } = require("../src/content/article-lifecycle-projection");

test("article management keeps failure attention independent while published articles stay read-only", () => {
  const base = {
    article: {
      id: "article-1",
      clientId: "client-1",
      title: "文章",
      content: "正文",
      status: "saved",
    },
    submissionItems: [],
    orders: [],
    attentionItems: [],
    removalTransactions: [],
  };
  const failed = deriveArticleLifecycle({
    ...base,
    publications: [{ articleId: "article-1", status: "failed" }],
  });
  const published = deriveArticleLifecycle({
    ...base,
    publications: [{ articleId: "article-1", status: "published" }],
  });
  assert.equal(failed.stage, "pending_submission");
  assert.equal(failed.operations.submit.allowed, true);
  assert.equal(failed.locks.canTrash, true);
  assert.equal(published.stage, "published");
  assert.equal(published.locks.canTrash, false);
});

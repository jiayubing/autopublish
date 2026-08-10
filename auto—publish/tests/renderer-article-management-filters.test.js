const assert = require("node:assert/strict");
const test = require("node:test");
const { deriveArticleLifecycle } = require("../src/content/article-lifecycle-projection");

const article = (status = "saved") => ({
  id: "article-1",
  clientId: "client-1",
  title: "文章",
  content: "正文",
  status,
});

test("article management exposes one public stage axis with no review compatibility state", () => {
  const cases = [
    ["pending_submission", {}],
    ["queued", { submissionItems: [{ articleId: "article-1", status: "queued" }] }],
    ["paid_processing", { orders: [{ articleId: "article-1", orderId: "order-1", supplierStatusCode: "0", mediaResourceId: "resource-1" }] }],
    ["failed", { publications: [{ articleId: "article-1", status: "failed" }] }],
    ["published", { publications: [{ articleId: "article-1", status: "published" }] }],
    ["trash", { article: article("trashed") }],
  ];
  const stages = cases.map(([expectedStage, overrides]) =>
    deriveArticleLifecycle({
      article: article(),
      publications: [],
      submissionItems: [],
      orders: [],
      attentionItems: [],
      removalTransactions: [],
      ...overrides,
    }).stage,
  );
  assert.deepEqual(stages, cases.map(([stage]) => stage));
  assert.equal(stages.includes("pending_review"), false);
});

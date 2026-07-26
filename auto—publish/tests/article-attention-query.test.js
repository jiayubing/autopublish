const { it } = require("node:test");
const assert = require("node:assert/strict");
const { createArticleAttentionQuery } = require("../desktop/services/article-attention-query");

it("distinguishes automatic removal recovery from a transaction needing manual repair", () => {
  const query = createArticleAttentionQuery({
    readers: { listTransactions: () => [
      { id: "auto", transactionId: "auto", clientId: "c", articleId: "a", status: "pending_auto_recovery", phase: "queue-actions" },
      { id: "repair", transactionId: "repair", clientId: "c", articleId: "b", status: "needs_repair", phase: "needs_repair" }
    ] },
    articleRemovalService: { retryArticleRemovalTransaction: () => ({}) }
  });
  const items = query.list().items;
  assert.equal(items.find((item) => item.transactionId === "auto").kind, "removal_auto_recovery");
  assert.deepEqual(items.find((item) => item.transactionId === "auto").allowedActions, ["inspect"]);
  assert.equal(items.find((item) => item.transactionId === "repair").kind, "removal_needs_repair");
  assert.ok(items.find((item) => item.transactionId === "repair").allowedActions.includes("retry-removal"));
});

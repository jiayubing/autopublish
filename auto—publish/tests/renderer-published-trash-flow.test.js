const assert = require("node:assert/strict");
const test = require("node:test");
const { deriveArticleLifecycle } = require("../src/content/article-lifecycle-projection");

test("published article lifecycle preserves publication evidence and blocks trash", () => {
  const workflow = deriveArticleLifecycle({
    article: {
      id: "published-article",
      clientId: "client-1",
      title: "已发布文章",
      content: "正文",
      status: "saved",
    },
    publications: [
      {
        articleId: "published-article",
        status: "published",
        targetKey: "platform:fixture",
      },
    ],
    submissionItems: [],
    orders: [],
    attentionItems: [],
    removalTransactions: [],
  });
  assert.equal(workflow.stage, "published");
  assert.equal(workflow.primaryAction, "view_publication");
  assert.equal(workflow.locks.canTrash, false);
  assert.equal(workflow.operations.trash.allowed, false);
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  deriveArticleLifecycle,
} = require("../src/content/article-lifecycle-projection");

function article() {
  return {
    id: "article-one-success",
    clientId: "client-a",
    title: "只能成功发布一次",
    content: "一旦任意目标发布成功，这篇文章就不能再次发起投稿。",
    status: "saved",
  };
}

describe("single successful publication target", function () {
  it("closes submission after a regular platform publishes successfully", function () {
    const workflow = deriveArticleLifecycle({
      article: article(),
      publications: [{
        publicationId: "publication-lieju",
        articleId: "article-one-success",
        clientId: "client-a",
        targetKey: "platform:lieju",
        platformId: "lieju",
        mediaResourceId: null,
        status: "published",
      }],
      submissionItems: [],
      orders: [],
    });

    assert.equal(workflow.stage, "published");
    assert.equal(workflow.locks.canSubmit, false);
    assert.equal(workflow.operations.submit.allowed, false);
    assert.deepEqual(workflow.operations.submit.reasonCodes, [
      "ARTICLE_PUBLISHED_IMMUTABLE",
    ]);
  });

  it("closes submission after a paid media target publishes successfully", function () {
    const workflow = deriveArticleLifecycle({
      article: article(),
      publications: [{
        publicationId: "publication-media",
        articleId: "article-one-success",
        clientId: "client-a",
        targetKey: "media:media-a",
        platformId: null,
        mediaResourceId: "media-a",
        status: "published",
      }],
      submissionItems: [],
      orders: [{
        orderId: "order-a",
        articleId: "article-one-success",
        mediaResourceId: "media-a",
        supplierStatusCode: "2",
        publicationStatus: "published",
      }],
    });

    assert.equal(workflow.stage, "published");
    assert.equal(workflow.locks.canSubmit, false);
    assert.equal(workflow.operations.submit.allowed, false);
    assert.deepEqual(workflow.operations.submit.reasonCodes, [
      "ARTICLE_PUBLISHED_IMMUTABLE",
    ]);
  });
});

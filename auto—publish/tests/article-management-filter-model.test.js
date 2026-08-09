const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const article = (status = "saved") => ({
  id: "article-1",
  clientId: "client-1",
  title: "文章",
  content: "正文",
  status,
});
const {
  deriveArticleLifecycle,
} = require("../src/content/article-lifecycle-projection");

describe("article management filter model", () => {
  it("projects the six mutually exclusive public stages with their labels", () => {
    const cases = [
      ["pending_submission", "待投稿", {}],
      [
        "queued",
        "投稿队列",
        {
          submissionItems: [
            {
              articleId: "article-1",
              status: "queued",
              targetKey: "platform:p1",
            },
          ],
        },
      ],
      [
        "paid_processing",
        "付费处理中",
        {
          orders: [
            {
              articleId: "article-1",
              orderId: "order-1",
              supplierStatusCode: "0",
              mediaResourceId: "resource-1",
            },
          ],
        },
      ],
      [
        "failed",
        "需处理",
        {
          publications: [
            {
              articleId: "article-1",
              status: "uncertain",
              targetKey: "platform:p1",
            },
          ],
        },
      ],
      [
        "published",
        "已发布",
        {
          publications: [
            {
              articleId: "article-1",
              status: "published",
              targetKey: "platform:p1",
            },
          ],
        },
      ],
      ["trash", "回收站", { article: article("trashed") }],
    ];

    const projected = cases.map(([expectedStage, expectedLabel, overrides]) => {
      const workflow = deriveArticleLifecycle({
        article: article(),
        publications: [],
        submissionItems: [],
        orders: [],
        attentionItems: [],
        removalTransactions: [],
        ...overrides,
      });
      assert.equal(workflow.stage, expectedStage);
      assert.equal(workflow.label, expectedLabel);
      return workflow.stage;
    });

    assert.deepEqual(projected, [
      "pending_submission",
      "queued",
      "paid_processing",
      "failed",
      "published",
      "trash",
    ]);
    assert.equal(new Set(projected).size, projected.length);
  });

  it("allows local cleanup only for terminal publication results", () => {
    const base = {
      article: article(),
      attentionItems: [],
      removalTransactions: [],
    };
    assert.equal(
      deriveArticleLifecycle({
        ...base,
        publications: [
          {
            articleId: "article-1",
            status: "published",
            targetKey: "platform:p1",
          },
        ],
      }).locks.canTrash,
      false,
    );
    assert.equal(
      deriveArticleLifecycle({
        ...base,
        publications: [
          {
            articleId: "article-1",
            status: "failed",
            targetKey: "platform:p1",
          },
        ],
      }).locks.canTrash,
      true,
    );
    assert.equal(
      deriveArticleLifecycle({
        ...base,
        publications: [
          {
            articleId: "article-1",
            status: "uncertain",
            targetKey: "platform:p1",
          },
        ],
      }).locks.canTrash,
      false,
    );
  });
});

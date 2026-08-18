"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const domain = require("../src/domain");
const { createRegularQueueApplication } = require("../desktop/services/regular-queue-application");

function target(accountProfileId) {
  return domain.parsePublicationTarget({
    kind: "platform",
    platformId: "lieju",
    accountProfileId,
  });
}

test("failed historical target does not block preview admission to a different account profile", () => {
  const article = {
    id: "article-failed-retarget",
    clientId: "client-a",
    title: "失败后改投文章",
    content: "正文完整，因此明确失败结束后应恢复待投稿并允许选择新的账号档案。",
    status: "saved",
  };
  const oldTarget = target("profile-old");
  const application = createRegularQueueApplication({
    contentStore: {
      getArticle(clientId, articleId) {
        assert.equal(clientId, article.clientId);
        assert.equal(articleId, article.id);
        return article;
      },
    },
    articleMutationCoordinator: {},
    regularQueueTransitions: {
      listArticleLifecycleFacts() {
        return {
          publications: [{
            articleId: article.id,
            status: "failed",
            targetKey: domain.publicationTargetKey(oldTarget),
            platformId: "lieju",
          }],
          submissionItems: [],
          orders: [],
          attentionItems: [],
          removalTransactions: [],
        };
      },
    },
    accountProfileResolver({ accountProfileId, platformId }) {
      return { accountProfileId, platformId, displayName: accountProfileId };
    },
    platforms: [{ id: "lieju", publicationTargetKind: "platform", imagePublishing: true }],
  });

  const preview = application.previewRegularQueueAdmission({
    articleRefs: [{ clientId: article.clientId, articleId: article.id }],
    platformId: "lieju",
    accountProfileId: "profile-new",
  });

  assert.equal(preview.queueableCount, 1);
  assert.equal(preview.conflictCount, 0);
  assert.equal(preview.items[0].status, "queueable");
});

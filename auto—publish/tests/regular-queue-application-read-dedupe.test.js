"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createRegularQueueApplication,
} = require("../desktop/services/regular-queue-application");

test("regular queue admission resolves one customer snapshot per client", () => {
  let clientSnapshotReads = 0;
  let admittedInput = null;
  const app = createRegularQueueApplication({
    contentStore: {
      getArticle() {
        throw new Error("formal admission should be owned by the coordinator");
      },
    },
    articleMutationCoordinator: {
      admitRegularQueueItems(input) {
        admittedInput = input;
        return {
          admittedCount: 0,
          idempotentCount: 0,
          items: [],
        };
      },
    },
    regularQueueTransitions: {
      listArticleLifecycleFacts() {
        return { publications: [], submissionItems: [], orders: [] };
      },
    },
    accountProfileResolver() {
      return { displayName: "Account" };
    },
    clientSnapshotResolver(clientId) {
      clientSnapshotReads += 1;
      return { version: 1, clientId, displayName: "Client" };
    },
    platforms: [
      {
        id: "hepan",
        displayName: "蓝色河畔",
        publicationTargetKind: "platform",
        imagePublishing: false,
      },
    ],
  });

  app.admitRegularQueueItems({
    platformId: "hepan",
    accountProfileId: "account-a",
    articleRefs: [
      { clientId: "client-a", articleId: "article-a" },
      { clientId: "client-a", articleId: "article-b" },
      { clientId: "client-a", articleId: "article-c" },
    ],
  });

  assert.equal(clientSnapshotReads, 1);
  assert.ok(admittedInput);
  assert.deepEqual(Object.keys(admittedInput.customerSnapshotsV1), ["client-a"]);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createRegularQueueApplication,
} = require("../desktop/services/regular-queue-application");

test("regular queue admission resolves one customer snapshot per client", () => {
  let clientSnapshotReads = 0;
  let accountReads = 0;
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
      accountReads += 1;
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
  assert.equal(accountReads, 1);
  assert.ok(admittedInput);
  assert.deepEqual(Object.keys(admittedInput.customerSnapshotsV1), [
    "client-a",
  ]);
});

test("preview reads each idempotent group once per request and refreshes on the next request", () => {
  const refs = Array.from({ length: 30 }, (_, index) => ({
    clientId: "client-a",
    articleId: `article-${index}`,
  }));
  let groupReads = 0;
  let reasonCode = "REGULAR_CLIENT_PROFILE_INCOMPLETE";
  const app = createRegularQueueApplication({
    contentStore: {
      getArticle(clientId, id) {
        return { id, clientId, title: id, content: "Body", status: "saved" };
      },
    },
    articleMutationCoordinator: {},
    regularQueueTransitions: {
      listArticleLifecycleFacts() {
        return {
          publications: [],
          orders: [],
          attentionItems: [],
          submissionItems: refs.map((ref) => ({
            articleId: ref.articleId,
            targetKey: require("../src/domain").publicationTargetKey({
              kind: "platform",
              platformId: "hepan",
              accountProfileId: "account-a",
            }),
            status: "queued",
            queueGroupId: "group-a",
          })),
        };
      },
    },
    regularQueueGroupTransitions: {
      listRegularQueueGroupSnapshots(input) {
        assert.equal(input.queueGroupId, "group-a");
        groupReads += 1;
        return [{ queueGroupId: "group-a", actions: { reasonCode } }];
      },
    },
    accountProfileResolver() {
      return { displayName: "Account" };
    },
    platforms: [
      {
        id: "hepan",
        publicationTargetKind: "platform",
        imagePublishing: false,
      },
    ],
  });
  const input = {
    platformId: "hepan",
    accountProfileId: "account-a",
    articleRefs: refs,
  };
  const first = app.previewRegularQueueAdmission(input);
  assert.equal(first.idempotentCount, 30);
  assert.equal(groupReads, 1);
  assert.ok(first.items.every((item) => item.reasonCode === reasonCode));
  reasonCode = null;
  const second = app.previewRegularQueueAdmission(input);
  assert.equal(groupReads, 2);
  assert.ok(second.items.every((item) => item.reasonCode === undefined));
});

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCrossClientRegularQueueApplication,
} = require("../desktop/services/cross-client-regular-queue-application");

function articleRef(clientId, articleId) {
  return { clientId, articleId };
}

function createBaseApplication(options) {
  const value = options || {};
  const admits = [];
  return {
    admits,
    previewRegularQueueAdmission(input) {
      const clientId = input.articleRefs[0].clientId;
      if (value.previewFailClientId === clientId) {
        const error = new Error("preview failed");
        error.code = "PREVIEW_FAILED";
        throw error;
      }
      return {
        target: { platformId: "platform-1", accountProfileId: "account-1" },
        items: input.articleRefs.map(function (ref) {
          if (value.idempotentArticleId === ref.articleId) {
            return {
              articleRef: ref,
              articleId: ref.articleId,
              status: "idempotent",
              batchId: "existing-batch",
            };
          }
          return {
            articleRef: ref,
            articleId: ref.articleId,
            status: "queueable",
          };
        }),
      };
    },
    admitRegularQueueItems(input) {
      const clientId = input.articleRefs[0].clientId;
      admits.push(clientId);
      if (value.admitFailClientId === clientId)
        throw Object.assign(new Error("commit state unknown"), {
          code: "IO_FAILED",
        });
      const batchId = `batch-${clientId}`;
      return {
        batchId,
        items: input.articleRefs.map(function (ref) {
          return {
            articleRef: ref,
            articleId: ref.articleId,
            status: "queued",
            batchId,
            queueGroupId: `group-${clientId}`,
          };
        }),
      };
    },
    removePendingQueueItems() {},
    listRegularQueueGroups() {
      return [];
    },
    updateRegularQueueGroupImageCount() {},
    updateRegularQueueGroupSubmissionInterval() {},
  };
}

function createApplication(base) {
  return createCrossClientRegularQueueApplication({
    regularQueueApplication: base,
  });
}

const commonInput = {
  platformId: "platform-1",
  accountProfileId: "account-1",
};

test("cross-client preview aggregates per-client admission facts", function () {
  const base = createBaseApplication();
  const application = createApplication(base);
  const result = application.previewRegularQueueAdmission({
    ...commonInput,
    articleRefs: [articleRef("client-1", "article-1"), articleRef("client-2", "article-2")],
  });

  assert.equal(result.totalCount, 2);
  assert.equal(result.queueableCount, 2);
  assert.equal(result.idempotentCount, 0);
});

test("multiple client admissions keep their real batch boundaries", function () {
  const base = createBaseApplication();
  const application = createApplication(base);
  const result = application.admitRegularQueueItems({
    ...commonInput,
    articleRefs: [articleRef("client-1", "article-1"), articleRef("client-2", "article-2")],
  });

  assert.equal(result.admittedCount, 2);
  assert.equal(result.batchId, undefined);
  assert.deepEqual(base.admits, ["client-1", "client-2"]);
  assert.deepEqual(
    result.items.map(function (item) {
      return item.batchId;
    }),
    ["batch-client-1", "batch-client-2"],
  );
});

test("definite later precheck failure does not roll back or block later clients", function () {
  const base = createBaseApplication({ previewFailClientId: "client-2" });
  const application = createApplication(base);
  const result = application.admitRegularQueueItems({
    ...commonInput,
    articleRefs: [
      articleRef("client-1", "article-1"),
      articleRef("client-2", "article-2"),
      articleRef("client-3", "article-3"),
    ],
  });

  assert.deepEqual(
    result.items.map(function (item) {
      return item.status;
    }),
    ["queued", "failed", "queued"],
  );
  assert.deepEqual(base.admits, ["client-1", "client-3"]);
});

test("mutation exception becomes uncertain and later clients remain unprocessed", function () {
  const base = createBaseApplication({ admitFailClientId: "client-2" });
  const application = createApplication(base);
  const result = application.admitRegularQueueItems({
    ...commonInput,
    articleRefs: [
      articleRef("client-1", "article-1"),
      articleRef("client-2", "article-2"),
      articleRef("client-3", "article-3"),
    ],
  });

  assert.deepEqual(
    result.items.map(function (item) {
      return item.status;
    }),
    ["queued", "uncertain", "not_processed"],
  );
  assert.deepEqual(base.admits, ["client-1", "client-2"]);
});

test("idempotent re-entry does not enqueue the same article again", function () {
  const base = createBaseApplication({ idempotentArticleId: "article-2" });
  const application = createApplication(base);
  const result = application.admitRegularQueueItems({
    ...commonInput,
    articleRefs: [articleRef("client-1", "article-1"), articleRef("client-2", "article-2")],
  });

  assert.equal(result.idempotentCount, 1);
  assert.deepEqual(base.admits, ["client-1"]);
});

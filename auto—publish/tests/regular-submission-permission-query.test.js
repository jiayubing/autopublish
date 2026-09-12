"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createRegularSubmissionPermissionQuery,
} = require("../desktop/services/regular-submission-permission-query");
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");

function article(id) {
  return { id, clientId: "client-a", title: `Title ${id}`, content: `Body ${id}` };
}

test("regular submission permission query reads only requested articles and reuses lifecycle projection", async () => {
  const articleReads = [];
  const factReads = [];
  const articles = new Map([
    ["clean", article("clean")],
    ["queued", article("queued")],
  ]);
  const query = createRegularSubmissionPermissionQuery({
    contentStore: {
      getArticleSummary(clientId, articleId) {
        articleReads.push([clientId, articleId]);
        if (articles.has(articleId)) return articles.get(articleId);
        const error = new Error("missing");
        error.code = "ARTICLE_NOT_FOUND";
        throw error;
      },
      isArticleTrashed(clientId, articleId) {
        return clientId === "client-a" && articleId === "trash";
      },
    },
    operationalStore: {
      listArticleLifecycleFacts(input) {
        factReads.push(input);
        return {
          publications: [],
          submissionItems: [
            {
              articleId: "queued",
              clientId: "client-a",
              status: "queued",
              platformId: "hepan",
            },
          ],
          orders: [],
        };
      },
    },
    articleAttentionQuery: {
      list() {
        return { items: [] };
      },
    },
    aiContentService: {
      listArticleRemovalTransactions() {
        return [];
      },
    },
    getRevision() {
      return 9;
    },
  });

  const result = await query.list({
    clientId: "client-a",
    articleIds: ["clean", "queued", "trash", "missing", "clean"],
  });

  assert.equal(result.clientId, "client-a");
  assert.equal(result.revision, 9);
  assert.deepEqual(
    result.items.map((item) => [item.articleId, item.allowed]),
    [
      ["clean", true],
      ["queued", false],
      ["trash", false],
      ["missing", false],
    ],
  );
  assert.deepEqual(result.items.at(-1).reasonCodes, ["ARTICLE_NOT_FOUND"]);
  assert.deepEqual(articleReads, [
    ["client-a", "clean"],
    ["client-a", "queued"],
    ["client-a", "trash"],
    ["client-a", "missing"],
  ]);
  assert.deepEqual(factReads, [
    { articleIds: ["clean", "queued", "trash", "missing"] },
  ]);
});

test("regular submission permission IPC contract is registered and rejects extra request fields", () => {
  const contract = productionIpcRegistry.byChannel(
    "content:list-regular-submission-permissions",
  );
  assert.equal(contract.capability, "content.listRegularSubmissionPermissions");
  assert.throws(() =>
    productionIpcRegistry.encodeRequest(contract, {
      clientId: "client-a",
      articleIds: ["article-a"],
      unexpected: true,
    }),
  );
  const encoded = productionIpcRegistry.encodeRequest(contract, {
    clientId: "client-a",
    articleIds: ["article-a"],
  });
  assert.equal(encoded.schemaVersion, 1);
});

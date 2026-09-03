const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

async function loadCoordinator() {
  return import(
    pathToFileURL(
      path.join(
        root,
        "media-workbench/src/features/submission/batch-regular-submission-coordinator.js",
      ),
    )
  );
}

describe("batch regular submission coordinator", () => {
  it("splits one multi-client selection into single-client previews and admissions", async () => {
    const {
      groupBatchArticleRefs,
      previewBatchRegularSubmission,
      admitBatchRegularSubmission,
    } = await loadCoordinator();
    const articleRefs = [
      { clientId: "client-a", articleId: "a-1" },
      { clientId: "client-b", articleId: "b-1" },
      { clientId: "client-a", articleId: "a-2" },
      { clientId: "client-a", articleId: "a-2" },
    ];

    assert.deepEqual(groupBatchArticleRefs(articleRefs), [
      {
        clientId: "client-a",
        articleRefs: [
          { clientId: "client-a", articleId: "a-1" },
          { clientId: "client-a", articleId: "a-2" },
        ],
      },
      {
        clientId: "client-b",
        articleRefs: [{ clientId: "client-b", articleId: "b-1" }],
      },
    ]);

    const previews = [];
    const preview = await previewBatchRegularSubmission(
      {
        articleRefs,
        platformId: "lieju",
        accountProfileId: "account-1",
      },
      {
        previewRegularQueueAdmission: async (input) => {
          previews.push(input);
          assert.equal(new Set(input.articleRefs.map((ref) => ref.clientId)).size, 1);
          return {
            queueableCount: input.articleRefs.length,
            idempotentCount: 0,
            missingCount: 0,
            conflictCount: 0,
          };
        },
      },
    );

    assert.equal(previews.length, 2);
    assert.equal(preview.clientCount, 2);
    assert.equal(preview.articleCount, 3);
    assert.equal(preview.queueableCount, 3);

    const admissions = [];
    const admitted = await admitBatchRegularSubmission(
      {
        articleRefs,
        platformId: "lieju",
        accountProfileId: "account-1",
      },
      {
        admitRegularQueueItems: async (input) => {
          admissions.push(input);
          assert.equal(new Set(input.articleRefs.map((ref) => ref.clientId)).size, 1);
          assert.equal(input.autoStart, true);
          return {
            admittedCount: input.articleRefs.length,
            idempotentCount: 0,
            missingCount: 0,
            conflictCount: 0,
          };
        },
      },
    );

    assert.equal(admissions.length, 2);
    assert.deepEqual(admitted.succeededClientIds, ["client-a", "client-b"]);
    assert.deepEqual(admitted.failedClientIds, []);
    assert.equal(admitted.admittedCount, 3);
  });

  it("preserves committed clients and reports only failed clients for retry", async () => {
    const { admitBatchRegularSubmission } = await loadCoordinator();
    const calls = [];
    const result = await admitBatchRegularSubmission(
      {
        articleRefs: [
          { clientId: "client-a", articleId: "a-1" },
          { clientId: "client-b", articleId: "b-1" },
          { clientId: "client-c", articleId: "c-1" },
        ],
        platformId: "lieju",
        accountProfileId: "account-1",
      },
      {
        admitRegularQueueItems: async (input) => {
          const clientId = input.articleRefs[0].clientId;
          calls.push(clientId);
          if (clientId === "client-b") {
            const error = new Error("client b blocked");
            error.code = "CLIENT_B_BLOCKED";
            throw error;
          }
          return {
            admittedCount: 1,
            idempotentCount: 0,
            missingCount: 0,
            conflictCount: 0,
          };
        },
      },
    );

    assert.deepEqual(calls, ["client-a", "client-b", "client-c"]);
    assert.deepEqual(result.succeededClientIds, ["client-a", "client-c"]);
    assert.deepEqual(result.failedClientIds, ["client-b"]);
    assert.equal(result.admittedCount, 2);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].code, "CLIENT_B_BLOCKED");
  });
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  admitBatchRegularSubmission,
  groupBatchArticleRefs,
  previewBatchRegularSubmission,
} from "../media-workbench/src/features/submission/batch-regular-submission-coordinator.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));

function refs() {
  return [
    { clientId: "client-a", articleId: "article-a1" },
    { clientId: "client-b", articleId: "article-b1" },
    { clientId: "client-a", articleId: "article-a2" },
    { clientId: "client-a", articleId: "article-a1" },
  ];
}

function previewResult(articleRefs, statuses) {
  const items = articleRefs.map((articleRef, index) => ({
    articleRef,
    articleId: articleRef.articleId,
    status: statuses[index],
  }));
  return {
    items,
    queueableCount: items.filter((item) => item.status === "queueable").length,
    idempotentCount: items.filter((item) => item.status === "idempotent").length,
    missingCount: items.filter((item) => item.status === "missing").length,
    conflictCount: items.filter((item) => item.status === "conflict").length,
  };
}

test("batch submission groups cross-client article refs before canonical admission", async () => {
  assert.deepEqual(groupBatchArticleRefs(refs()), [
    {
      clientId: "client-a",
      articleRefs: [
        { clientId: "client-a", articleId: "article-a1" },
        { clientId: "client-a", articleId: "article-a2" },
      ],
    },
    {
      clientId: "client-b",
      articleRefs: [{ clientId: "client-b", articleId: "article-b1" }],
    },
  ]);

  const previewCalls = [];
  const preview = await previewBatchRegularSubmission(
    {
      articleRefs: refs(),
      platformId: "lieju",
      accountProfileId: "account-1",
    },
    {
      async previewRegularQueueAdmission(input) {
        previewCalls.push(input);
        return previewResult(
          input.articleRefs,
          input.articleRefs.map(() => "queueable"),
        );
      },
    },
  );

  assert.equal(preview.clientCount, 2);
  assert.equal(preview.articleCount, 3);
  assert.equal(preview.queueableCount, 3);
  assert.deepEqual(preview.queueableArticleRefs, [
    { clientId: "client-a", articleId: "article-a1" },
    { clientId: "client-a", articleId: "article-a2" },
    { clientId: "client-b", articleId: "article-b1" },
  ]);
  assert.equal(previewCalls.length, 2);
  for (const call of previewCalls) {
    assert.equal(new Set(call.articleRefs.map((ref) => ref.clientId)).size, 1);
    assert.equal(call.platformId, "lieju");
    assert.equal(call.accountProfileId, "account-1");
  }

  const admitCalls = [];
  const admitted = await admitBatchRegularSubmission(
    {
      articleRefs: preview.queueableArticleRefs,
      platformId: "lieju",
      accountProfileId: "account-1",
    },
    {
      async admitRegularQueueItems(input) {
        admitCalls.push(input);
        return {
          admittedCount: input.articleRefs.length,
          idempotentCount: 0,
          missingCount: 0,
          conflictCount: 0,
        };
      },
    },
  );

  assert.equal(admitted.clientCount, 2);
  assert.equal(admitted.admittedCount, 3);
  assert.deepEqual(admitted.failedClientIds, []);
  assert.deepEqual(admitted.uncertainClientIds, []);
  assert.equal(admitCalls.length, 2);
  for (const call of admitCalls) {
    assert.equal(new Set(call.articleRefs.map((ref) => ref.clientId)).size, 1);
    assert.equal(call.platformId, "lieju");
    assert.equal(call.accountProfileId, "account-1");
    assert.equal(call.autoStart, true);
  }
});

test("canonical preview keeps idempotent articles out of the next mutation input", async () => {
  const articleRefs = [
    { clientId: "client-a", articleId: "article-a1" },
    { clientId: "client-a", articleId: "article-a2" },
  ];
  const preview = await previewBatchRegularSubmission(
    {
      articleRefs,
      platformId: "lieju",
      accountProfileId: "account-1",
    },
    {
      async previewRegularQueueAdmission(input) {
        return previewResult(input.articleRefs, ["queueable", "idempotent"]);
      },
    },
  );

  assert.deepEqual(preview.queueableArticleRefs, [articleRefs[0]]);
  assert.deepEqual(preview.idempotentArticleRefs, [articleRefs[1]]);
  assert.equal(preview.queueableCount, 1);
  assert.equal(preview.idempotentCount, 1);

  const admitCalls = [];
  await admitBatchRegularSubmission(
    {
      articleRefs: preview.queueableArticleRefs,
      platformId: "lieju",
      accountProfileId: "account-1",
    },
    {
      async admitRegularQueueItems(input) {
        admitCalls.push(input.articleRefs);
        return {
          admittedCount: 1,
          idempotentCount: 0,
          missingCount: 0,
          conflictCount: 0,
        };
      },
    },
  );

  assert.deepEqual(admitCalls, [[articleRefs[0]]]);
});

test("partial explicit failure remains retryable without reclassifying successful clients", async () => {
  const result = await admitBatchRegularSubmission(
    {
      articleRefs: refs(),
      platformId: "lieju",
      accountProfileId: "account-1",
    },
    {
      async admitRegularQueueItems(input) {
        if (input.articleRefs[0].clientId === "client-b") {
          const error = new Error("client-b rejected");
          error.code = "CLIENT_B_REJECTED";
          throw error;
        }
        return {
          admittedCount: input.articleRefs.length,
          idempotentCount: 0,
          missingCount: 0,
          conflictCount: 0,
        };
      },
    },
  );

  assert.deepEqual(result.succeededClientIds, ["client-a"]);
  assert.deepEqual(result.failedClientIds, ["client-b"]);
  assert.deepEqual(result.uncertainClientIds, []);
  assert.equal(result.failures[0].code, "CLIENT_B_REJECTED");
  assert.equal(result.admittedCount, 2);
});

test("stale ignored and missing mutation results are uncertain rather than directly retryable failures", async () => {
  const articleRefs = [
    { clientId: "client-a", articleId: "article-a" },
    { clientId: "client-b", articleId: "article-b" },
    { clientId: "client-c", articleId: "article-c" },
  ];
  const result = await admitBatchRegularSubmission(
    {
      articleRefs,
      platformId: "lieju",
      accountProfileId: "account-1",
    },
    {
      async admitRegularQueueItems(input) {
        const clientId = input.articleRefs[0].clientId;
        if (clientId === "client-a") return { status: "stale" };
        if (clientId === "client-b") return { ignored: true };
        return null;
      },
    },
  );

  assert.deepEqual(result.failedClientIds, []);
  assert.deepEqual(result.uncertainClientIds, [
    "client-a",
    "client-b",
    "client-c",
  ]);
  assert.equal(result.uncertain.length, 3);
});

test("admission-time missing or conflict is surfaced as invalidation instead of success", async () => {
  const result = await admitBatchRegularSubmission(
    {
      articleRefs: [{ clientId: "client-a", articleId: "article-a" }],
      platformId: "lieju",
      accountProfileId: "account-1",
    },
    {
      async admitRegularQueueItems() {
        return {
          admittedCount: 0,
          idempotentCount: 0,
          missingCount: 1,
          conflictCount: 0,
        };
      },
    },
  );

  assert.deepEqual(result.succeededClientIds, []);
  assert.deepEqual(result.invalidatedClientIds, ["client-a"]);
  assert.equal(result.invalidations.length, 1);
  assert.equal(result.missingCount, 1);
});

test("completed generation batch keeps direct bulk submission without renderer admission facts", () => {
  const detailSource = fs.readFileSync(
    path.join(
      testDir,
      "../media-workbench/src/components/content/GenerationBatchDetail.tsx",
    ),
    "utf8",
  );
  const dialogSource = fs.readFileSync(
    path.join(
      testDir,
      "../media-workbench/src/components/content/BatchRegularSubmissionDialog.tsx",
    ),
    "utf8",
  );
  const viewSource = fs.readFileSync(
    path.join(
      testDir,
      "../media-workbench/src/components/content/BatchGenerationView.tsx",
    ),
    "utf8",
  );

  assert.match(detailSource, /onBulkSubmit/);
  assert.match(detailSource, />批量投稿</);
  assert.doesNotMatch(detailSource, /auto-publish:batch-admitted:/);
  assert.doesNotMatch(dialogSource, /auto-publish:batch-admitted:/);
  assert.doesNotMatch(detailSource, /查看本批次文章/);
  assert.doesNotMatch(detailSource, /投稿请先进入文章库/);

  assert.match(viewSource, /BatchRegularSubmissionDialog/);
  assert.match(viewSource, /onBulkSubmit=/);
  assert.match(viewSource, /setBatchSubmissionOpen\(true\)/);
});

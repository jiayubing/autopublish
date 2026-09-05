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
        return {
          queueableCount: input.articleRefs.length,
          idempotentCount: 0,
          missingCount: 0,
          conflictCount: 0,
        };
      },
    },
  );

  assert.equal(preview.clientCount, 2);
  assert.equal(preview.articleCount, 3);
  assert.equal(preview.queueableCount, 3);
  assert.equal(previewCalls.length, 2);
  for (const call of previewCalls) {
    assert.equal(new Set(call.articleRefs.map((ref) => ref.clientId)).size, 1);
    assert.equal(call.platformId, "lieju");
    assert.equal(call.accountProfileId, "account-1");
  }

  const admitCalls = [];
  const admitted = await admitBatchRegularSubmission(
    {
      articleRefs: refs(),
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
  assert.equal(admitCalls.length, 2);
  for (const call of admitCalls) {
    assert.equal(new Set(call.articleRefs.map((ref) => ref.clientId)).size, 1);
    assert.equal(call.platformId, "lieju");
    assert.equal(call.accountProfileId, "account-1");
    assert.equal(call.autoStart, true);
  }
});

test("completed generation batch keeps direct bulk submission as its primary workflow", () => {
  const detailSource = fs.readFileSync(
    path.join(
      testDir,
      "../media-workbench/src/components/content/GenerationBatchDetail.tsx",
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
  assert.doesNotMatch(detailSource, /查看本批次文章/);
  assert.doesNotMatch(detailSource, /投稿请先进入文章库/);

  assert.match(viewSource, /BatchRegularSubmissionDialog/);
  assert.match(viewSource, /onBulkSubmit=\{\(\) => setBatchSubmissionOpen\(true\)\}/);
});

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createOperationalStore } = require("../src/infrastructure/operational-store/operational-store");

test("OperationalStore lists queued content batch items with their durable account binding", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-content-batch-store-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({ platformId: "toutiao", displayName: "fixture" });
    const created = store.createSubmissionBatch({
      batchId: "batch-content-1",
      items: [{
        articleId: "article-1",
        target: { kind: "platform", platformId: "toutiao", accountProfileId: profile.accountProfileId },
        payload: { sourcePlatformId: "toutiao", filename: "article-1.md", accountProfileId: profile.accountProfileId, clientId: "client-1" },
      }],
    });
    const batches = store.listSubmissionBatches({ clientId: "client-1" });
    assert.equal(batches.length, 1);
    assert.equal(batches[0].batchId, created.batchId);
    assert.equal(batches[0].items[0].payload.accountProfileId, profile.accountProfileId);
    assert.equal(batches[0].items[0].targetKey, `platform:toutiao:account:${profile.accountProfileId}`);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

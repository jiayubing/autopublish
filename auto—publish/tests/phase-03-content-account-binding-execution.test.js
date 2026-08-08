"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createPlatformWorkbenchService } = require("../desktop/services/platform-workbench-service");

test("main rejects a renderer account profile that differs from the durable queue binding", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-account-plan-"));
  try {
    const input = path.join(root, ".autopublish", "input", "toutiao");
    fs.mkdirSync(input, { recursive: true });
    fs.writeFileSync(path.join(input, "article.md"), "# Fixture\n\nBody\n", "utf8");
    fs.writeFileSync(path.join(input, "article.md.submission.json"), JSON.stringify({ submissionBatchId: "batch-1", clientId: "client-1", generatedArticleId: "article-1", targetPlatformId: "toutiao", accountProfileId: "account-durable", contentHash: "a".repeat(64), status: "queued" }), "utf8");
    const workbench = createPlatformWorkbenchService({ rootDir: root, paths: { input: path.join(root, ".autopublish", "input") }, platforms: [{ id: "toutiao", scanDir: "toutiao" }], adapters: { toutiao: {} } });
    assert.throws(() => workbench.buildSelectedPlan({
      selectedArticles: [{ sourcePlatformId: "toutiao", filename: "article.md" }],
      platformId: "toutiao",
      accountProfileId: "account-renderer",
    }), { code: "ACCOUNT_PROFILE_MISMATCH" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

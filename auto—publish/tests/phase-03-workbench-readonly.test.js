"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("platform workbench is a read-only queue and command-preparation boundary", function () {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "desktop", "services", "platform-workbench-service.js"),
    "utf8",
  );
  for (const prohibited of [
    "createPublicationLedger",
    "createSubmissionBatchStore",
    "submitSelectedPlanSerially",
    "archivePublishedArticle",
    "publication-ledger",
    "submission-batch-store",
  ]) {
    assert.equal(source.includes(prohibited), false, `${prohibited} must not remain in the production workbench`);
  }
});

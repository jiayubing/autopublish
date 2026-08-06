"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("workspace runtime does not construct or inject the retired JSON publication ledger", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "desktop", "workspace-runtime.js"),
    "utf8",
  );
  assert.doesNotMatch(source, /createPublicationLedger/);
  assert.doesNotMatch(source, /publicationLedger\s*[:,]/);
});

test("production attention IPC has no implicit legacy ledger factory", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "desktop", "ipc", "article-attention-ipc.js"),
    "utf8",
  );
  assert.doesNotMatch(source, /createPublicationLedger/);
});

test("attention is a derived query and has no persistent writer", () => {
  const query = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "desktop",
      "services",
      "article-attention-query.js",
    ),
    "utf8",
  );
  const resolver = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "desktop",
      "services",
      "article-attention-resolver.js",
    ),
    "utf8",
  );
  assert.match(query, /listPublicationAttention|listPostProcessingAttention/);
  assert.doesNotMatch(
    `${query}\n${resolver}`,
    /writeFileSync|appendFileSync|createAttention/,
  );
});

test("production content intake has no legacy ledger, JSON batch, or export-writer dependency", () => {
  const service = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "desktop",
      "services",
      "content-submission-service.js",
    ),
    "utf8",
  );
  const operational = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "desktop",
      "services",
      "operational-content-submission-service.js",
    ),
    "utf8",
  );
  const planner = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "desktop",
      "services",
      "submission-batch-planner.js",
    ),
    "utf8",
  );
  const persistence = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "desktop",
      "services",
      "submission-batch-persistence.js",
    ),
    "utf8",
  );
  const sources = `${service}\n${operational}\n${planner}\n${persistence}`;
  assert.doesNotMatch(
    sources,
    /createPublicationLedger|createSubmissionBatchStore|submission-export-service/,
  );
  assert.match(operational, /createSubmissionBatchPlanner/);
  assert.match(operational, /createSubmissionBatchPersistence/);
  assert.match(persistence, /operationalStore\.createSubmissionBatch/);
  assert.match(`${planner}\n${persistence}`, /accountProfileId/);
});

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const retired = [
  "desktop/services/content-submission-application.js",
  "desktop/services/content-submission-service.js",
  "desktop/services/operational-content-submission-service.js",
  "desktop/services/publication-submission-orchestrator.js",
  "desktop/composition/publication-workflow-composition.js",
  "desktop/composition/phase-01-composition.js",
  "src/application/publication-workflow.js",
  "src/application/publication-workflow/execution.js",
  "src/application/publication-workflow/recovery.js",
  "desktop/services/submission-batch-planner.js",
  "desktop/services/submission-batch-persistence.js",
  "desktop/services/submission-retry.js",
];

test("generic submission and publication execution surfaces are retired", () => {
  retired.forEach((relative) => {
    assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
  });
  assert.equal(
    fs.existsSync(
      path.join(root, "desktop/services/submission-maintenance-service.js"),
    ),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(root, "src/application/publication-recovery.js")),
    true,
  );
});

test("production composition wires named maintenance and recovery only", () => {
  const runtime = fs.readFileSync(
    path.join(root, "desktop/composition/workspace-runtime-composition.js"),
    "utf8",
  );
  assert.match(runtime, /submissionMaintenance/);
  assert.match(runtime, /publicationRecoveryComposition/);
  assert.doesNotMatch(runtime, /contentSubmissionService/);
  assert.doesNotMatch(runtime, /publicationWorkflow/);
  assert.doesNotMatch(runtime, /desktop-publisher-router/);
});

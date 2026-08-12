"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  parseArguments: parseProductionArguments,
} = require("../scripts/production-smoke-arguments");
const {
  APPLICATION_ROOT,
  parseOutputArgument,
  readContract,
  validateAllContracts,
  assertSafeGeneratedEvidence,
} = require("../scripts/ticket-25-a-contract");
const { runTicket25AContract } = require("../scripts/ticket-25-a-evidence");
const { writeEvidenceReport } = require("../scripts/production-smoke-evidence");

function temporaryRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ticket-25-a-contract-"));
}

test("Ticket 25-A tracked contracts cover 85 stories without claiming acceptance", () => {
  const summary = validateAllContracts();
  assert.equal(summary.story.storyCount, 85);
  assert.equal(summary.story.rowCount, 95);
  assert.equal(summary.story.deferredImageRows, 10);
  assert.ok(summary.state.caseCount >= 20);
  assert.ok(summary.state.coverageTags.includes("uncertain_unknown"));
  assert.equal(summary.budget.status, "FROZEN_BEFORE_RESULT");
  assert.equal(summary.budget.operationCount, 3);
  assert.equal(summary.evidence.generatedCount, 5);
  assert.equal(summary.evidence.moduleCount, 9);
  assert.equal(
    summary.evidence.moduleDisposition,
    "FACTS_FOR_INDEPENDENT_AUDIT",
  );
  assert.equal(summary.runner.entryPoints, 3);
  assert.equal(summary.userControl.status, "USER_EXTERNAL_ACCEPTANCE_REQUIRED");
  assert.equal(summary.userControl.entryCount, 2);

  const matrix = readContract("storyMatrix");
  assert.equal(
    matrix.rows.some((row) =>
      /^(PASS|PASSED|COMPLETE|ACCEPTED)$/i.test(row.status),
    ),
    false,
  );
  for (const storyId of matrix.deferredImageStoryIds) {
    const deferred = matrix.rows.find(
      (row) => row.storyId === storyId && row.portion === "image_extension",
    );
    const textOnly = matrix.rows.find(
      (row) => row.storyId === storyId && row.portion !== "image_extension",
    );
    assert.equal(deferred.status, "DEFERRED_IMAGE_EXTENSION");
    assert.equal(deferred.coverageDisposition, "DEFERRED_IMAGE_EXTENSION");
    assert.equal(textOnly.status === "DEFERRED_IMAGE_EXTENSION", false);
  }
});

test("Ticket 25-A freezes one state matrix and the required precedence rules", () => {
  const matrix = readContract("stateMatrix");
  assert.equal(matrix.precedenceRules.length, 4);
  assert.deepEqual(
    new Set(matrix.precedenceRules.map((rule) => rule.ruleId)),
    new Set([
      "publication-success-first-wins",
      "regular-manual-uncertain-first-wins",
      "paid-order-creation-credible-id",
      "cancel-vs-publish-publication-wins",
    ]),
  );
  assert.ok(
    matrix.cases.some((item) =>
      item.coverageTags.includes("delete_restore_active_target_race"),
    ),
  );
  assert.ok(
    matrix.cases.some((item) =>
      item.coverageTags.includes("late_observation_after_success"),
    ),
  );
  assert.match(matrix.uniqueness, /single finite state\/failure matrix/i);
});

test("Ticket 25-A query/scan budget is fixed before wall-clock results", () => {
  const budget = readContract("queryScanBudget");
  assert.equal(budget.status, "FROZEN_BEFORE_RESULT");
  assert.equal(budget.protocol.warmupRuns, 2);
  assert.equal(budget.protocol.measuredRuns, 7);
  assert.equal(budget.protocol.discardWarmup, true);
  assert.equal(budget.wallClockBaseline.status, "NOT_APPROVED");
  assert.equal(budget.wallClockBaseline.p50ThresholdMs, null);
  assert.equal(budget.wallClockBaseline.p95ThresholdMs, null);
  assert.ok(budget.operations.every((operation) => operation.maxQueries > 0));
  assert.ok(budget.operations.every((operation) => operation.maxScans > 0));
});

test("Ticket 25-A smoke output forwarding uses the final dedicated path and never the generic path", () => {
  const runner = readContract("runnerContract");
  const dirtyOutput = runner.productionSmoke.dirty.output;
  const cleanOutput = runner.productionSmoke.clean.output;
  const parsedDirty = parseProductionArguments([
    "release-production-smoke/win-unpacked/resources",
    "--output",
    "build/evidence/production-smoke.json",
    "--output",
    dirtyOutput,
  ]);
  const parsedClean = parseProductionArguments([
    "release-production-smoke/win-unpacked/resources",
    "--output",
    "build/evidence/production-smoke.json",
    "--output",
    cleanOutput,
  ]);
  assert.equal(
    path
      .relative(APPLICATION_ROOT, parsedDirty.options.output)
      .replaceAll("\\", "/"),
    dirtyOutput,
  );
  assert.equal(
    path
      .relative(APPLICATION_ROOT, parsedClean.options.output)
      .replaceAll("\\", "/"),
    cleanOutput,
  );
  assert.notEqual(dirtyOutput, cleanOutput);
  assert.notEqual(dirtyOutput, "build/evidence/production-smoke.json");
  assert.notEqual(cleanOutput, "build/evidence/production-smoke.json");
});

test("Ticket 25 evidence output parsers reject traversal outside build/evidence", () => {
  const traversal = "build/evidence/../../ticket-25-outside.json";
  assert.throws(() => parseOutputArgument(["--output", traversal]), {
    code: "TICKET_25_A_OUTPUT_PATH_INVALID",
  });
  assert.throws(
    () =>
      parseProductionArguments([
        "release-production-smoke/win-unpacked/resources",
        "--output",
        traversal,
      ]),
    { code: "PRODUCTION_PACKAGE_OUTPUT_PATH_INVALID" },
  );
});

test("Ticket 25-A generated contract and smoke reports contain safe provenance and isolated files", () => {
  const root = temporaryRoot();
  try {
    const contractOutput = path.join(
      root,
      "build",
      "evidence",
      "ticket-25-a-contract.json",
    );
    const contractReport = runTicket25AContract(contractOutput);
    assert.equal(contractReport.status, "PASSED");
    assert.equal(contractReport.environment.externalOperations, "none");
    assert.equal(contractReport.environment.credentials, "not-collected");
    assert.equal(contractReport.environment.sensitiveValues, "excluded");
    assertSafeGeneratedEvidence(
      JSON.parse(fs.readFileSync(contractOutput, "utf8")),
    );

    const dirtyOutput = path.join(
      root,
      "build",
      "evidence",
      "ticket-25-production-smoke-dirty.json",
    );
    const cleanOutput = path.join(
      root,
      "build",
      "evidence",
      "ticket-25-production-smoke-clean.json",
    );
    const result = {
      ok: true,
      packageVersion: "synthetic",
      workspaceSchemaVersion: 1,
      artifactCount: 1,
      offline: { syntheticFixture: { status: "PASSED" } },
    };
    const provenance = {
      root: APPLICATION_ROOT,
      command:
        "npm run pack:production:smoke:dirty -- --output build/evidence/ticket-25-production-smoke-dirty.json",
      startedAt: Date.now() - 1,
    };
    const dirty = writeEvidenceReport(dirtyOutput, result, provenance);
    const clean = writeEvidenceReport(cleanOutput, result, {
      ...provenance,
      command:
        "npm run pack:production:smoke -- --output build/evidence/ticket-25-production-smoke-clean.json",
    });
    assert.equal(dirty.status, "PASSED");
    assert.equal(clean.status, "PASSED");
    assert.equal(fs.existsSync(dirtyOutput), true);
    assert.equal(fs.existsSync(cleanOutput), true);
    assert.equal(
      fs.existsSync(
        path.join(root, "build", "evidence", "production-smoke.json"),
      ),
      false,
    );
    assert.equal(dirty.environment.externalOperations, "none");
    assert.equal(clean.environment.sensitiveValues, "excluded");
    assertSafeGeneratedEvidence(
      JSON.parse(fs.readFileSync(dirtyOutput, "utf8")),
    );
    assertSafeGeneratedEvidence(
      JSON.parse(fs.readFileSync(cleanOutput, "utf8")),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

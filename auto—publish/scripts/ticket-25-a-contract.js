"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createExecutionProvenance } = require("./release-evidence-inputs");
const { safeEnvironmentSummary } = require("./production-smoke-evidence");

const APPLICATION_ROOT = path.resolve(__dirname, "..");
const REPOSITORY_ROOT = path.resolve(APPLICATION_ROOT, "..");
const CONTRACT_ROOT = path.join(
  REPOSITORY_ROOT,
  ".scratch",
  "article-lifecycle-and-submission",
  "acceptance",
);
const CONTRACT_FILES = Object.freeze({
  storyMatrix: "25-a-story-matrix.json",
  stateMatrix: "25-a-state-matrix.json",
  queryScanBudget: "25-a-query-scan-budget.json",
  evidenceManifest: "25-a-evidence-manifest.json",
  runnerContract: "25-a-runner-contract.json",
  userControlChecklist: "25-a-user-control-checklist.json",
});
const IMAGE_STORY_IDS = new Set([6, 29, 78, 79, 80, 81, 82, 83, 84, 85]);
const ALLOWED_WORK_PACKAGES = new Set([
  "25-B",
  "25-C",
  "25-D",
  "25-E",
  "USER_CONTROLLED_EXTERNAL",
  "IMAGE_EXTENSION",
]);
const FORBIDDEN_EVIDENCE_KEY =
  /password|token|cookie|apikey|secret|authorization|requestheaders|responsebody|rawerror|credential|accesskey/i;

function contractError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function readJson(filename, code) {
  try {
    return JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (_) {
    throw contractError(code, "Ticket 25-A contract JSON is unavailable");
  }
}

function readContract(name) {
  const filename = CONTRACT_FILES[name];
  if (!filename) throw contractError("TICKET_25_A_CONTRACT_UNKNOWN");
  return readJson(
    path.join(CONTRACT_ROOT, filename),
    "TICKET_25_A_CONTRACT_INVALID",
  );
}

function assertObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw contractError(code);
}

function assertNonEmptyString(value, code) {
  if (typeof value !== "string" || value.trim() === "")
    throw contractError(code);
}

function assertInteger(value, code, minimum) {
  if (
    !Number.isSafeInteger(value) ||
    value < (minimum === undefined ? 0 : minimum)
  )
    throw contractError(code);
}

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/");
}

function validateReference(reference) {
  assertNonEmptyString(reference, "TICKET_25_A_STORY_REFERENCE_INVALID");
  const normalized = normalizePath(reference);
  if (
    normalized.startsWith("future:") ||
    normalized.startsWith("user-control:")
  )
    return;
  const sourcePath = normalized.split("#", 1)[0];
  if (
    sourcePath === "ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md" ||
    sourcePath === "CONTEXT.md"
  )
    return;
  if (
    sourcePath.startsWith("auto—publish/") &&
    fs.existsSync(path.join(REPOSITORY_ROOT, sourcePath))
  )
    return;
  throw contractError(
    "TICKET_25_A_STORY_REFERENCE_MISSING",
    "Story evidence reference is not a known public test or explicit evidence entry",
  );
}

function validateStoryMatrix(value) {
  assertObject(value, "TICKET_25_A_STORY_MATRIX_INVALID");
  if (value.schemaVersion !== "ticket-25-a-story-matrix-v1")
    throw contractError("TICKET_25_A_STORY_MATRIX_VERSION_INVALID");
  assertInteger(value.storyCount, "TICKET_25_A_STORY_COUNT_INVALID", 1);
  assertInteger(value.rowCount, "TICKET_25_A_STORY_ROW_COUNT_INVALID", 1);
  if (value.storyCount !== 85 || value.rowCount !== 95)
    throw contractError("TICKET_25_A_STORY_MATRIX_SIZE_INVALID");
  if (!Array.isArray(value.rows) || value.rows.length !== value.rowCount)
    throw contractError("TICKET_25_A_STORY_ROWS_INVALID");
  const ids = new Set(value.rows.map((row) => row && row.storyId));
  for (let storyId = 1; storyId <= 85; storyId += 1)
    if (!ids.has(storyId)) throw contractError("TICKET_25_A_STORY_ID_MISSING");
  const deferredIds = new Set(value.deferredImageStoryIds || []);
  if (
    deferredIds.size !== IMAGE_STORY_IDS.size ||
    [...IMAGE_STORY_IDS].some((storyId) => !deferredIds.has(storyId))
  )
    throw contractError("TICKET_25_A_IMAGE_DEFERRED_SET_INVALID");

  const rowsByStory = new Map();
  value.rows.forEach((row) => {
    assertObject(row, "TICKET_25_A_STORY_ROW_INVALID");
    assertInteger(row.storyId, "TICKET_25_A_STORY_ID_INVALID", 1);
    if (row.storyId > 85 || !ALLOWED_WORK_PACKAGES.has(row.workPackage))
      throw contractError("TICKET_25_A_STORY_WORK_PACKAGE_INVALID");
    assertNonEmptyString(row.portion, "TICKET_25_A_STORY_PORTION_INVALID");
    assertNonEmptyString(
      row.publicBehavior,
      "TICKET_25_A_STORY_BEHAVIOR_INVALID",
    );
    assertNonEmptyString(
      row.evidenceCategory,
      "TICKET_25_A_STORY_EVIDENCE_CATEGORY_INVALID",
    );
    if (!value.evidenceCategoryVocabulary.includes(row.evidenceCategory))
      throw contractError("TICKET_25_A_STORY_EVIDENCE_CATEGORY_UNKNOWN");
    if (
      !Array.isArray(row.evidenceTestRefs) ||
      row.evidenceTestRefs.length === 0
    )
      throw contractError("TICKET_25_A_STORY_EVIDENCE_REFERENCE_INVALID");
    row.evidenceTestRefs.forEach(validateReference);
    assertNonEmptyString(
      row.coverageDisposition,
      "TICKET_25_A_STORY_DISPOSITION_INVALID",
    );
    if (!value.coverageDispositionVocabulary.includes(row.coverageDisposition))
      throw contractError("TICKET_25_A_STORY_DISPOSITION_UNKNOWN");
    assertNonEmptyString(row.status, "TICKET_25_A_STORY_STATUS_INVALID");
    if (!value.statusVocabulary.includes(row.status))
      throw contractError("TICKET_25_A_STORY_STATUS_UNKNOWN");
    if (/^(PASS|PASSED|COMPLETE|ACCEPTED)$/i.test(row.status))
      throw contractError("TICKET_25_A_STORY_FALSE_PASS");
    const rows = rowsByStory.get(row.storyId) || [];
    rows.push(row);
    rowsByStory.set(row.storyId, rows);
    const deferred = row.portion === "image_extension";
    if (deferred) {
      if (
        !IMAGE_STORY_IDS.has(row.storyId) ||
        row.workPackage !== "IMAGE_EXTENSION" ||
        row.evidenceCategory !== "deferred" ||
        row.coverageDisposition !== "DEFERRED_IMAGE_EXTENSION" ||
        row.status !== "DEFERRED_IMAGE_EXTENSION" ||
        typeof row.deferredReason !== "string" ||
        row.deferredReason.trim() === ""
      )
        throw contractError("TICKET_25_A_IMAGE_PORTION_INVALID");
    } else {
      if (
        row.workPackage === "IMAGE_EXTENSION" ||
        row.evidenceCategory === "deferred"
      )
        throw contractError("TICKET_25_A_TEXT_PORTION_DEFERRED_INVALID");
      if (row.deferredReason !== null)
        throw contractError("TICKET_25_A_TEXT_PORTION_DEFERRED_REASON_INVALID");
      if (
        row.workPackage !== "USER_CONTROLLED_EXTERNAL" &&
        !["25-B", "25-C", "25-D", "25-E"].includes(row.workPackage)
      )
        throw contractError("TICKET_25_A_TEXT_PORTION_UNMAPPED");
      if (
        row.workPackage === "USER_CONTROLLED_EXTERNAL" &&
        row.coverageDisposition !== "USER_CONTROLLED_EVIDENCE"
      )
        throw contractError("TICKET_25_A_USER_CONTROL_DISPOSITION_INVALID");
    }
  });
  IMAGE_STORY_IDS.forEach((storyId) => {
    const rows = rowsByStory.get(storyId) || [];
    if (
      rows.filter((row) => row.portion === "image_extension").length !== 1 ||
      rows.filter((row) => row.portion !== "image_extension").length !== 1
    )
      throw contractError("TICKET_25_A_IMAGE_TEXT_PORTIONS_NOT_SEPARATE");
  });
  return {
    status: "DEFINED_NOT_ACCEPTANCE_RESULT",
    storyCount: value.storyCount,
    rowCount: value.rows.length,
    deferredImageRows: value.rows.filter(
      (row) => row.portion === "image_extension",
    ).length,
  };
}

function validateStateMatrix(value) {
  assertObject(value, "TICKET_25_A_STATE_MATRIX_INVALID");
  if (value.schemaVersion !== "ticket-25-a-state-matrix-v1")
    throw contractError("TICKET_25_A_STATE_MATRIX_VERSION_INVALID");
  if (!Array.isArray(value.cases) || value.cases.length < 20)
    throw contractError("TICKET_25_A_STATE_CASES_INVALID");
  const caseIds = new Set();
  const tags = new Set();
  value.cases.forEach((item) => {
    assertObject(item, "TICKET_25_A_STATE_CASE_INVALID");
    assertNonEmptyString(item.caseId, "TICKET_25_A_STATE_CASE_ID_INVALID");
    if (caseIds.has(item.caseId))
      throw contractError("TICKET_25_A_STATE_CASE_DUPLICATE");
    caseIds.add(item.caseId);
    if (!Array.isArray(item.coverageTags) || item.coverageTags.length === 0)
      throw contractError("TICKET_25_A_STATE_TAGS_INVALID");
    item.coverageTags.forEach((tag) => tags.add(tag));
    assertNonEmptyString(
      item.precondition,
      "TICKET_25_A_STATE_PRECONDITION_INVALID",
    );
    if (!Array.isArray(item.eventSequence) || item.eventSequence.length < 2)
      throw contractError("TICKET_25_A_STATE_EVENT_SEQUENCE_INVALID");
    assertNonEmptyString(
      item.expectedState,
      "TICKET_25_A_STATE_EXPECTED_STATE_INVALID",
    );
    if (!value.stateVocabulary.includes(item.expectedState))
      throw contractError("TICKET_25_A_STATE_EXPECTED_STATE_UNKNOWN");
    assertNonEmptyString(
      item.expectedPublicOutcome,
      "TICKET_25_A_STATE_PUBLIC_OUTCOME_INVALID",
    );
    assertNonEmptyString(
      item.terminalWinner,
      "TICKET_25_A_STATE_TERMINAL_WINNER_INVALID",
    );
    assertNonEmptyString(
      item.retryPolicy,
      "TICKET_25_A_STATE_RETRY_POLICY_INVALID",
    );
    if (!Array.isArray(item.ownerOrdering) || item.ownerOrdering.length < 2)
      throw contractError("TICKET_25_A_STATE_OWNER_ORDER_INVALID");
  });
  (value.requiredCoverageTags || []).forEach((tag) => {
    if (!tags.has(tag))
      throw contractError("TICKET_25_A_STATE_REQUIRED_TAG_MISSING");
  });
  const precedenceIds = new Set(
    (value.precedenceRules || []).map((rule) => rule.ruleId),
  );
  for (const ruleId of [
    "publication-success-first-wins",
    "regular-manual-uncertain-first-wins",
    "paid-order-creation-credible-id",
    "cancel-vs-publish-publication-wins",
  ])
    if (!precedenceIds.has(ruleId))
      throw contractError("TICKET_25_A_PRECEDENCE_RULE_MISSING");
  return {
    status: "DEFINED_NOT_ACCEPTANCE_RESULT",
    caseCount: value.cases.length,
    coverageTags: [...tags].sort(),
  };
}

function validateQueryScanBudget(value) {
  assertObject(value, "TICKET_25_A_BUDGET_INVALID");
  if (value.schemaVersion !== "ticket-25-a-query-scan-budget-v1")
    throw contractError("TICKET_25_A_BUDGET_VERSION_INVALID");
  if (value.status !== "FROZEN_BEFORE_RESULT")
    throw contractError("TICKET_25_A_BUDGET_NOT_FROZEN");
  assertObject(value.syntheticFixture, "TICKET_25_A_BUDGET_FIXTURE_INVALID");
  for (const field of [
    "clients",
    "articles",
    "regularQueueGroups",
    "regularQueueItems",
    "paidOrders",
  ])
    assertInteger(
      value.syntheticFixture[field],
      "TICKET_25_A_BUDGET_SCALE_INVALID",
      1,
    );
  assertObject(value.protocol, "TICKET_25_A_BUDGET_PROTOCOL_INVALID");
  assertInteger(
    value.protocol.warmupRuns,
    "TICKET_25_A_BUDGET_WARMUP_INVALID",
    0,
  );
  assertInteger(
    value.protocol.measuredRuns,
    "TICKET_25_A_BUDGET_MEASURED_INVALID",
    1,
  );
  if (value.protocol.discardWarmup !== true)
    throw contractError("TICKET_25_A_BUDGET_WARMUP_DISCARD_INVALID");
  if (!Array.isArray(value.operations) || value.operations.length < 3)
    throw contractError("TICKET_25_A_BUDGET_OPERATIONS_INVALID");
  const operationIds = new Set();
  value.operations.forEach((operation) => {
    assertObject(operation, "TICKET_25_A_BUDGET_OPERATION_INVALID");
    assertNonEmptyString(
      operation.operationId,
      "TICKET_25_A_BUDGET_OPERATION_ID_INVALID",
    );
    if (operationIds.has(operation.operationId))
      throw contractError("TICKET_25_A_BUDGET_OPERATION_DUPLICATE");
    operationIds.add(operation.operationId);
    assertInteger(
      operation.maxQueries,
      "TICKET_25_A_BUDGET_QUERY_LIMIT_INVALID",
      1,
    );
    assertInteger(
      operation.maxScans,
      "TICKET_25_A_BUDGET_SCAN_LIMIT_INVALID",
      1,
    );
    assertInteger(
      operation.maxExternalTransportCalls,
      "TICKET_25_A_BUDGET_TRANSPORT_LIMIT_INVALID",
      0,
    );
    assertNonEmptyString(
      operation.hardRule,
      "TICKET_25_A_BUDGET_HARD_RULE_INVALID",
    );
  });
  if (
    value.wallClockBaseline?.status !== "NOT_APPROVED" ||
    value.wallClockBaseline?.p50ThresholdMs !== null ||
    value.wallClockBaseline?.p95ThresholdMs !== null ||
    value.wallClockBaseline?.decision !== "OBSERVATION_ONLY"
  )
    throw contractError("TICKET_25_A_WALL_CLOCK_THRESHOLD_INVALID");
  return {
    status: "FROZEN_BEFORE_RESULT",
    operationCount: value.operations.length,
    measuredRuns: value.protocol.measuredRuns,
  };
}

function assertRelativeEvidencePath(value) {
  assertNonEmptyString(value, "TICKET_25_A_EVIDENCE_PATH_INVALID");
  const normalized = normalizePath(value);
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").includes("..")
  )
    throw contractError("TICKET_25_A_EVIDENCE_PATH_UNSAFE");
}

function validateEvidenceManifest(value) {
  assertObject(value, "TICKET_25_A_EVIDENCE_MANIFEST_INVALID");
  if (value.schemaVersion !== "ticket-25-a-evidence-manifest-v1")
    throw contractError("TICKET_25_A_EVIDENCE_MANIFEST_VERSION_INVALID");
  if (
    !Array.isArray(value.trackedArtifacts) ||
    value.trackedArtifacts.length < 8
  )
    throw contractError("TICKET_25_A_TRACKED_EVIDENCE_INCOMPLETE");
  if (
    !Array.isArray(value.generatedArtifacts) ||
    value.generatedArtifacts.length !== 4
  )
    throw contractError("TICKET_25_A_GENERATED_EVIDENCE_INCOMPLETE");
  const paths = new Set();
  [...value.trackedArtifacts, ...value.generatedArtifacts].forEach(
    (artifact) => {
      assertObject(artifact, "TICKET_25_A_EVIDENCE_ARTIFACT_INVALID");
      assertNonEmptyString(
        artifact.artifactId,
        "TICKET_25_A_EVIDENCE_ARTIFACT_ID_INVALID",
      );
      assertRelativeEvidencePath(artifact.path);
      if (paths.has(artifact.path))
        throw contractError("TICKET_25_A_EVIDENCE_PATH_DUPLICATE");
      paths.add(artifact.path);
      assertNonEmptyString(
        artifact.kind,
        "TICKET_25_A_EVIDENCE_ARTIFACT_KIND_INVALID",
      );
      assertNonEmptyString(
        artifact.purpose || artifact.statusMeaning,
        "TICKET_25_A_EVIDENCE_ARTIFACT_PURPOSE_INVALID",
      );
    },
  );
  const generatedPaths = new Set(
    value.generatedArtifacts.map((artifact) => artifact.path),
  );
  for (const pathValue of [
    "build/evidence/ticket-25-a-contract.json",
    "build/evidence/ticket-25-a-benchmark.json",
    "build/evidence/ticket-25-production-smoke-dirty.json",
    "build/evidence/ticket-25-production-smoke-clean.json",
  ])
    if (!generatedPaths.has(pathValue))
      throw contractError("TICKET_25_A_GENERATED_OUTPUT_MISSING");
  if (generatedPaths.has("build/evidence/production-smoke.json"))
    throw contractError("TICKET_25_A_GENERIC_OUTPUT_REUSED");
  const requiredFields = new Set(value.generatedEvidenceRequiredFields || []);
  for (const field of [
    "commit",
    "sourceState",
    "nodeVersion",
    "command",
    "startedAt",
    "finishedAt",
    "environment",
  ])
    if (!requiredFields.has(field))
      throw contractError("TICKET_25_A_PROVENANCE_FIELD_MISSING");
  return {
    status: "DEFINED_NOT_ACCEPTANCE_RESULT",
    trackedCount: value.trackedArtifacts.length,
    generatedCount: value.generatedArtifacts.length,
  };
}

function validateRunnerContract(value) {
  assertObject(value, "TICKET_25_A_RUNNER_CONTRACT_INVALID");
  if (value.schemaVersion !== "ticket-25-a-runner-contract-v1")
    throw contractError("TICKET_25_A_RUNNER_CONTRACT_VERSION_INVALID");
  if (!Array.isArray(value.entryPoints) || value.entryPoints.length !== 2)
    throw contractError("TICKET_25_A_ENTRY_POINTS_INVALID");
  const entryIds = new Set(value.entryPoints.map((entry) => entry.entryId));
  if (!entryIds.has("contract-test") || !entryIds.has("benchmark"))
    throw contractError("TICKET_25_A_ENTRY_POINT_MISSING");
  const dirty = value.productionSmoke && value.productionSmoke.dirty;
  const clean = value.productionSmoke && value.productionSmoke.clean;
  [dirty, clean].forEach((smoke) => {
    assertObject(smoke, "TICKET_25_A_SMOKE_CONTRACT_INVALID");
    assertNonEmptyString(smoke.command, "TICKET_25_A_SMOKE_COMMAND_INVALID");
    assertNonEmptyString(smoke.output, "TICKET_25_A_SMOKE_OUTPUT_INVALID");
    assertRelativeEvidencePath(smoke.output);
    if (!smoke.command.includes(" -- --output " + smoke.output))
      throw contractError("TICKET_25_A_SMOKE_OUTPUT_FORWARDING_INVALID");
  });
  if (dirty.output === clean.output)
    throw contractError("TICKET_25_A_DIRTY_CLEAN_OUTPUT_OVERLAP");
  if (
    dirty.output === "build/evidence/production-smoke.json" ||
    clean.output === "build/evidence/production-smoke.json"
  )
    throw contractError("TICKET_25_A_GENERIC_SMOKE_OUTPUT_INVALID");
  const required = new Set(value.provenance?.requiredFields || []);
  for (const field of [
    "commit",
    "sourceState",
    "nodeVersion",
    "command",
    "startedAt",
    "finishedAt",
    "environment",
  ])
    if (!required.has(field))
      throw contractError("TICKET_25_A_RUNNER_PROVENANCE_INVALID");
  if (
    value.outputIsolation?.distinctDirtyClean !== true ||
    value.outputIsolation?.noPathTraversal !== true
  )
    throw contractError("TICKET_25_A_OUTPUT_ISOLATION_INVALID");
  return {
    status: "DEFINED_NOT_ACCEPTANCE_RESULT",
    entryPoints: value.entryPoints.length,
    smokeOutputs: [dirty.output, clean.output],
  };
}

function validateUserControlChecklist(value) {
  assertObject(value, "TICKET_25_A_USER_CONTROL_CHECKLIST_INVALID");
  if (value.schemaVersion !== "ticket-25-a-user-control-checklist-v1")
    throw contractError("TICKET_25_A_USER_CONTROL_CHECKLIST_VERSION_INVALID");
  if (value.status !== "USER_EXTERNAL_ACCEPTANCE_REQUIRED")
    throw contractError("TICKET_25_A_USER_CONTROL_STATUS_INVALID");
  if (!Array.isArray(value.entries) || value.entries.length !== 2)
    throw contractError("TICKET_25_A_USER_CONTROL_ENTRIES_INVALID");
  const ids = new Set();
  const storyIds = new Set();
  value.entries.forEach((entry) => {
    assertObject(entry, "TICKET_25_A_USER_CONTROL_ENTRY_INVALID");
    assertNonEmptyString(
      entry.evidenceId,
      "TICKET_25_A_USER_CONTROL_ID_INVALID",
    );
    if (ids.has(entry.evidenceId))
      throw contractError("TICKET_25_A_USER_CONTROL_ID_DUPLICATE");
    ids.add(entry.evidenceId);
    if (
      entry.evidenceCategory !== "user_controlled" ||
      entry.status !== "USER_EXTERNAL_ACCEPTANCE_REQUIRED"
    )
      throw contractError("TICKET_25_A_USER_CONTROL_ENTRY_STATUS_INVALID");
    if (!Array.isArray(entry.stories) || entry.stories.length === 0)
      throw contractError("TICKET_25_A_USER_CONTROL_STORIES_INVALID");
    entry.stories.forEach((storyId) => storyIds.add(storyId));
    for (const field of [
      "requiredAuthorization",
      "riskSummary",
      "prerequisites",
      "recordFields",
      "stopConditions",
    ]) {
      if (Array.isArray(entry[field])) {
        if (entry[field].length === 0)
          throw contractError("TICKET_25_A_USER_CONTROL_FIELD_EMPTY");
      } else
        assertNonEmptyString(
          entry[field],
          "TICKET_25_A_USER_CONTROL_FIELD_INVALID",
        );
    }
  });
  if (
    value.automationBoundary?.syntheticOnlyIn25A !== true ||
    value.automationBoundary?.missingEvidenceCode !==
      "USER_EXTERNAL_ACCEPTANCE_REQUIRED"
  )
    throw contractError("TICKET_25_A_USER_CONTROL_BOUNDARY_INVALID");
  if (!storyIds.has(25) || !storyIds.has(64))
    throw contractError("TICKET_25_A_USER_CONTROL_STORY_MAPPING_INVALID");
  return {
    status: "USER_EXTERNAL_ACCEPTANCE_REQUIRED",
    entryCount: value.entries.length,
  };
}

function validateAllContracts() {
  const story = validateStoryMatrix(readContract("storyMatrix"));
  const state = validateStateMatrix(readContract("stateMatrix"));
  const budget = validateQueryScanBudget(readContract("queryScanBudget"));
  const evidenceValue = readContract("evidenceManifest");
  const runnerValue = readContract("runnerContract");
  const evidence = validateEvidenceManifest(evidenceValue);
  const runner = validateRunnerContract(runnerValue);
  const userControl = validateUserControlChecklist(
    readContract("userControlChecklist"),
  );
  const generatedByPath = new Map(
    evidenceValue.generatedArtifacts.map((artifact) => [
      artifact.path,
      artifact,
    ]),
  );
  runnerValue.entryPoints.forEach((entry) => {
    const artifact = generatedByPath.get(entry.output);
    if (!artifact || artifact.command !== entry.command)
      throw contractError("TICKET_25_A_RUNNER_MANIFEST_MISMATCH");
  });
  for (const smoke of [
    runnerValue.productionSmoke.dirty,
    runnerValue.productionSmoke.clean,
  ]) {
    const artifact = generatedByPath.get(smoke.output);
    if (!artifact || artifact.command !== smoke.command)
      throw contractError("TICKET_25_A_SMOKE_MANIFEST_MISMATCH");
  }
  return { story, state, budget, evidence, runner, userControl };
}

function parseOutputArgument(args, defaultOutput) {
  const values = Array.from(args || []);
  let output = defaultOutput;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== "--output")
      throw contractError("TICKET_25_A_ARGUMENT_INVALID");
    const candidate = values[index + 1];
    if (!candidate || candidate.startsWith("--"))
      throw contractError("TICKET_25_A_OUTPUT_ARGUMENT_INVALID");
    output = path.resolve(candidate);
    index += 1;
  }
  if (!output) throw contractError("TICKET_25_A_OUTPUT_REQUIRED");
  return output;
}

function relativeForCommand(filename) {
  const relative = path
    .relative(APPLICATION_ROOT, filename)
    .replaceAll("\\", "/");
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    return "<external-output>";
  return relative;
}

function contractCommand(output) {
  return "npm run test:ticket-25-a -- --output " + relativeForCommand(output);
}

function assertSafeGeneratedEvidence(value) {
  assertObject(value, "TICKET_25_A_GENERATED_EVIDENCE_INVALID");
  const walk = (current, parentKey) => {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current))
      return current.forEach((item) => walk(item, parentKey));
    Object.entries(current).forEach(([key, item]) => {
      const safeEnvironmentField =
        parentKey === "environment" &&
        ["credentials", "externalOperations", "sensitiveValues"].includes(key);
      if (FORBIDDEN_EVIDENCE_KEY.test(key) && !safeEnvironmentField)
        throw contractError("TICKET_25_A_SENSITIVE_EVIDENCE_FIELD");
      walk(item, key);
    });
  };
  walk(value, null);
  if (!/^[a-f0-9]{40,64}$/i.test(value.commit || ""))
    throw contractError("TICKET_25_A_GENERATED_COMMIT_INVALID");
  if (
    !value.sourceState ||
    !["CLEAN", "DIRTY"].includes(value.sourceState.status)
  )
    throw contractError("TICKET_25_A_GENERATED_SOURCE_STATE_INVALID");
  if (!/^[a-f0-9]{64}$/i.test(value.sourceState.diffSha256 || ""))
    throw contractError("TICKET_25_A_GENERATED_SOURCE_DIGEST_INVALID");
  if (!/^v\d+\.\d+\.\d+$/.test(value.nodeVersion || ""))
    throw contractError("TICKET_25_A_GENERATED_NODE_VERSION_INVALID");
  assertNonEmptyString(value.command, "TICKET_25_A_GENERATED_COMMAND_INVALID");
  for (const field of ["startedAt", "finishedAt"])
    if (!/^\d{4}-\d{2}-\d{2}T/.test(value[field] || ""))
      throw contractError("TICKET_25_A_GENERATED_TIME_INVALID");
  assertObject(value.environment, "TICKET_25_A_GENERATED_ENVIRONMENT_INVALID");
  if (
    value.environment.externalOperations !== "none" ||
    value.environment.credentials !== "not-collected" ||
    value.environment.sensitiveValues !== "excluded"
  )
    throw contractError("TICKET_25_A_GENERATED_ENVIRONMENT_UNSAFE");
  return true;
}

function writeContractEvidence(output, result, startedAt) {
  const filename = path.resolve(output);
  const finishedAt = Date.now();
  const provenance = createExecutionProvenance({
    root: APPLICATION_ROOT,
    command: contractCommand(filename),
    startedAt,
    finishedAt,
  });
  const report = {
    status: result.status,
    operation: "ticket-25-a-contract-validation",
    ...provenance,
    environment: safeEnvironmentSummary(),
    result: result.summary || null,
    failureCode: result.failureCode || null,
  };
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(report, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  assertSafeGeneratedEvidence(report);
  return report;
}

module.exports = {
  APPLICATION_ROOT,
  REPOSITORY_ROOT,
  CONTRACT_ROOT,
  CONTRACT_FILES,
  contractError,
  readContract,
  validateStoryMatrix,
  validateStateMatrix,
  validateQueryScanBudget,
  validateEvidenceManifest,
  validateRunnerContract,
  validateAllContracts,
  parseOutputArgument,
  assertSafeGeneratedEvidence,
  writeContractEvidence,
  contractCommand,
  safeEnvironmentSummary,
};

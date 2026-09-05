"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { safeEnvironmentSummary } = require("./production-smoke-evidence");

const APPLICATION_ROOT = path.resolve(__dirname, "..");
const CONTRACT_ROOT = path.join(
  APPLICATION_ROOT,
  "..",
  ".scratch",
  "article-lifecycle-and-submission",
  "acceptance",
);
const CONTRACT_FILES = Object.freeze({
  queryScanBudget: "25-a-query-scan-budget.json",
});
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

function parseOutputArgument(args, defaultOutput) {
  const values = Array.from(args || []);
  let output = defaultOutput;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== "--output")
      throw contractError("TICKET_25_A_ARGUMENT_INVALID");
    const candidate = values[index + 1];
    if (!candidate || candidate.startsWith("--"))
      throw contractError("TICKET_25_A_OUTPUT_ARGUMENT_INVALID");
    output = resolveEvidenceOutput(candidate);
    index += 1;
  }
  if (!output) throw contractError("TICKET_25_A_OUTPUT_REQUIRED");
  return resolveEvidenceOutput(output);
}

function resolveEvidenceOutput(candidate) {
  const evidenceRoot = path.resolve(APPLICATION_ROOT, "build", "evidence");
  const output = path.resolve(candidate);
  const relative = path.relative(evidenceRoot, output);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative)
  )
    throw contractError("TICKET_25_A_OUTPUT_PATH_INVALID");
  return output;
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

module.exports = {
  APPLICATION_ROOT,
  contractError,
  parseOutputArgument,
  readContract,
  validateQueryScanBudget,
  assertSafeGeneratedEvidence,
  safeEnvironmentSummary,
};

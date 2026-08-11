const path = require("node:path");
const { IntegrityRunner } = require("../src/health/integrity-runner");
const { safeMetadata } = require("../src/health/health-diagnostic-mapper");

function numberOption(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) {
    const error = new Error("invalid integrity option");
    error.code = "AUTH_HEALTH_CHECK_INPUT_INVALID";
    error.option = name;
    throw error;
  }
  return number;
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const result = {
    filePath:
      args.shift() ||
      process.env.AUTH_DB_PATH ||
      path.join(process.cwd(), "data", "auth.db"),
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === "--timeout-ms") {
      result.timeoutMs = numberOption(value, flag);
      index += 1;
      continue;
    }
    if (flag === "--audit-retention-days") {
      result.auditRetentionDays = numberOption(value, flag);
      index += 1;
      continue;
    }
    if (flag === "--audit-rotation-bytes") {
      result.auditRotationBytes = numberOption(value, flag);
      index += 1;
      continue;
    }
    if (flag === "--database-warn-bytes") {
      result.databaseWarnBytes = numberOption(value, flag);
      index += 1;
      continue;
    }
    if (flag === "--database-max-bytes") {
      result.databaseMaxBytes = numberOption(value, flag);
      index += 1;
      continue;
    }
    const error = new Error("unknown integrity option");
    error.code = "AUTH_HEALTH_CHECK_INPUT_INVALID";
    throw error;
  }
  return result;
}

function policyFromArgs(args) {
  return {
    auditRetentionDays: args.auditRetentionDays,
    auditRotationBytes: args.auditRotationBytes,
    databaseWarnBytes: args.databaseWarnBytes,
    databaseMaxBytes: args.databaseMaxBytes,
  };
}

function safeOutput(outcome) {
  return {
    ok: outcome.ok === true,
    status: outcome.status,
    code: outcome.code,
    category: outcome.category,
    retryable: outcome.retryable === true,
    time: outcome.time,
    metadata: safeMetadata(outcome.metadata),
  };
}

async function main(argv, io) {
  const output = (io && io.output) || process.stdout;
  const args = parseArgs(argv);
  const runner =
    (io && io.runner) ||
    new IntegrityRunner({
      databasePath: args.filePath,
      defaultTimeoutMs: args.timeoutMs,
      policy: policyFromArgs(args),
    });
  const outcome = await runner.run({
    timeoutMs: args.timeoutMs,
    signal: io && io.signal,
    policy: policyFromArgs(args),
  });
  output.write(`${JSON.stringify(safeOutput(outcome))}\n`);
  return outcome;
}

if (require.main === module) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  main(process.argv.slice(2), { signal: controller.signal })
    .then((outcome) => {
      if (!outcome.ok) process.exitCode = 1;
      else if (outcome.status === "attention") process.exitCode = 2;
    })
    .catch((error) => {
      const code =
        error &&
        typeof error.code === "string" &&
        /^AUTH_[A-Z0-9_]{1,72}$/.test(error.code)
          ? error.code
          : "AUTH_HEALTH_CHECK_INPUT_INVALID";
      process.stderr.write(`${code}: integrity check failed\n`);
      process.exitCode = 1;
    })
    .finally(() => process.off("SIGINT", cancel));
}

module.exports = { main, parseArgs, safeOutput };

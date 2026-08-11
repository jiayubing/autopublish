"use strict";

const { spawnSync } = require("node:child_process");
const {
  APPLICATION_ROOT,
  contractError,
  parseOutputArgument,
  validateAllContracts,
  writeContractEvidence,
} = require("./ticket-25-a-contract");

function runTicket25AContract(output, options) {
  const startedAt = Date.now();
  const opts = options || {};
  let result;
  try {
    const summary = validateAllContracts();
    let testStatus = "NOT_RUN";
    if (opts.runTests === true) {
      const testRun = spawnSync(
        process.execPath,
        ["--test", "tests/ticket-25-a-contract.test.js"],
        {
          cwd: APPLICATION_ROOT,
          encoding: "utf8",
          windowsHide: true,
        },
      );
      testStatus = testRun.status === 0 ? "PASSED" : "FAILED";
      if (testStatus !== "PASSED")
        throw contractError("TICKET_25_A_CONTRACT_TEST_FAILED");
    }
    result = {
      status: "PASSED",
      summary: { ...summary, testStatus },
      failureCode: null,
    };
  } catch (error) {
    result = {
      status: "FAILED",
      summary: null,
      failureCode:
        error && typeof error.code === "string"
          ? error.code
          : "TICKET_25_A_CONTRACT_FAILED",
    };
  }
  const report = writeContractEvidence(output, result, startedAt);
  if (report.status !== "PASSED")
    throw contractError(report.failureCode || "TICKET_25_A_CONTRACT_FAILED");
  return report;
}

if (require.main === module) {
  try {
    const output = parseOutputArgument(process.argv.slice(2));
    process.stdout.write(
      JSON.stringify(runTicket25AContract(output, { runTests: true })) + "\n",
    );
  } catch (error) {
    const code =
      error && typeof error.code === "string"
        ? error.code
        : "TICKET_25_A_CONTRACT_FAILED";
    process.stderr.write(code + "\n");
    process.exitCode = 1;
  }
}

module.exports = { runTicket25AContract };

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  collectInventory,
  createInventorySnapshot,
  reconcileInventory,
} = require("./test-inventory");

const ROOT = path.resolve(__dirname, "..");

function evidenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseArguments(argv) {
  const args = Array.from(argv || []);
  const options = {};
  while (args.length) {
    const arg = args.shift();
    if (arg === "--before" || arg === "--output") {
      const value = args.shift();
      if (!value || value.startsWith("--"))
        throw evidenceError(
          "TEST_INVENTORY_ARGUMENT_INVALID",
          arg + " requires a path",
        );
      options[arg.slice(2)] = path.resolve(value);
    } else {
      throw evidenceError("TEST_INVENTORY_ARGUMENT_INVALID", "unknown option");
    }
  }
  if (!options.before)
    throw evidenceError(
      "TEST_INVENTORY_ARGUMENT_INVALID",
      "--before is required",
    );
  return options;
}

function readBeforeSnapshot(filename) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch {
    throw evidenceError(
      "TEST_INVENTORY_BEFORE_INVALID",
      "before inventory evidence could not be read",
    );
  }
  if (!value || !Array.isArray(value.files) || !value.discovery)
    throw evidenceError(
      "TEST_INVENTORY_BEFORE_INVALID",
      "before inventory evidence is incomplete",
    );
  return value;
}

function createTestInventoryEvidence(options) {
  const opts = options || {};
  if (!opts.before)
    throw evidenceError(
      "TEST_INVENTORY_ARGUMENT_INVALID",
      "--before is required",
    );
  const before = readBeforeSnapshot(opts.before);
  const after = collectInventory();
  const reconciliation = reconcileInventory(before, after);
  const report = {
    status: reconciliation.status,
    operation: "m05-h-test-inventory-reconciliation",
    before: {
      source: path.basename(opts.before),
      inventory: before,
    },
    after: createInventorySnapshot(after),
    reconciliation,
  };
  const output = path.resolve(
    opts.output || path.join(ROOT, "build", "evidence", "m05-h-inventory.json"),
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  if (report.status !== "PASSED")
    throw evidenceError(
      "TEST_INVENTORY_RECONCILIATION_FAILED",
      "after inventory does not reconcile with before disposition",
    );
  return report;
}

if (require.main === module) {
  try {
    process.stdout.write(
      JSON.stringify(
        createTestInventoryEvidence(parseArguments(process.argv.slice(2))),
      ) + "\n",
    );
  } catch (error) {
    const code =
      error &&
      typeof error.code === "string" &&
      /^TEST_[A-Z0-9_]{1,72}$/.test(error.code)
        ? error.code
        : "TEST_INVENTORY_EVIDENCE_FAILED";
    process.stderr.write(code + ":test inventory evidence failed\n");
    process.exitCode = 1;
  }
}

module.exports = {
  createTestInventoryEvidence,
  parseArguments,
  readBeforeSnapshot,
};

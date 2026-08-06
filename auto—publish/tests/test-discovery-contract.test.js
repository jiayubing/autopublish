const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  collectTestFiles,
  createExecutionPlan,
  parseArguments,
  summarizeTestResults,
} = require("../scripts/run-tests");

const root = path.resolve(__dirname, "..");

test("default test discovery collects both JavaScript module extensions", () => {
  const files = collectTestFiles();
  assert.ok(
    files.some((file) =>
      file.endsWith("platform-submission-controller.test.mjs"),
    ),
  );
  assert.ok(files.some((file) => file.endsWith(".test.js")));
  assert.deepEqual(
    files,
    [...files].sort((left, right) => left.localeCompare(right)),
  );
  assert.equal(new Set(files).size, files.length);
  assert.ok(files.every((file) => !file.includes("node_modules")));
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts
      .test,
    "node scripts/run-tests.js",
  );
  assert.match(
    fs.readFileSync(path.join(root, "scripts", "run-tests.js"), "utf8"),
    /--test-concurrency=1/,
  );
});

test("desktop core test collection excludes only delegated packaging contracts", () => {
  const allFiles = collectTestFiles();
  const excluded = [
    "tests/production-packaging.test.js",
    "tests/desktop-packaging.test.js",
    "tests/packaging-runtime.test.js",
    "tests/release-evidence.test.js",
  ];
  const coreFiles = collectTestFiles(excluded);
  assert.equal(coreFiles.length, allFiles.length - excluded.length);
  excluded.forEach((file) =>
    assert.equal(
      coreFiles.some((candidate) => candidate.replaceAll("\\", "/") === file),
      false,
    ),
  );
  assert.deepEqual(parseArguments(["--exclude", excluded[0]]), {
    excludedFiles: [excluded[0]],
    list: false,
    serial: false,
    parallelConcurrency: 4,
  });
});

test("hybrid execution partitions every discovered file exactly once", () => {
  const files = collectTestFiles();
  const plan = createExecutionPlan(files);
  const assigned = [...plan.parallelFiles, ...plan.serialFiles];

  assert.equal(files.length, 246);
  assert.equal(new Set(assigned).size, files.length);
  assert.deepEqual([...assigned].sort(), [...files].sort());
  assert.ok(
    plan.parallelFiles.includes("tests/article-submission-eligibility.test.js"),
  );
  assert.ok(
    plan.serialFiles.includes(
      "tests/phase-06-production-ipc-fixture-matrix.test.js",
    ),
  );
  assert.ok(plan.serialFiles.includes("tests/phase-08-cleanup-gates.test.js"));
  assert.ok(plan.serialFiles.includes("tests/auth-gate.test.js"));
  assert.equal(plan.parallelConcurrency, 4);
});

test("runner arguments retain serial baseline and allow bounded parallelism", () => {
  assert.deepEqual(
    parseArguments(["--serial", "--parallel-concurrency", "2"]),
    {
      excludedFiles: [],
      list: false,
      serial: true,
      parallelConcurrency: 2,
    },
  );
});

test("group summaries aggregate counts and preserve the slowest file timings", () => {
  const summary = summarizeTestResults([
    {
      status: 0,
      counts: {
        tests: 3,
        passed: 3,
        failed: 0,
        skipped: 0,
        cancelled: 0,
        todo: 0,
      },
      durationMs: 120,
      timings: [{ file: "tests/fast.test.js", durationMs: 12 }],
    },
    {
      status: 1,
      counts: {
        tests: 2,
        passed: 1,
        failed: 1,
        skipped: 0,
        cancelled: 0,
        todo: 0,
      },
      durationMs: 240,
      timings: [{ file: "tests/slow.test.js", durationMs: 240 }],
    },
  ]);

  assert.deepEqual(summary.counts, {
    tests: 5,
    passed: 4,
    failed: 1,
    skipped: 0,
    cancelled: 0,
    todo: 0,
  });
  assert.equal(summary.status, 1);
  assert.equal(summary.durationMs, 360);
  assert.deepEqual(summary.slowestFiles[0], {
    file: "tests/slow.test.js",
    durationMs: 240,
  });
});

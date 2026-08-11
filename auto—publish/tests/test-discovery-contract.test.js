const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  collectTestFiles,
  createExecutionPlan,
  parseArguments,
  summarizeTestResults,
} = require("../scripts/run-tests");
const {
  createTestDiscoveryEvidence,
} = require("../scripts/create-test-discovery-evidence");

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

test("test discovery fails closed when a discovered source file is unreadable", () => {
  assert.throws(
    () => createExecutionPlan(["tests/does-not-exist.test.js"]),
    (error) => error.code === "TEST_RUNNER_SOURCE_UNAVAILABLE",
  );
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

test("discovery evidence records every file and its single pool assignment", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "m05-h-discovery-evidence-"),
  );
  try {
    const report = createTestDiscoveryEvidence({
      output: path.join(root, "discovery.json"),
    });
    assert.equal(report.status, "PASSED");
    assert.equal(report.files.length, report.count);
    assert.equal(report.everyFileHasExactlyOnePool, true);
    assert.equal(report.pools.parallel + report.pools.serial, report.count);
    assert.equal(new Set(report.files).size, report.count);
    assert.ok(report.poolDigest);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, "discovery.json"), "utf8"))
        .everyFileHasExactlyOnePool,
      true,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("summary fails closed for open lifecycle, unreported files, and skipped work", () => {
  const summary = summarizeTestResults([
    {
      status: 0,
      counts: {
        tests: 1,
        passed: 1,
        failed: 0,
        skipped: 1,
        cancelled: 0,
        todo: 0,
      },
      durationMs: 5,
      timings: [],
      lifecycle: "stream-open",
      unreportedFiles: ["tests/missing.test.js"],
    },
  ]);
  assert.equal(summary.status, 1);
  assert.equal(summary.lifecycle, false);
  assert.equal(summary.allFilesReported, false);
  assert.equal(summary.noSkippedTodo, false);
  assert.deepEqual(summary.unreportedFiles, ["tests/missing.test.js"]);
});

test("runner fails closed when a top-level suite is skipped", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "m05-h-skipped-suite-"),
  );
  const profile = path.join(directory, "profile.json");
  const excludedFiles = collectTestFiles()
    .filter(
      (file) =>
        file !== "tests/renderer-settings-window-focus.electron.test.js",
    )
    .flatMap((file) => ["--exclude", file]);
  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/run-tests.js", "--profile-output", profile, ...excludedFiles],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_TEST_CONTEXT: undefined,
          RUN_ELECTRON_FOCUS_TESTS: undefined,
        },
      },
    );
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const report = JSON.parse(fs.readFileSync(profile, "utf8"));
    assert.equal(report.counts.skipped, 1);
    assert.equal(report.noSkippedTodo, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
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

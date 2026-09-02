"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Writable } = require("node:stream");
const { run } = require("node:test");
const { spec } = require("node:test/reporters");
const {
  DEFAULT_PARALLEL_CONCURRENCY,
  createExecutionPlan,
  normalizeRelativeFilename,
} = require("./test-runner-policy");

const ROOT = path.resolve(__dirname, "..");
const TESTS_DIR = path.join(ROOT, "tests");
const TEST_FILE_PATTERN = /\.test\.(?:js|mjs)$/;
const DEFAULT_PROFILE_OUTPUT = path.join(
  ROOT,
  "build",
  "evidence",
  "root-test-timings.json",
);
const TEST_GROUP_TIMEOUT_MS = 15 * 60 * 1000;

function collectTestFiles(excludedFiles) {
  const files = [];
  const excluded = new Set(
    Array.from(excludedFiles || [], normalizeRelativeFilename),
  );

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
        const relative = normalizeRelativeFilename(
          path.relative(ROOT, filename),
        );
        if (!excluded.has(relative)) files.push(relative);
      }
    }
  }

  visit(TESTS_DIR);
  return files.sort((left, right) => left.localeCompare(right));
}

function parsePositiveInteger(value, code) {
  if (!/^\d+$/.test(String(value || ""))) {
    process.stderr.write(code + " requires a positive integer\n");
    return null;
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > 4) {
    process.stderr.write(code + " must be between 1 and 4\n");
    return null;
  }
  return result;
}

function parseArguments(args) {
  const excludedFiles = [];
  const options = {
    excludedFiles,
    list: false,
    serial: false,
    parallelConcurrency: DEFAULT_PARALLEL_CONCURRENCY,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--list") options.list = true;
    else if (arg === "--serial") options.serial = true;
    else if (arg === "--profile-output") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        process.stderr.write("--profile-output requires a path\n");
        return null;
      }
      options.profileOutput = path.resolve(value);
      index += 1;
    } else if (arg === "--parallel-concurrency") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        process.stderr.write("--parallel-concurrency requires a value\n");
        return null;
      }
      const parsed = parsePositiveInteger(value, "--parallel-concurrency");
      if (parsed === null) return null;
      options.parallelConcurrency = parsed;
      index += 1;
    } else if (arg === "--exclude") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        process.stderr.write("--exclude requires a test file\n");
        return null;
      }
      excludedFiles.push(value);
      index += 1;
    } else if (arg.startsWith("--exclude=")) {
      const value = arg.slice("--exclude=".length);
      if (!value) {
        process.stderr.write("--exclude requires a test file\n");
        return null;
      }
      excludedFiles.push(value);
    } else {
      process.stderr.write("Unknown test runner option\n");
      return null;
    }
  }
  return options;
}

function printCollection(files) {
  process.stdout.write(
    `Collected ${files.length} test files (.test.js/.test.mjs):\n`,
  );
  files.forEach((file) => process.stdout.write(`- ${file}\n`));
}

function emptyCounts() {
  return {
    tests: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    cancelled: 0,
    todo: 0,
  };
}

function lastNumber(output, label) {
  const matches = [
    ...String(output).matchAll(new RegExp("\\u2139 " + label + " (\\d+)", "g")),
  ];
  return matches.length ? Number(matches.at(-1)[1]) : 0;
}

function countsFromReporterMarkers(output) {
  const counts = emptyCounts();
  const lines = String(output).split(/\r?\n/);
  for (const line of lines) {
    if (/#\s*SKIP(?:\s|$)/i.test(line)) counts.skipped += 1;
    if (/#\s*TODO(?:\s|$)/i.test(line)) counts.todo += 1;
    if (/#\s*CANCELLED(?:\s|$)/i.test(line)) counts.cancelled += 1;
  }
  return counts;
}

function mergeReporterMarkerCounts(counts, output) {
  const markerCounts = countsFromReporterMarkers(output);
  for (const key of ["skipped", "cancelled", "todo"])
    counts[key] = Math.max(counts[key], markerCounts[key]);
  return counts;
}

function countsFromLegacyOutput(output, status) {
  const counts = {
    tests: lastNumber(output, "tests"),
    passed: lastNumber(output, "pass"),
    failed: lastNumber(output, "fail"),
    skipped: lastNumber(output, "skipped"),
    cancelled: lastNumber(output, "cancelled"),
    todo: lastNumber(output, "todo"),
  };
  mergeReporterMarkerCounts(counts, output);
  if (status !== 0 && counts.failed === 0) counts.failed = 1;
  return counts;
}

function relativeTestFile(filename) {
  const value = String(filename || "");
  const absolute = path.isAbsolute(value) ? value : path.resolve(ROOT, value);
  return normalizeRelativeFilename(path.relative(ROOT, absolute));
}

function runLegacySerial(files) {
  const startedAt = Date.now();
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", ...files],
    {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
    },
  );
  const output = String(result.stdout || "") + String(result.stderr || "");
  let status =
    result.error || typeof result.status !== "number" ? 1 : result.status;
  const counts = countsFromLegacyOutput(output, status);
  if (counts.skipped > 0 || counts.todo > 0 || counts.cancelled > 0) status = 1;
  return {
    name: "serial-baseline",
    pool: "serial",
    concurrency: 1,
    files: files.length,
    status,
    counts,
    durationMs: Date.now() - startedAt,
    timings: [],
    output,
    lifecycle: "process-closed",
    reportedFiles: [...files],
    unreportedFiles: [],
  };
}

function runProgrammaticGroup(group) {
  if (!group.files.length)
    return Promise.resolve({
      name: group.name,
      pool: group.pool,
      concurrency: group.concurrency,
      files: 0,
      status: 0,
      counts: emptyCounts(),
      durationMs: 0,
      timings: [],
      output: "",
      lifecycle: "stream-closed",
      reportedFiles: [],
      unreportedFiles: [],
    });

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timings = new Map();
    const reportedFiles = new Set();
    let summary = null;
    let streamError = null;
    let streamClosed = false;
    let reporterFinished = false;
    let settled = false;
    const output = [];
    const controller = new AbortController();
    const stream = run({
      files: group.files.map((file) => path.resolve(ROOT, file)),
      concurrency: group.concurrency,
      isolation: "process",
      forceExit: true,
      signal: controller.signal,
    });
    const timeout = setTimeout(() => {
      if (settled) return;
      const error = new Error("TEST_RUNNER_GROUP_TIMEOUT");
      error.code = "TEST_RUNNER_GROUP_TIMEOUT";
      streamError = streamError || error;
      controller.abort(error);
    }, TEST_GROUP_TIMEOUT_MS);

    const captureTiming = (event, requireFileEvent) => {
      if (!event || !event.file) return;
      const file = relativeTestFile(event.file);
      if (!group.files.includes(file)) return;
      if (requireFileEvent) {
        const eventName = String(event.name || "");
        const nameAsFile = path.isAbsolute(eventName)
          ? relativeTestFile(eventName)
          : normalizeRelativeFilename(eventName);
        const isFileSuite =
          event.details?.type === "suite" || nameAsFile === file;
        if (!isFileSuite) return;
      }
      reportedFiles.add(file);
      if (!event.details) return;
      const durationMs = Number(event.details.duration_ms);
      if (!Number.isFinite(durationMs)) return;
      timings.set(file, {
        file,
        durationMs: Math.round(durationMs),
        passed: event.success === true || event.details.passed === true,
        pool: group.pool,
      });
    };

    stream.on("test:complete", (event) => {
      if (event && event.nesting === 0) captureTiming(event, true);
    });
    stream.on("test:summary", (event) => {
      if (!event) return;
      if (event.file) captureTiming(event, false);
      else summary = event;
    });
    stream.once("error", (error) => {
      streamError = error;
    });

    const finalize = () => {
      if (settled || !streamClosed || !reporterFinished) return;
      settled = true;
      // The test stream's close event is the worker lifecycle barrier. Drain
      // the next turn so ChildProcess handles released by the worker are also
      // gone before the group result can drive the final summary/profile.
      setImmediate(() => {
        const summaryCounts = (summary && summary.counts) || {};
        const counts = {
          tests: Number(summaryCounts.tests) || 0,
          passed: Number(summaryCounts.passed) || 0,
          failed: Number(summaryCounts.failed) || 0,
          skipped: Number(summaryCounts.skipped) || 0,
          cancelled: Number(summaryCounts.cancelled) || 0,
          todo: Number(summaryCounts.todo) || 0,
        };
        mergeReporterMarkerCounts(counts, output.join(""));
        if (counts.failed === 0 && summary && summary.success === false)
          counts.failed = 1;
        const unreportedFiles = group.files.filter(
          (file) => !reportedFiles.has(normalizeRelativeFilename(file)),
        );
        const status =
          streamError ||
          !summary ||
          unreportedFiles.length > 0 ||
          counts.failed > 0 ||
          counts.skipped > 0 ||
          counts.cancelled > 0 ||
          counts.todo > 0
            ? 1
            : 0;
        const completed = new Map(timings);
        group.files.forEach((file) => {
          const normalized = normalizeRelativeFilename(file);
          if (!completed.has(normalized))
            completed.set(normalized, {
              file: normalized,
              durationMs: null,
              passed: false,
              pool: group.pool,
              status: reportedFiles.has(normalized)
                ? "reported-without-duration"
                : "not-reported",
            });
        });
        resolve({
          name: group.name,
          pool: group.pool,
          concurrency: group.concurrency,
          files: group.files.length,
          status,
          counts,
          durationMs: Date.now() - startedAt,
          timings: [...completed.values()],
          output: output.join(""),
          error: streamError
            ? streamError.code && /^[A-Z0-9_]{1,80}$/.test(streamError.code)
              ? streamError.code
              : "TEST_STREAM_FAILED"
            : undefined,
          lifecycle: "stream-closed",
          reportedFiles: [...reportedFiles].sort(),
          unreportedFiles,
        });
      });
    };

    stream.once("close", () => {
      clearTimeout(timeout);
      streamClosed = true;
      finalize();
    });

    const sink = new Writable({
      write(chunk, encoding, callback) {
        output.push(Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk));
        callback();
      },
    });
    sink.once("finish", () => {
      reporterFinished = true;
      finalize();
    });
    sink.once("error", (error) => {
      streamError = error;
      reporterFinished = true;
      finalize();
    });
    stream.pipe(new spec()).pipe(sink);
  });
}

function summarizeTestResults(results) {
  const counts = emptyCounts();
  let durationMs = 0;
  let status = 0;
  const timings = [];
  const unreportedFiles = [];
  let lifecycle = true;
  for (const result of results) {
    durationMs += Number(result.durationMs) || 0;
    status = status || result.status || 0;
    for (const key of Object.keys(counts))
      counts[key] += Number(result.counts && result.counts[key]) || 0;
    timings.push(...(result.timings || []));
    if (
      Object.hasOwn(result, "lifecycle") &&
      result.lifecycle !== "stream-closed" &&
      result.lifecycle !== "process-closed"
    )
      lifecycle = false;
    unreportedFiles.push(...(result.unreportedFiles || []));
  }
  if (
    !lifecycle ||
    unreportedFiles.length > 0 ||
    counts.skipped > 0 ||
    counts.cancelled > 0 ||
    counts.todo > 0
  )
    status = 1;
  const slowestFiles = timings
    .filter((item) => Number.isFinite(item.durationMs))
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 20)
    .map((item) => ({
      file: item.file,
      durationMs: item.durationMs,
    }));
  return {
    status,
    counts,
    durationMs,
    slowestFiles,
    lifecycle,
    unreportedFiles,
    allFilesReported: unreportedFiles.length === 0,
    noSkippedTodo:
      counts.skipped === 0 && counts.cancelled === 0 && counts.todo === 0,
  };
}

function writeProfile(output, mode, plan, results, summary, wallClockMs) {
  const report = {
    status: summary.status === 0 ? "PASSED" : "FAILED",
    mode,
    collected: plan.allFiles.length,
    groups: results.map((result) => ({
      name: result.name,
      pool: result.pool,
      concurrency: result.concurrency,
      files: result.files,
      counts: result.counts,
      durationMs: result.durationMs,
      lifecycle: result.lifecycle,
      reportedFiles: result.reportedFiles,
      unreportedFiles: result.unreportedFiles,
    })),
    counts: summary.counts,
    wallClockMs,
    slowestFiles: summary.slowestFiles,
    lifecycle: summary.lifecycle ? "CLOSED" : "OPEN_OR_UNKNOWN",
    allFilesReported: summary.allFilesReported,
    noSkippedTodo: summary.noSkippedTodo,
    classifications: plan.classifications,
    timings: results.flatMap((result) => result.timings),
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  return report;
}

async function main(args) {
  const options = parseArguments(args);
  if (!options) return 1;
  const files = collectTestFiles(options.excludedFiles);
  printCollection(files);
  if (options.list) return 0;
  if (files.length === 0) {
    process.stderr.write("No test files were collected\n");
    return 1;
  }

  const plan = createExecutionPlan(files, options);
  const startedAt = Date.now();
  let results;
  let mode = "hybrid";
  if (options.serial) {
    mode = "serial-baseline";
    results = [runLegacySerial(plan.allFiles)];
  } else {
    const groups = [
      {
        name: "parallel-safe",
        pool: "parallel",
        concurrency: plan.parallelConcurrency,
        files: plan.parallelFiles,
      },
      {
        name: "serial-safe-boundary",
        pool: "serial",
        concurrency: 1,
        files: plan.serialFiles,
      },
    ];
    results = [];
    for (const group of groups) results.push(await runProgrammaticGroup(group));
  }

  for (const result of results) {
    process.stdout.write(
      `\n=== ${result.name} (${result.files || result.timings.length} files, concurrency=${result.concurrency}) ===\n`,
    );
    process.stdout.write(result.output || "");
    if (result.error) process.stderr.write(result.error + "\n");
  }
  const summary = summarizeTestResults(results);
  process.stdout.write(
    [
      `\u2139 tests ${summary.counts.tests}`,
      `\u2139 pass ${summary.counts.passed}`,
      `\u2139 fail ${summary.counts.failed}`,
      `\u2139 skipped ${summary.counts.skipped}`,
      `\u2139 cancelled ${summary.counts.cancelled}`,
      `\u2139 todo ${summary.counts.todo}`,
    ].join("\n") + "\n",
  );
  const profileOutput = options.profileOutput || DEFAULT_PROFILE_OUTPUT;
  writeProfile(
    profileOutput,
    mode,
    plan,
    results,
    summary,
    Date.now() - startedAt,
  );
  process.stdout.write(
    "Test runner summary: " +
      JSON.stringify({
        mode,
        collected: plan.allFiles.length,
        parallel: plan.parallelFiles.length,
        serial: plan.serialFiles.length,
        counts: summary.counts,
        wallClockMs: Date.now() - startedAt,
        slowestFiles: summary.slowestFiles,
        lifecycle: summary.lifecycle ? "CLOSED" : "OPEN_OR_UNKNOWN",
        allFilesReported: summary.allFilesReported,
        noSkippedTodo: summary.noSkippedTodo,
        profileOutput,
      }) +
      "\n",
  );
  return summary.status;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      const code =
        error &&
        typeof error.code === "string" &&
        /^TEST_[A-Z0-9_]{1,72}$/.test(error.code)
          ? error.code
          : "TEST_RUNNER_FAILED";
      process.stderr.write(code + "\n");
      process.exitCode = 1;
    });
}

module.exports = {
  collectTestFiles,
  createExecutionPlan,
  main,
  parseArguments,
  summarizeTestResults,
};

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createDiagnosticRecord,
  isSafeDiagnosticText,
} = require("../src/diagnostics/diagnostic-schema");
const { createDiagnosticMemorySink } = require("../src/diagnostics/diagnostic-memory-sink");
const {
  createDiagnosticDirectoryPolicy,
} = require("../src/diagnostics/diagnostic-directory-policy");
const { createDiagnosticFileSink } = require("../src/diagnostics/diagnostic-file-sink");
const { projectDiagnostic } = require("../src/diagnostics/diagnostic-projection");
const {
  projectDiagnosticsResult,
} = require("../src/diagnostics/diagnostic-projection");
const { createDiagnosticProducer } = require("../src/diagnostics/diagnostic-producer");

function record(id, overrides) {
  return createDiagnosticRecord(Object.assign({
    diagnosticId: "diag-" + id,
    code: "TEST_EVENT",
    module: "test-module",
    category: "internal",
    operationId: "op-" + id,
    runId: "run-1",
    metadata: { action: "test" },
  }, overrides || {}));
}

function temporaryRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function withTemporaryRoot(callback) {
  const root = temporaryRoot("structured-diagnostics-");
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("diagnostic schema is exact, bounded, and rejects sensitive fields", () => {
  const value = record("schema", { occurredAt: "2026-08-01T00:00:00.000Z" });
  assert.deepEqual(Object.keys(value), [
    "diagnosticId",
    "occurredAt",
    "code",
    "module",
    "category",
    "operationId",
    "runId",
    "metadata",
  ]);
  assert.equal(value.runId, "run-1");
  assert.equal(value.metadata.action, "test");
  assert.equal(isSafeDiagnosticText("safe user message"), true);

  for (const field of ["message", "body", "cookie", "apiKey", "path", "dom", "stack", "accountDisplayName"]) {
    assert.throws(
      () => createDiagnosticRecord(Object.assign({}, value, { [field]: "secret" })),
      { code: "DIAGNOSTIC_RECORD_FIELD_INVALID" },
      field,
    );
  }
  for (const [key, sensitive] of [
    ["source", "C:\\private\\article.md"],
    ["operation", "document.querySelector('body')"],
  ]) {
    assert.throws(
      () => record("sensitive", { metadata: { [key]: sensitive } }),
      { code: "DIAGNOSTIC_METADATA_VALUE_INVALID" },
      key,
    );
  }
  assert.throws(
    () => record("unknown", { metadata: { contentHtml: "<p>article</p>" } }),
    { code: "DIAGNOSTIC_METADATA_KEY_INVALID" },
  );
  assert.equal(isSafeDiagnosticText("C:\\private\\stack.txt"), false);
  assert.equal(isSafeDiagnosticText("Error: x\n    at worker.js:1:1"), false);
});

test("memory sink bounds records, deduplicates, and preserves run correlation", () => {
  const sink = createDiagnosticMemorySink({ maxRecords: 2 });
  const first = sink.append(record("first", { operationId: "op-shared" }));
  const duplicate = sink.append(record("duplicate", { operationId: "op-shared" }));
  assert.equal(duplicate.diagnosticId, first.diagnosticId);
  assert.equal(sink.size(), 1);

  sink.append(record("second", { operationId: "op-second" }));
  sink.append(record("third", { operationId: "op-third", runId: "run-2" }));
  assert.equal(sink.size(), 2);
  assert.deepEqual(sink.getSnapshot({ runId: "run-2" }).map((item) => item.diagnosticId), ["diag-third"]);
  assert.equal(sink.findByDiagnosticId("diag-first"), null);
  assert.equal(sink.findByDiagnosticId("diag-third").runId, "run-2");
});

test("diagnostic producer isolates sink failure and exposes sanitized delivery status", () => {
  const producer = createDiagnosticProducer({
    sinks: [
      { append() { throw Object.assign(new Error("private path"), { code: "DIAGNOSTIC_FILE_WRITE_FAILED" }); } },
      { append() {} },
    ],
  });
  producer.append(record("producer-failure"));
  assert.deepEqual(producer.getStatus(), {
    status: "degraded",
    attemptedCount: 1,
    deliveredCount: 0,
    failedCount: 1,
    lastFailureCode: "DIAGNOSTIC_FILE_WRITE_FAILED",
  });
  assert.doesNotMatch(JSON.stringify(producer.getStatus()), /private|path/i);
});

test("file sink rotates by file size and keeps the configured file count", () => withTemporaryRoot((root) => {
  const logs = path.join(root, "logs");
  const sink = createDiagnosticFileSink({
    directory: logs,
    root,
    maxFileBytes: 220,
    maxFiles: 2,
    maxTotalBytes: 1000,
  });
  sink.initialize();
  sink.append(record("one"));
  sink.append(record("two"));
  sink.append(record("three"));

  assert.equal(fs.existsSync(path.join(logs, "diagnostics.jsonl")), true);
  assert.equal(fs.existsSync(path.join(logs, "diagnostics.1.jsonl")), true);
  assert.equal(fs.existsSync(path.join(logs, "diagnostics.2.jsonl")), false);
  assert.equal(sink.listFiles().length, 2);
  assert.ok(sink.listFiles().every((item) => item.path.startsWith(logs)));
}));

test("file sink enforces total capacity and rejects an oversized single record", () => withTemporaryRoot((root) => {
  const logs = path.join(root, "logs");
  const bounded = createDiagnosticFileSink({
    directory: logs,
    root,
    maxFileBytes: 1000,
    maxFiles: 5,
    maxTotalBytes: 300,
  });
  bounded.initialize();
  bounded.append(record("capacity-one"));
  bounded.append(record("capacity-two"));
  bounded.append(record("capacity-three"));
  assert.ok(bounded.usage() <= 300);

  const strict = createDiagnosticFileSink({
    directory: path.join(root, "strict-logs"),
    root,
    maxFileBytes: 100,
    maxTotalBytes: 100,
  });
  assert.throws(() => strict.append(record("too-large")), { code: "DIAGNOSTIC_RECORD_TOO_LARGE" });
}));

test("file sink startup cleanup removes malformed and stale JSONL records", () => withTemporaryRoot((root) => {
  const logs = path.join(root, "logs");
  fs.mkdirSync(logs, { recursive: true });
  fs.writeFileSync(path.join(logs, "diagnostics.jsonl"), "not-json\n", "utf8");
  fs.writeFileSync(path.join(logs, "diagnostics.1.jsonl"), JSON.stringify(record("valid")) + "\n", "utf8");
  const old = new Date(Date.now() - 10_000);
  fs.utimesSync(path.join(logs, "diagnostics.1.jsonl"), old, old);

  const sink = createDiagnosticFileSink({ directory: logs, root, maxAgeMs: 1000 });
  const result = sink.initialize();
  assert.equal(result.removed, 2);
  assert.equal(fs.existsSync(path.join(logs, "diagnostics.jsonl")), false);
  assert.equal(fs.existsSync(path.join(logs, "diagnostics.1.jsonl")), false);
}));

test("directory policy rejects regular-file directories and permission failures", () => withTemporaryRoot((root) => {
  const regularFile = path.join(root, "logs-file");
  fs.writeFileSync(regularFile, "file", "utf8");
  const filePolicy = createDiagnosticDirectoryPolicy({ directory: regularFile, root });
  assert.throws(() => filePolicy.ensureDirectory(), { code: "DIAGNOSTIC_DIRECTORY_NOT_DIRECTORY" });

  const permissionFs = Object.assign({}, fs, {
    mkdirSync() {
      const error = new Error("permission denied");
      error.code = "EACCES";
      throw error;
    },
  });
  const permissionPolicy = createDiagnosticDirectoryPolicy({
    fs: permissionFs,
    directory: path.join(root, "permission-state", "permission-logs"),
    root: path.join(root, "permission-state"),
  });
  assert.throws(() => permissionPolicy.ensureDirectory(), { code: "DIAGNOSTIC_DIRECTORY_PERMISSION_DENIED" });
}));

test("directory policy rejects symlinked directories and canonical path escape", (t) => withTemporaryRoot((root) => {
  const outside = temporaryRoot("diagnostic-outside-");
  try {
    const link = path.join(root, "logs");
    try {
      fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (error && ["EPERM", "EACCES", "EINVAL"].includes(error.code)) {
        t.skip("symlink creation is unavailable in this environment");
        return;
      }
      throw error;
    }
    const policy = createDiagnosticDirectoryPolicy({ directory: link, root });
    assert.throws(() => policy.ensureDirectory(), { code: "DIAGNOSTIC_DIRECTORY_SYMLINK" });
    assert.equal(policy.isWithin(path.join(link, "diagnostics.jsonl")), false);
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
}));

test("directory policy rejects canonical path escape after directory creation", () => withTemporaryRoot((root) => {
  const logs = path.join(root, "logs");
  const outside = temporaryRoot("diagnostic-canonical-outside-");
  try {
    const escapedFs = Object.assign({}, fs, {
      realpathSync(filename) {
        return path.resolve(filename) === path.resolve(logs)
          ? outside
          : fs.realpathSync(filename);
      },
    });
    const policy = createDiagnosticDirectoryPolicy({ fs: escapedFs, directory: logs, root });
    assert.throws(() => policy.ensureDirectory(), { code: "DIAGNOSTIC_DIRECTORY_PATH_ESCAPE" });
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
}));

test("file sink classifies write permission failures and projection is exact", () => withTemporaryRoot((root) => {
  const logs = path.join(root, "logs");
  const policy = {
    directory: logs,
    ensureDirectory() {},
    resolveChild(name) { return path.join(logs, name); },
    listRegularFiles() { return { files: [], skipped: 0 }; },
  };
  const deniedFs = Object.assign({}, fs, {
    statSync() {
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    },
    appendFileSync() {
      const error = new Error("permission denied");
      error.code = "EACCES";
      throw error;
    },
  });
  const sink = createDiagnosticFileSink({
    fs: deniedFs,
    policy,
    maxFileBytes: 1000,
    maxTotalBytes: 1000,
  });
  assert.throws(() => sink.append(record("denied")), { code: "DIAGNOSTIC_FILE_PERMISSION_DENIED" });

  const projected = projectDiagnostic(record("projection"));
  assert.deepEqual(Object.keys(projected), ["diagnosticId", "userMessage", "summary"]);
  assert.deepEqual(Object.keys(projected.summary), ["code", "category"]);
  assert.equal("occurredAt" in projected, false);
  assert.equal("metadata" in projected, false);
  assert.equal("module" in projected, false);
}));

test("diagnostic projection reports malformed records without exposing their contents", () => {
  const projected = projectDiagnosticsResult([record("valid"), { metadata: "invalid" }]);
  assert.equal(projected.items.length, 1);
  assert.equal(projected.droppedCount, 1);
  assert.doesNotMatch(JSON.stringify(projected), /invalid/);
});

test("file sink does not fake success when lock cleanup fails", () => withTemporaryRoot((root) => {
  const logs = path.join(root, "logs");
  const originalClose = fs.closeSync;
  try {
    fs.closeSync = function () {
      const error = new Error("private cleanup detail");
      error.code = "EIO";
      throw error;
    };
    const sink = createDiagnosticFileSink({ directory: logs, root });
    assert.throws(() => sink.append(record("lock-cleanup")), {
      code: "DIAGNOSTIC_LOCK_CLOSE_FAILED",
    });
  } finally {
    fs.closeSync = originalClose;
  }
}));

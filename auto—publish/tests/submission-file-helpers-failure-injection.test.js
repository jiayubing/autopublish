"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { setDiagnosticReporter } = require("../src/diagnostics/diagnostic-producer");
const { writePairAtomic } = require("../desktop/services/submission-file-helpers");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "submission-pair-fault-"));
  return { root, markdown: path.join(root, "article.md"), sidecar: path.join(root, "article.md.submission.json") };
}

function withFs(overrides, run) {
  const original = { renameSync: fs.renameSync, unlinkSync: fs.unlinkSync, writeFileSync: fs.writeFileSync };
  Object.assign(fs, overrides);
  try { return run(); } finally { Object.assign(fs, original); }
}

function diagnostics(run) {
  const records = [];
  const restore = setDiagnosticReporter((record) => { records.push(record); return true; });
  try { return { result: run(), records }; } finally { restore(); }
}

test("preserves the original error when sidecar rename fails after markdown rename", () => {
  const f = fixture();
  try {
    const originalError = new Error("sidecar persistence failed");
    const realRename = fs.renameSync;
    let renames = 0;
    const observed = diagnostics(() => withFs({
      renameSync(source, target) {
        renames += 1;
        if (renames === 2) throw originalError;
        return realRename(source, target);
      },
    }, () => assert.throws(() => writePairAtomic(f.markdown, "body", f.sidecar, "{}\n"), (error) => error === originalError)));
    assert.equal(observed.records.length, 0);
    assert.equal(fs.existsSync(f.markdown), false);
    assert.equal(fs.existsSync(f.sidecar), false);
    assert.equal(fs.existsSync(f.markdown) && fs.existsSync(f.sidecar), false);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("reports rollback unlink failure without replacing the persistence error", () => {
  const f = fixture();
  try {
    const originalError = new Error("sidecar rename failed");
    const realRename = fs.renameSync;
    const realUnlink = fs.unlinkSync;
    let renames = 0;
    const observed = diagnostics(() => withFs({
      renameSync(source, target) {
        renames += 1;
        if (renames === 2) throw originalError;
        return realRename(source, target);
      },
      unlinkSync(filename) {
        if (filename === f.markdown) throw new Error("rollback unlink failed");
        return realUnlink(filename);
      },
    }, () => assert.throws(() => writePairAtomic(f.markdown, "body", f.sidecar, "{}\n"), (error) => error === originalError)));
    assert.equal(observed.records.length, 1);
    assert.equal(observed.records[0].code, "SUBMISSION_PAIR_ROLLBACK_FAILED");
    assert.equal(observed.records[0].metadata.failureKind, "markdown");
    assert.equal(JSON.stringify(observed.records).includes(f.root), false);
    assert.equal(fs.existsSync(f.markdown) && fs.existsSync(f.sidecar), false);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("reports temporary-file cleanup failure while retaining the original write error", () => {
  const f = fixture();
  try {
    const originalError = new Error("sidecar temp write failed");
    const realWrite = fs.writeFileSync;
    const realUnlink = fs.unlinkSync;
    const observed = diagnostics(() => withFs({
      writeFileSync(filename, data, encoding) {
        if (String(filename).startsWith(f.sidecar + ".tmp-")) throw originalError;
        return realWrite(filename, data, encoding);
      },
      unlinkSync(filename) {
        if (String(filename).startsWith(f.markdown + ".tmp-") || String(filename).startsWith(f.sidecar + ".tmp-")) throw new Error("temp cleanup failed");
        return realUnlink(filename);
      },
    }, () => assert.throws(() => writePairAtomic(f.markdown, "body", f.sidecar, "{}\n"), (error) => error === originalError)));
    assert.ok(observed.records.some((record) => record.code === "SUBMISSION_PAIR_TEMP_CLEANUP_FAILED"));
    assert.equal(JSON.stringify(observed.records).includes(f.root), false);
    assert.equal(fs.existsSync(f.markdown) && fs.existsSync(f.sidecar), false);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

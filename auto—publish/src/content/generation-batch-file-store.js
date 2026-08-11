const fs = require("node:fs");
const path = require("node:path");
const { reportDiagnostic } = require("../diagnostics/diagnostic-producer");

function createGenerationBatchFileStore(options) {
  const opts = options || {};
  const fsApi = opts.fs || fs;
  const policy = opts.pathPolicy;
  const normalizePersisted = opts.normalizePersisted;
  const clone =
    opts.clone ||
    function (value) {
      return JSON.parse(JSON.stringify(value));
    };
  const makeError = opts.error;
  if (
    !policy ||
    typeof normalizePersisted !== "function" ||
    typeof makeError !== "function"
  )
    throw new Error("GENERATION_BATCH_FILE_STORE_INVALID");
  const directory = policy.generationBatchDirectory(true);

  function fail(code, message, cause) {
    const error = makeError(code, message);
    if (cause) error.cause = cause;
    throw error;
  }
  function exists(filename) {
    try {
      fsApi.lstatSync(filename);
      return true;
    } catch (error) {
      if (error && error.code === "ENOENT") return false;
      throw error;
    }
  }
  function assertRegular(filename, allowMissing) {
    if (!exists(filename) && allowMissing) return false;
    policy.assertRegularFile(filename, {
      boundary: directory,
      code: "GENERATION_BATCH_PATH_UNSAFE",
      label: "Generation batch file",
      allowMissing: Boolean(allowMissing),
    });
    return true;
  }
  function transactionFiles(filename) {
    return {
      journal: filename + ".journal",
      backup: filename + ".bak",
      temporary: filename + ".tmp",
    };
  }
  function removeRegular(filename) {
    if (!exists(filename)) return;
    assertRegular(filename, false);
    fsApi.unlinkSync(filename);
  }

  function batchIdFromFilename(filename) {
    const name = path.basename(filename);
    const prefix = "batch-";
    const suffix = ".json";
    if (!name.startsWith(prefix) || !name.endsWith(suffix)) {
      fail("GENERATION_BATCH_INVALID", "Generation batch filename is invalid");
    }
    return name.slice(prefix.length, -suffix.length);
  }

  function readPersisted(filename, canonicalFilename) {
    try {
      const batch = normalizePersisted(
        JSON.parse(fsApi.readFileSync(filename, "utf8")),
      );
      if (batch.id !== batchIdFromFilename(canonicalFilename || filename)) {
        fail(
          "GENERATION_BATCH_INVALID",
          "Generation batch filename does not match batch id",
        );
      }
      return batch;
    } catch (error) {
      if (error && error.code === "GENERATION_BATCH_INVALID") throw error;
      fail("GENERATION_BATCH_INVALID", "Generation batch is invalid", error);
    }
  }

  function readJournal(filename) {
    let journal;
    try {
      assertRegular(filename, false);
      journal = JSON.parse(fsApi.readFileSync(filename, "utf8"));
    } catch (error) {
      if (error && error.code === "GENERATION_BATCH_PATH_UNSAFE") throw error;
      fail(
        "GENERATION_BATCH_INVALID",
        "Generation batch journal is invalid",
        error,
      );
    }
    if (
      !journal ||
      typeof journal !== "object" ||
      Array.isArray(journal) ||
      journal.version !== 1 ||
      Object.keys(journal).length !== 1
    ) {
      fail("GENERATION_BATCH_INVALID", "Generation batch journal is invalid");
    }
  }

  function recover(filename) {
    const transaction = transactionFiles(filename);
    if (exists(transaction.journal)) {
      readJournal(transaction.journal);
      if (exists(filename)) {
        assertRegular(filename, false);
        readPersisted(filename);
        if (exists(transaction.temporary)) assertRegular(transaction.temporary, false);
        if (exists(transaction.backup)) assertRegular(transaction.backup, false);
        removeRegular(transaction.temporary);
        removeRegular(transaction.backup);
      } else if (exists(transaction.temporary)) {
        assertRegular(transaction.temporary, false);
        readPersisted(transaction.temporary, filename);
        if (exists(transaction.backup)) assertRegular(transaction.backup, false);
        fsApi.renameSync(transaction.temporary, filename);
        removeRegular(transaction.backup);
      } else if (exists(transaction.backup)) {
        assertRegular(transaction.backup, false);
        readPersisted(transaction.backup, filename);
        fsApi.renameSync(transaction.backup, filename);
      } else
        fail(
          "GENERATION_BATCH_INVALID",
          "Generation batch transaction is incomplete",
        );
      removeRegular(transaction.journal);
    } else {
      if (!exists(filename) && exists(transaction.temporary)) {
        assertRegular(transaction.temporary, false);
        readPersisted(transaction.temporary, filename);
        if (exists(transaction.backup)) assertRegular(transaction.backup, false);
        fsApi.renameSync(transaction.temporary, filename);
      }
      if (exists(filename) && exists(transaction.temporary))
        assertRegular(transaction.temporary, false);
      if (exists(transaction.backup) && exists(filename)) {
        assertRegular(filename, false);
        readPersisted(filename);
        removeRegular(transaction.backup);
      }
    }
  }

  function read(filename) {
    try {
      recover(filename);
      assertRegular(filename, false);
      return readPersisted(filename);
    } catch (error) {
      if (
        error &&
        (error.code === "GENERATION_BATCH_INVALID" ||
          error.code === "GENERATION_BATCH_PATH_UNSAFE")
      )
        throw error;
      fail("GENERATION_BATCH_INVALID", "Generation batch is invalid", error);
    }
  }

  function write(batch) {
    const normalized = normalizePersisted(batch);
    normalized.updatedAt =
      typeof opts.now === "function" ? opts.now() : normalized.updatedAt;
    normalized.counts = normalized.counts || undefined;
    const filename = policy.generationBatchFile(normalized.id, true);
    const transaction = transactionFiles(filename);
    try {
      recover(filename);
      removeRegular(transaction.temporary);
      removeRegular(transaction.backup);
      fsApi.writeFileSync(
        transaction.temporary,
        JSON.stringify(normalized, null, 2) + "\n",
        { encoding: "utf8", flag: "wx" },
      );
      const descriptor = fsApi.openSync(transaction.temporary, "r");
      let syncError = null;
      try {
        try {
          fsApi.fsyncSync(descriptor);
        } catch (error) {
          if (error.code !== "EPERM" && error.code !== "EINVAL") syncError = error;
        }
      } finally {
        try { fsApi.closeSync(descriptor); }
        catch (error) {
          if (syncError) {
            reportDiagnostic({
              code: "GENERATION_BATCH_DESCRIPTOR_CLOSE_FAILED",
              module: "generation-batch-file-store",
              category: "storage",
              operationId: "generation-batch-write",
              metadata: {
                operation: "descriptor-close",
                phase: "cleanup",
                outcome: "secondary-failure",
                errorCode: error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
                  ? error.code
                  : "GENERATION_BATCH_DESCRIPTOR_CLOSE_FAILED"
              }
            });
          } else syncError = error;
        }
      }
      if (syncError) throw syncError;
      fsApi.writeFileSync(
        transaction.journal,
        JSON.stringify({ version: 1 }) + "\n",
        { encoding: "utf8", flag: "wx" },
      );
      assertRegular(transaction.journal, false);
      if (exists(filename)) {
        assertRegular(filename, false);
        fsApi.renameSync(filename, transaction.backup);
      }
      fsApi.renameSync(transaction.temporary, filename);
      removeRegular(transaction.backup);
      removeRegular(transaction.journal);
    } catch (error) {
      try {
        if (!exists(filename) && exists(transaction.backup))
          fsApi.renameSync(transaction.backup, filename);
        removeRegular(transaction.temporary);
        removeRegular(transaction.journal);
        removeRegular(transaction.backup);
      } catch (cleanupError) {
        reportDiagnostic({
          code: "GENERATION_BATCH_ROLLBACK_CLEANUP_FAILED",
          module: "generation-batch-file-store",
          category: "storage",
          operationId: "generation-batch-write",
          metadata: {
            operation: "rollback-cleanup",
            phase: "cleanup",
            outcome: "secondary-failure",
            errorCode: cleanupError && /^[A-Z][A-Z0-9_]{1,127}$/.test(cleanupError.code || "")
              ? cleanupError.code
              : "GENERATION_BATCH_ROLLBACK_CLEANUP_FAILED"
          }
        });
      }
      throw error;
    }
    return clone(normalized);
  }

  function get(batchId) {
    const filename = policy.generationBatchFile(batchId, false);
    recover(filename);
    if (!exists(filename))
      fail("GENERATION_BATCH_NOT_FOUND", "Generation batch was not found");
    return clone(read(filename));
  }

  function list() {
    return policy
      .listGenerationBatchFiles()
      .map(function (filename) { return read(filename); })
      .sort(function (left, right) {
        return String(right.createdAt).localeCompare(String(left.createdAt));
      })
      .map(clone);
  }

  return {
    directory,
    recover,
    read,
    write,
    get,
    list,
    filename: function (batchId) {
      return policy.generationBatchFile(batchId, false);
    },
  };
}

module.exports = { createGenerationBatchFileStore };

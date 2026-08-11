const fs = require("node:fs");
const crypto = require("node:crypto");
const { reportDiagnostic } = require("../diagnostics/diagnostic-producer");

function fileTransactionError(code, message, cause) {
  const error = new Error(message || code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function createAtomicFileWriter(options) {
  const opts = options || {};
  const fsApi = opts.fs || fs;
  const fault = typeof opts.fault === "function" ? opts.fault : function () {};

  function write(filename, contents, config) {
    const value = config || {};
    const temporary =
      filename +
      ".tmp-" +
      process.pid +
      "-" +
      Date.now() +
      "-" +
      crypto.randomUUID();
    let installed = false;
    try {
      fsApi.writeFileSync(temporary, contents, value.encoding || "utf8");
      const descriptor = fsApi.openSync(temporary, "r");
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
              code: "CONTENT_FILE_DESCRIPTOR_CLOSE_FAILED",
              module: "content-file-transaction",
              category: "storage",
              operationId: "content-file-write",
              metadata: {
                operation: "descriptor-close",
                phase: "cleanup",
                outcome: "secondary-failure",
                errorCode: error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
                  ? error.code
                  : "CONTENT_FILE_DESCRIPTOR_CLOSE_FAILED"
              }
            });
          } else syncError = error;
        }
      }
      if (syncError) throw syncError;
      fault("after-temporary-write", {
        filename: filename,
        temporary: temporary,
      });
      try {
        fsApi.renameSync(temporary, filename);
        installed = true;
      } catch (error) {
        if (value.keepExisting !== false && fsApi.existsSync(filename))
          return false;
        throw error;
      }
      fault("after-atomic-rename", { filename: filename });
      return true;
    } finally {
      if (!installed) {
        try {
          if (fsApi.existsSync(temporary)) fsApi.unlinkSync(temporary);
        } catch (error) {
          reportDiagnostic({
            code: "CONTENT_FILE_TEMP_CLEANUP_FAILED",
            module: "content-file-transaction",
            category: "storage",
            operationId: "content-file-write",
            metadata: {
              operation: "temp-cleanup",
              phase: "cleanup",
              outcome: "best-effort-failed",
              errorCode: error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
                ? error.code
                : "CONTENT_FILE_CLEANUP_FAILED"
            }
          });
        }
      }
    }
  }

  return { write };
}

module.exports = { createAtomicFileWriter, fileTransactionError };

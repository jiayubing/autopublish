const fs = require("node:fs");
const crypto = require("node:crypto");

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
      try {
        try {
          fsApi.fsyncSync(descriptor);
        } catch (error) {
          if (error.code !== "EPERM" && error.code !== "EINVAL") throw error;
        }
      } finally {
        fsApi.closeSync(descriptor);
      }
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
        } catch (_) {}
      }
    }
  }

  return { write };
}

module.exports = { createAtomicFileWriter, fileTransactionError };

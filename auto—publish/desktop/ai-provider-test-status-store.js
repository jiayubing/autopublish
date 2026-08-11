const defaultFs = require("node:fs");
const defaultPath = require("node:path");
const { reportDiagnostic } = require("../src/diagnostics/diagnostic-producer");

const FILE_NAME = "ai-provider-test-status.json";

function statusError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertUserDataPath(userDataPath, path) {
  if (typeof userDataPath !== "string" || !userDataPath.trim() || !path.isAbsolute(userDataPath)) {
    throw statusError("AI_TEST_STATUS_USER_DATA_INVALID", "AI provider test status path is invalid");
  }
  return path.resolve(userDataPath);
}

function normalizeStatus(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(function(key) { return !["testedAt", "ok", "code"].includes(key); }) ||
      typeof value.testedAt !== "string" || !value.testedAt.trim() || Number.isNaN(Date.parse(value.testedAt)) ||
      typeof value.ok !== "boolean" || typeof value.code !== "string" || !/^[A-Z0-9_]{1,100}$/.test(value.code)) {
    throw statusError("AI_TEST_STATUS_INVALID", "AI provider test status is invalid");
  }
  return { testedAt: value.testedAt, ok: value.ok, code: value.code };
}

function createAiProviderTestStatusStore(options) {
  const values = options || {};
  const io = values.fs || defaultFs;
  const path = values.path || defaultPath;
  const userDataPath = assertUserDataPath(values.userDataPath, path);
  const filePath = path.join(userDataPath, FILE_NAME);

  function assertSafeFile() {
    try {
      const stat = io.lstatSync(filePath);
      if (stat.isSymbolicLink()) throw statusError("AI_TEST_STATUS_STORAGE_INVALID", "AI provider test status is invalid");
      return stat;
    } catch (error) {
      if (error && error.code === "ENOENT") return null;
      if (error && error.code && error.code.startsWith("AI_TEST_STATUS_")) throw error;
      throw statusError("AI_TEST_STATUS_STORAGE_INVALID", "AI provider test status is invalid");
    }
  }

  function read() {
    if (!assertSafeFile()) return null;
    try {
      return normalizeStatus(JSON.parse(io.readFileSync(filePath, "utf8")));
    } catch (error) {
      if (error && error.code === "AI_TEST_STATUS_INVALID") throw error;
      throw statusError("AI_TEST_STATUS_STORAGE_INVALID", "AI provider test status is invalid");
    }
  }

  function write(value) {
    const status = normalizeStatus(value);
    assertSafeFile();
    try {
      io.mkdirSync(userDataPath, { recursive: true });
      const directoryStat = io.lstatSync(userDataPath);
      if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) throw new Error("userData is invalid");
      const temporaryPath = path.join(userDataPath, "." + FILE_NAME + ".tmp-" + process.pid + "-" + Date.now());
      try {
        io.writeFileSync(temporaryPath, JSON.stringify(status) + "\n", { encoding: "utf8", mode: 0o600 });
        io.renameSync(temporaryPath, filePath);
      } finally {
        try {
          if (io.existsSync(temporaryPath)) io.unlinkSync(temporaryPath);
        } catch (error) {
          reportDiagnostic({
            code: "AI_TEST_STATUS_TEMP_CLEANUP_FAILED",
            module: "ai-provider-test-status",
            category: "storage",
            operationId: "ai-provider-test-status-write",
            metadata: {
              operation: "temp-cleanup",
              phase: "cleanup",
              outcome: "best-effort-failed",
              errorCode: error && /^([A-Z][A-Z0-9_]{1,127})$/.test(error.code || "")
                ? error.code
                : "AI_TEST_STATUS_STORAGE_WRITE_FAILED"
            }
          });
        }
      }
      return status;
    } catch (error) {
      if (error && error.code && error.code.startsWith("AI_TEST_STATUS_")) throw error;
      throw statusError("AI_TEST_STATUS_STORAGE_WRITE_FAILED", "AI provider test status could not be saved");
    }
  }

  function clear() {
    const stat = assertSafeFile();
    if (!stat) return { cleared: false };
    try {
      io.unlinkSync(filePath);
      return { cleared: true };
    } catch (_) {
      throw statusError("AI_TEST_STATUS_STORAGE_WRITE_FAILED", "AI provider test status could not be cleared");
    }
  }

  return { read: read, write: write, clear: clear, filePath: filePath };
}

module.exports = { createAiProviderTestStatusStore };

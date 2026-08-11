const fs = require("fs");
const path = require("path");

const { DIRS } = require("../../scripts/config");
const { reportDiagnostic } = require("../diagnostics/diagnostic-producer");

function resolveTmpDir(tmpDir) {
  return typeof tmpDir === "string" && tmpDir.trim() ? tmpDir : DIRS.tmpDir;
}

function stopFilePath(tmpDir) {
  return path.join(resolveTmpDir(tmpDir), "desktop-stop.json");
}

function pauseFilePath(tmpDir) {
  return path.join(resolveTmpDir(tmpDir), "desktop-pause.json");
}

function signalError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function diagnose(code, action) {
  reportDiagnostic({
    code,
    module: "desktop-stop-signal",
    category: "storage",
    operationId: "desktop-stop-signal",
    metadata: { action },
  });
}

function clearSignal(filePath, clearCode, action) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    diagnose(clearCode, action);
    throw signalError(clearCode);
  }
}

function readSignal(filePath, readCode, action) {
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      diagnose(readCode, action);
      return true;
    }
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    diagnose(readCode, action);
    return true;
  }
}

function writeSignal(filePath, reason, writeCode, action) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({
      requestedAt: new Date().toISOString(),
      reason: reason || action,
    }), "utf8");
  } catch (error) {
    diagnose(writeCode, action);
    throw signalError(writeCode);
  }
}

function clearStopSignal(tmpDir) {
  clearSignal(
    stopFilePath(tmpDir),
    "DESKTOP_STOP_SIGNAL_CLEAR_FAILED",
    "stop-clear",
  );
}

function requestStopSignal(reason, tmpDir) {
  writeSignal(
    stopFilePath(tmpDir),
    reason,
    "DESKTOP_STOP_SIGNAL_WRITE_FAILED",
    "stop-write",
  );
}

function isStopRequested(tmpDir) {
  return readSignal(
    stopFilePath(tmpDir),
    "DESKTOP_STOP_SIGNAL_READ_FAILED",
    "stop-read",
  );
}

function clearPauseSignal(tmpDir) {
  clearSignal(
    pauseFilePath(tmpDir),
    "DESKTOP_PAUSE_SIGNAL_CLEAR_FAILED",
    "pause-clear",
  );
}

function requestPauseSignal(reason, tmpDir) {
  writeSignal(
    pauseFilePath(tmpDir),
    reason,
    "DESKTOP_PAUSE_SIGNAL_WRITE_FAILED",
    "pause-write",
  );
}

function isPauseRequested(tmpDir) {
  return readSignal(
    pauseFilePath(tmpDir),
    "DESKTOP_PAUSE_SIGNAL_READ_FAILED",
    "pause-read",
  );
}

module.exports = {
  stopFilePath,
  clearStopSignal,
  requestStopSignal,
  isStopRequested,
  pauseFilePath,
  clearPauseSignal,
  requestPauseSignal,
  isPauseRequested
};

const fs = require("fs");
const path = require("path");

const { DIRS } = require("../../scripts/config");

function resolveTmpDir(tmpDir) {
  return typeof tmpDir === "string" && tmpDir.trim() ? tmpDir : DIRS.tmpDir;
}

function stopFilePath(tmpDir) {
  return path.join(resolveTmpDir(tmpDir), "desktop-stop.json");
}

function pauseFilePath(tmpDir) {
  return path.join(resolveTmpDir(tmpDir), "desktop-pause.json");
}

function clearStopSignal(tmpDir) {
  try {
    fs.unlinkSync(stopFilePath(tmpDir));
  } catch (e) {}
}

function requestStopSignal(reason, tmpDir) {
  var directory = resolveTmpDir(tmpDir);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(stopFilePath(directory), JSON.stringify({
    requestedAt: new Date().toISOString(),
    reason: reason || "operator_stop"
  }), "utf8");
}

function isStopRequested(tmpDir) {
  return fs.existsSync(stopFilePath(tmpDir));
}

function clearPauseSignal(tmpDir) {
  try {
    fs.unlinkSync(pauseFilePath(tmpDir));
  } catch (e) {}
}

function requestPauseSignal(reason, tmpDir) {
  var directory = resolveTmpDir(tmpDir);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(pauseFilePath(directory), JSON.stringify({
    requestedAt: new Date().toISOString(),
    reason: reason || "operator_pause"
  }), "utf8");
}

function isPauseRequested(tmpDir) {
  return fs.existsSync(pauseFilePath(tmpDir));
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

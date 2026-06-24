const fs = require("fs");
const path = require("path");

const { DIRS } = require("../../scripts/config");

function stopFilePath() {
  return path.join(DIRS.tmpDir, "desktop-stop.json");
}

function clearStopSignal() {
  try {
    fs.unlinkSync(stopFilePath());
  } catch (e) {}
}

function requestStopSignal(reason) {
  fs.writeFileSync(stopFilePath(), JSON.stringify({
    requestedAt: new Date().toISOString(),
    reason: reason || "operator_stop"
  }), "utf8");
}

function isStopRequested() {
  return fs.existsSync(stopFilePath());
}

module.exports = {
  stopFilePath,
  clearStopSignal,
  requestStopSignal,
  isStopRequested
};

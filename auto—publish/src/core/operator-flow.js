const { sleep } = require("./files");
const { isStopRequested } = require("./stop-signal");

function resolveInteractive(options) {
  if (options && typeof options.interactive === "boolean") {
    return options.interactive;
  }
  return !process.env.AUTO_PUBLISH_DESKTOP;
}

function throwIfStopped() {
  if (isStopRequested()) {
    throw new Error("Stop requested");
  }
}

function waitForCondition(check, opts) {
  var options = opts || {};
  var timeoutMs = options.timeoutMs || 5 * 60 * 1000;
  var intervalMs = options.intervalMs || 2000;
  var deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    throwIfStopped();
    if (check()) {
      return true;
    }
    sleep(intervalMs);
  }

  return false;
}

module.exports = {
  resolveInteractive,
  throwIfStopped,
  waitForCondition
};
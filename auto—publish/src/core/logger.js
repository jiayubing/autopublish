const fs = require("fs");
const path = require("path");

const { DIRS } = require("../../scripts/config");

var listeners = [];

function ts() {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

function emit(entry) {
  for (var i = 0; i < listeners.length; i++) {
    try {
      listeners[i](entry);
    } catch (e) {}
  }
}

function log(message, type) {
  var level = type || "INFO";
  var entry = {
    ts: ts(),
    level: level,
    message: String(message),
    line: ""
  };

  entry.line = "[" + entry.ts + "] [" + entry.level + "] " + entry.message;
  console.log(entry.line);
  fs.mkdirSync(DIRS.logsDir, { recursive: true });
  fs.appendFileSync(path.join(DIRS.logsDir, "publish.log"), entry.line + "\n", "utf-8");
  emit(entry);
  return entry;
}

function subscribe(listener) {
  listeners.push(listener);
  return function unsubscribe() {
    listeners = listeners.filter(function(item) {
      return item !== listener;
    });
  };
}

module.exports = { ts, log, subscribe };

const task = process.argv[2];
var stopRequested = false;

if (!task) {
  console.error("Missing desktop worker task.");
  process.exit(1);
}

function send(type, payload) {
  if (typeof process.send === "function") {
    process.send({ type, payload });
  }
}

process.on("message", function(message) {
  if (!message || message.type !== "stop" || stopRequested) {
    return;
  }

  stopRequested = true;
  var ts = new Date().toISOString().replace("T", " ").substring(0, 19);
  send("log", {
    ts: ts,
    level: "WARN",
    message: "Stop requested; the current item will stop at the next safe point",
    line: "[" + ts + "] [WARN] Stop requested; the current item will stop at the next safe point"
  });
});

(async function main() {
  try {
    process.env.AUTO_PUBLISH_DESKTOP = "1";

    if (task === "snapshot") {
      const { createQueueSnapshot } = require("../../src/app/publish-batch");
      const options = process.argv[3] ? JSON.parse(process.argv[3]) : {};
      send("result", { ok: true, data: createQueueSnapshot(options) });
      return;
    }

    if (task === "batch") {
      const { clearStopSignal } = require("../../src/core/stop-signal");
      const { subscribe } = require("../../src/core/logger");
      const { runPublicationBatch } = require("../../src/app/publish-batch");
      clearStopSignal();
      const options = process.argv[3] ? JSON.parse(process.argv[3]) : {};
      const unsubscribe = subscribe(function(entry) {
        send("log", entry);
      });

      try {
        const result = await runPublicationBatch(Object.assign({}, options, {
          interactive: false,
          shouldStop: function() {
            return stopRequested;
          }
        }));
        send("result", { ok: true, data: result });
      } finally {
        unsubscribe();
      }
      return;
    }

    throw new Error("Unsupported desktop worker task: " + task);
  } catch (error) {
    send("result", { ok: false, error: error.message });
    process.exitCode = 1;
  }
})();
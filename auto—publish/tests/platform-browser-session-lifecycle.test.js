const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createBrowserSessionLifecycle,
} = require("../src/platforms/shared/browser-session-lifecycle");

describe("shared browser session lifecycle", function () {
  it("loads, starts, saves, and closes a platform session through one seam", function () {
    const calls = [];
    let alive = false;
    const lifecycle = createBrowserSessionLifecycle({
      session: { session: "fixture", stateFile: "fixture-state.json" },
      stateDir: "fixture-state",
      pwRun(command) {
        calls.push(command);
        if (command === "list") return alive ? "fixture" : "";
        if (command.startsWith("state-load")) return "";
        if (command.startsWith("state-save")) return "";
        if (command === "close") {
          alive = false;
          return "";
        }
        throw new Error("unexpected command");
      },
      quoteArg: (value) => value,
      fs: { existsSync: () => true },
      ensureDir: () => calls.push("mkdir"),
      sleep: () => {
        alive = true;
      },
      start: () => calls.push("start"),
      log: () => {},
    });
    lifecycle.ensureStarted();
    assert.equal(lifecycle.loadSavedState(), true);
    lifecycle.saveState();
    lifecycle.close();
    assert.deepEqual(calls, [
      "list",
      "start",
      "list",
      "state-load fixture-state.json",
      "mkdir",
      "state-save fixture-state.json",
      "mkdir",
      "state-save fixture-state.json",
      "close",
    ]);
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createBrowserSessionLifecycle,
} = require("../src/platforms/shared/browser-session-lifecycle");

describe("shared browser session lifecycle", function () {
  it("loads, starts, saves, and closes a platform session through one seam", function () {
    const calls = [];
    let alive = false;
    const stateFile =
      "fixture state & value|next<end>^group(1)%bang!hash#.json";
    const lifecycle = createBrowserSessionLifecycle({
      session: { session: "fixture", stateFile: stateFile },
      stateDir: "fixture-state",
      run(args) {
        calls.push(args);
        if (args[0] === "list") return alive ? "fixture" : "";
        if (args[0] === "state-load") return "";
        if (args[0] === "state-save") return "";
        if (args[0] === "close") {
          alive = false;
          return "";
        }
        throw new Error("unexpected command");
      },
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
      ["list"],
      "start",
      ["list"],
      ["state-load", stateFile],
      "mkdir",
      ["state-save", stateFile],
      "mkdir",
      ["state-save", stateFile],
      ["close"],
    ]);
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createBrowserSessionLifecycle,
  createStateFileLease,
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

  it("holds a state-file lease and atomically replaces only a completed browser state save", function () {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "autopublish-browser-state-"),
    );
    const stateFile = path.join(root, "lieju.json");
    const lease = createStateFileLease({ stateFile });
    fs.writeFileSync(stateFile, "old-state", "utf8");
    const lifecycle = createBrowserSessionLifecycle({
      session: { session: "lieju", stateFile },
      stateDir: root,
      stateLease: lease,
      atomicStateSave: true,
      run(args) {
        if (args[0] === "state-save") {
          fs.writeFileSync(args[1], "new-state", "utf8");
          return "";
        }
        if (args[0] === "close") return "";
        if (args[0] === "list") return "lieju";
        throw new Error("unexpected command");
      },
      ensureDir: () => {},
    });
    try {
      lifecycle.ensureStarted();
      lifecycle.saveState();
      assert.equal(fs.readFileSync(stateFile, "utf8"), "new-state");
      assert.equal(
        fs.readdirSync(root).some((name) => name.includes(".tmp-")),
        false,
      );
      lifecycle.close();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("starts a missing named session when the probe reports typed absence", function () {
    let starts = 0;
    let alive = false;
    const lifecycle = createBrowserSessionLifecycle({
      session: { session: "fixture" },
      run(args) {
        if (args[0] === "list") {
          if (!alive) {
            const error = new Error("session is not open");
            error.code = "PLAYWRIGHT_SESSION_NOT_OPEN";
            throw error;
          }
          return "fixture";
        }
        throw new Error("unexpected command");
      },
      start() {
        starts += 1;
        alive = true;
      },
      sleep() {},
      maxAttempts: 1,
    });

    lifecycle.ensureStarted();
    assert.equal(starts, 1);
  });
});

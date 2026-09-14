const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createAuthenticatedRuntime,
} = require("../desktop/services/authenticated-runtime");

describe("authenticated runtime seam", function () {
  it("starts once, exposes bootstrap state, and disposes idempotently", async function () {
    const calls = [];
    const runtime = createAuthenticatedRuntime({
      start: async (state) => {
        calls.push(["start", state.workspacePath]);
      },
      dispose: async () => {
        calls.push(["dispose"]);
      },
    });
    const first = runtime.start({ workspacePath: "fixture-workspace" });
    const second = runtime.start({ workspacePath: "ignored" });
    assert.strictEqual(await first, await second);
    assert.deepEqual(runtime.getState(), {
      phase: "running",
      workspacePath: "fixture-workspace",
    });
    await runtime.dispose();
    await runtime.dispose();
    assert.deepEqual(calls, [["start", "fixture-workspace"], ["dispose"]]);
    assert.equal(runtime.getState().phase, "stopped");
  });

  it("keeps authenticated callers joined to an in-flight workspace start", async function () {
    let releaseStart;
    let starts = 0;
    const startGate = new Promise((resolve) => {
      releaseStart = resolve;
    });
    const runtime = createAuthenticatedRuntime({
      start: async () => {
        starts += 1;
        await startGate;
      },
      dispose: async () => {},
    });

    const first = runtime.start({ workspacePath: "fixture-workspace" });
    assert.equal(runtime.getState().phase, "starting");

    let joinedResolved = false;
    const joined = runtime
      .start({ workspacePath: "ignored" })
      .then((state) => {
        joinedResolved = true;
        return state;
      });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(starts, 1);
    assert.equal(joinedResolved, false);

    releaseStart();
    const expected = {
      phase: "running",
      workspacePath: "fixture-workspace",
    };
    assert.deepEqual(await joined, expected);
    assert.deepEqual(await first, expected);
  });
});

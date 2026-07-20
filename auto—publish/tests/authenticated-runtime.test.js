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
});

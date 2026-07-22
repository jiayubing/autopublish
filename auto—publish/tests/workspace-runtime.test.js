const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createWorkspaceRuntime } = require("../desktop/services/workspace-runtime");

describe("workspace runtime", function() {
  it("owns services, IPC, subscriptions, invalidation and disposal", async function() {
    const calls = [];
    const runtime = createWorkspaceRuntime({
      sendToRenderer(channel, payload) { calls.push(["event", channel, payload.reasonCode]); },
      createServices(context, controls) {
        calls.push(["create", context.workspacePath]);
        controls.invalidate("PUBLICATION_RECONCILED");
        return { worker: { dispose() { calls.push(["worker-dispose"]); } } };
      },
      registerIpc({ services, invalidate, getRevision }) {
        calls.push(["ipc", Boolean(services.worker), getRevision()]);
        invalidate("MEDIA_SUBMIT_COMPLETED");
      },
      subscribe() { return () => calls.push(["unsubscribe"]); },
      disposeServices(services) { services.worker.dispose(); }
    });
    const state = await runtime.start({ workspacePath: "workspace-a" });
    assert.deepEqual(state, { phase: "running", workspacePath: "workspace-a", ipcRegistered: true, revision: 2 });
    runtime.registerIpc();
    await runtime.dispose();
    await runtime.dispose();
    assert.deepEqual(calls.map((call) => call[0]), ["create", "event", "ipc", "event", "unsubscribe", "worker-dispose"]);
    assert.deepEqual(runtime.getState(), { phase: "stopped", workspacePath: null, ipcRegistered: false, revision: 0 });
  });
});

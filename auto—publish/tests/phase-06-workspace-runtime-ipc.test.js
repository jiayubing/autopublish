const test = require("node:test");
const assert = require("node:assert/strict");

const { registerWorkspaceRuntimeIpc } = require("../desktop/ipc/workspace-runtime-ipc");

test("workspace runtime query returns only opaque identity and revision", async () => {
  const handlers = new Map();
  registerWorkspaceRuntimeIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    getWorkspaceRuntimeIdentity: () => ({
      workspaceRuntimeId: "runtime-fixture-1",
      revision: 7,
      workspacePath: "C:\\private\\workspace",
    }),
  });
  const result = await handlers.get("workspace:get-runtime-identity")();
  assert.deepEqual(result, {
    ok: true,
    data: { workspaceRuntimeId: "runtime-fixture-1", revision: 7 },
  });
});

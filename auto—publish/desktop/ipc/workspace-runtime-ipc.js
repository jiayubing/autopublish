const { ok } = require("../services/ipc-response");

function registerWorkspaceRuntimeIpc(deps) {
  if (!deps || !deps.ipcMain || typeof deps.getWorkspaceRuntimeIdentity !== "function") {
    throw new Error("Workspace runtime IPC dependencies are required");
  }
  deps.ipcMain.handle("workspace:get-runtime-identity", function() {
    const identity = deps.getWorkspaceRuntimeIdentity();
    return ok({
      workspaceRuntimeId: identity.workspaceRuntimeId,
      revision: identity.revision,
    });
  });
}

module.exports = { registerWorkspaceRuntimeIpc };

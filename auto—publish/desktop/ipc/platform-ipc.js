const { wrap } = require("../services/ipc-response");
const { createPlatformWorkbenchApplication } = require("../services/platform-workbench-application");

// The workspace composition supplies the application facade in production.
// The fallback is retained for isolated registrar tests only.
function registerPlatformIpc(deps) {
  const values = deps || {};
  if (!values.ipcMain || typeof values.ipcMain.handle !== "function")
    throw new Error("Platform IPC dependencies are required");
  const ipcMain = values.ipcMain;
  const application = values.platformApplication || createPlatformWorkbenchApplication(values);
  const invoke = (handler) => wrap(handler);

  ipcMain.handle("platforms:get-queue", () => invoke(() => application.getQueue()));
  ipcMain.handle("platforms:open-login", (event, input) => invoke(() => application.openLogin(input)));
  ipcMain.handle("platforms:check-login", (event, input) => invoke(() => application.checkLogin(input)));
  ipcMain.handle("platforms:pause-submit", (event, input) => invoke(() => application.pauseSubmit(input)));
  ipcMain.handle("platforms:stop-submit", (event, input) => invoke(() => application.stopSubmit(input)));
  ipcMain.handle("platforms:get-state", () => invoke(() => application.getState()));

  return { application };
}

module.exports = { registerPlatformIpc };

"use strict";

function createWindowIpcMain(ipcMain, getWindow) {
  return {
    handle(channel, handler) {
      ipcMain.handle(channel, (event, ...args) => {
        const window = getWindow();
        if (!window || window.isDestroyed() || window.webContents.isDestroyed() ||
            event.sender !== window.webContents || !event.senderFrame ||
            event.senderFrame !== window.webContents.mainFrame) {
          throw Object.assign(new Error("IPC sender is not allowed"), { code: "IPC_SENDER_INVALID" });
        }
        return handler(event, ...args);
      });
    },
    removeHandler(channel) { return ipcMain.removeHandler(channel); },
  };
}

module.exports = { createWindowIpcMain };

const { wrap } = require("../services/ipc-response");

function registerBatchIpc(deps) {
  var ipcMain = deps.ipcMain;
  var taskService = deps.taskService;
  var sendToRenderer = deps.sendToRenderer;

  ipcMain.handle("desktop:get-state", async function() {
    return wrap(function() {
      return Object.assign({}, taskService.getState(), { snapshot: taskService.refreshQueueSnapshot() });
    });
  });

  ipcMain.handle("desktop:refresh-queue", function(event, options) {
    return wrap(function() {
      return taskService.refreshQueueSnapshot(options || {});
    });
  });

  ipcMain.handle("desktop:start-batch", async function(event, options) {
    return wrap(function() {
      return taskService.startBatch(options || {}, {
        onLog: function(entry) { sendToRenderer("publish-log", entry); }
      });
    });
  });

  ipcMain.handle("desktop:stop-batch", function() {
    return wrap(function() {
      return taskService.stopBatch();
    });
  });
}

module.exports = { registerBatchIpc };

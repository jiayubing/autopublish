const { wrap } = require("../services/ipc-response");
const {
  createMediaWorkbenchApplication,
} = require("../services/media-workbench-application");

// Production receives the application facade from workspace composition. The
// local construction path exists for isolated registrar tests and keeps the
// transport adapter free of business wiring in the assembled application.
function registerMediaIpc(deps) {
  const values = deps || {};
  if (!values.ipcMain || typeof values.ipcMain.handle !== "function")
    throw new Error("Media IPC dependencies are required");
  const ipcMain = values.ipcMain;
  const application =
    values.mediaApplication || createMediaWorkbenchApplication(values);
  const invoke = (handler) => wrap(handler);

  ipcMain.handle("media:refresh-resources", (event, input) =>
    invoke(() => application.refreshResources(input)),
  );
  ipcMain.handle("media:get-resource-page", (event, input) =>
    invoke(() => application.getResourcePage(input)),
  );
  ipcMain.handle("media:search-resource-page", (event, input) =>
    invoke(() => application.searchResourcePage(input)),
  );
  ipcMain.handle("media:get-pool", (event, input) =>
    invoke(() => application.getPool(input)),
  );
  ipcMain.handle("media:add-to-pool", (event, resource) =>
    invoke(() => application.addToPool(resource)),
  );
  ipcMain.handle("media:remove-from-pool", (event, resourceId) =>
    invoke(() => application.removeFromPool(resourceId)),
  );
  ipcMain.handle("media:get-balance", () =>
    invoke(() => application.getBalance()),
  );
  ipcMain.handle("media:get-drafts", () =>
    invoke(() => application.getDrafts()),
  );
  ipcMain.handle("media:scan-articles", () =>
    invoke(() => application.scanArticles()),
  );
  ipcMain.handle("media:get-orders", () =>
    invoke(() => application.getOrders()),
  );
  ipcMain.handle("media:sync-order", (event, orderNid) =>
    invoke(() => application.syncOrder(orderNid)),
  );
  ipcMain.handle("media:sync-all-orders", () =>
    invoke(() => application.syncAllOrders()),
  );
  ipcMain.handle("media:prepare-order-cancellation", (event, input) =>
    invoke(() => application.prepareOrderCancellation(input)),
  );
  ipcMain.handle("media:cancel-order", (event, input) =>
    invoke(() => application.cancelOrder(input)),
  );
  ipcMain.handle("media:prepare-cancellation-resolution", (event, input) =>
    invoke(() => application.prepareCancellationResolution(input)),
  );
  ipcMain.handle("media:confirm-cancellation-succeeded", (event, input) =>
    invoke(() => application.confirmCancellationSucceeded(input)),
  );
  ipcMain.handle("media:confirm-cancellation-not-applied", (event, input) =>
    invoke(() => application.confirmCancellationNotApplied(input)),
  );
  ipcMain.handle(
    "media:prepare-order-status-anomaly-resolution",
    (event, input) =>
      invoke(() => application.prepareOrderStatusAnomalyResolution(input)),
  );
  ipcMain.handle("media:resume-order-tracking", (event, input) =>
    invoke(() => application.resumeOrderTracking(input)),
  );
  ipcMain.handle("media:confirm-order-published", (event, input) =>
    invoke(() => application.confirmOrderPublished(input)),
  );
  ipcMain.handle("media:confirm-order-not-published", (event, input) =>
    invoke(() => application.confirmOrderNotPublished(input)),
  );
  ipcMain.handle("media:open-published-url", (event, orderNid) =>
    invoke(() => application.openPublishedUrl(orderNid)),
  );
  ipcMain.handle("media:prepare-bind-paid-order-number", (event, input) =>
    invoke(() => application.prepareBindPaidOrderNumber(input)),
  );
  ipcMain.handle("media:bind-paid-order-number", (event, input) =>
    invoke(() => application.bindPaidOrderNumber(input)),
  );
  ipcMain.handle("media:prepare-confirm-paid-order-absent", (event, input) =>
    invoke(() => application.prepareConfirmPaidOrderAbsent(input)),
  );
  ipcMain.handle("media:confirm-paid-order-absent", (event, input) =>
    invoke(() => application.confirmPaidOrderAbsent(input)),
  );

  return { application };
}

module.exports = { registerMediaIpc };

const path = require("path");
const {
  MediaResourceStore,
} = require("../../src/platforms/media/media-resource-store");
const {
  MediaPoolStore,
} = require("../../src/platforms/media/media-pool-store");
const {
  MediaDraftStore,
} = require("../../src/platforms/media/media-draft-store");
const {
  createMediaSupplierAdapter,
} = require("../../src/platforms/media/media-supplier-adapter");
const { createMediaOrderService } = require("./media-order-service");
const {
  createOrderCancellationService,
} = require("./order-cancellation-service");
const { createMediaWorkbenchService } = require("./media-workbench-service");
const { createMediaResourceService } = require("./media-resource-service");
const {
  createPaidMediaPreflightService,
} = require("./paid-media-preflight-service");
const {
  projectMediaResource,
  projectMediaDraft,
  projectMediaArticleSummary,
  projectMediaResourcePage,
  projectMediaPoolPage,
  projectMediaRefreshResult,
  projectMediaOrder,
} = require("../application/read-models/media-read-model");

function resolveMediaInputDir(values) {
  if (values.paths && values.paths.mediaInput) return values.paths.mediaInput;
  return path.join(
    values.rootDir || path.resolve(__dirname, "..", ".."),
    "input",
    "media",
  );
}

function createMediaClientProvider(values) {
  if (typeof values.mediaClientProvider === "function")
    return values.mediaClientProvider;
  return function () {
    if (!values.platformSettingsService) {
      const error = new Error("付费媒体配置未设置");
      error.code = "MEDIA_CONFIG_NOT_SET";
      throw error;
    }
    const runtime =
      values.platformSettingsService.getAdapterForRuntime("media");
    if (
      !runtime ||
      !runtime.adapter ||
      typeof runtime.adapter.createClient !== "function"
    ) {
      const error = new Error("付费媒体配置未设置");
      error.code = "MEDIA_CONFIG_NOT_SET";
      throw error;
    }
    return runtime.adapter.createClient(runtime.config);
  };
}

function createMediaWorkbenchApplication(options) {
  const values = options || {};
  const clientProvider = createMediaClientProvider(values);
  const supplierProvider =
    typeof values.mediaSupplierProvider === "function"
      ? values.mediaSupplierProvider
      : function () {
          return createMediaSupplierAdapter({ clientProvider });
        };
  const resourceStore =
    values.resourceStore || new MediaResourceStore({ paths: values.paths });
  const poolStore =
    values.poolStore || new MediaPoolStore({ paths: values.paths });
  const draftStore =
    values.draftStore || new MediaDraftStore({ paths: values.paths });
  const resourceService =
    values.mediaResourceService ||
    createMediaResourceService({
      resourceStore,
      poolStore,
      clientProvider,
      supplierProvider,
    });
  const orderService =
    values.mediaOrderService ||
    createMediaOrderService({
      supplierProvider,
      orderObservationTransitions: values.orderObservationTransitions,
      openExternal: values.openExternal,
      clock: values.clock,
    });
  const orderCancellationService =
    values.orderCancellationService ||
    (values.orderCancellationTransitions
      ? createOrderCancellationService({
          supplierProvider,
          orderCancellationTransitions: values.orderCancellationTransitions,
        })
      : null);
  const workbenchService =
    values.mediaWorkbenchService ||
    createMediaWorkbenchService({
      inputDir: resolveMediaInputDir(values),
      draftStore,
      paths: values.paths,
      clientProvider,
    });
  const paidMediaPreflightService =
    values.paidMediaPreflightService ||
    (values.contentStore && values.paidAdmissionFacade
      ? createPaidMediaPreflightService({
          contentStore: values.contentStore,
          paidAdmission: values.paidAdmissionFacade,
          mediaPoolStore: poolStore,
          lifecycleFacts: values.paidLifecycleFacts,
          resourceService,
          clientSnapshotResolver: values.clientSnapshotResolver,
          systemSubmissionCodeProvider: values.systemSubmissionCodeProvider,
          clock: values.clock,
        })
      : null);
  const paidMediaBatchOrchestrator = values.paidMediaBatchOrchestrator || null;
  const invalidateData =
    typeof values.invalidateData === "function" ? values.invalidateData : null;

  function cancellationService() {
    if (!orderCancellationService) {
      const error = new Error("Order cancellation is unavailable");
      error.code = "ORDER_CANCELLATION_UNAVAILABLE";
      throw error;
    }
    return orderCancellationService;
  }

  function projectOrderWithCancellation(order) {
    return projectMediaOrder({
      ...order,
      cancellation: orderCancellationService
        ? orderCancellationService.getOrderCancellationView({
            orderId: order.orderNid,
          })
        : null,
    });
  }

  function orderMutation(command, reasonCode, changed) {
    return Promise.resolve()
      .then(command)
      .then(
        (result) => {
          if (
            invalidateData &&
            (typeof changed === "function"
              ? changed(result)
              : !result || result.idempotent !== true)
          )
            invalidateData(reasonCode);
          return result;
        },
        (error) => {
          if (
            invalidateData &&
            error &&
            error.mutation &&
            error.mutation.changed === true
          )
            invalidateData(reasonCode);
          throw error;
        },
      );
  }

  return Object.freeze({
    refreshResources: (input) =>
      Promise.resolve(resourceService.refreshResources(input || {})).then(
        projectMediaRefreshResult,
      ),
    getResourcePage: (input) =>
      projectMediaResourcePage(
        resourceService.getCachedResourcePage(input || {}),
      ),
    searchResourcePage: (input) =>
      projectMediaResourcePage(resourceService.searchResourcePage(input || {})),
    getPool: (input) =>
      projectMediaPoolPage(resourceService.getPoolPage(input || {})),
    addToPool: (resource) => ({
      resource: projectMediaResource(resourceService.addToPool(resource)),
    }),
    removeFromPool: (resourceId) => {
      resourceService.removeFromPool(resourceId);
      return { completed: true };
    },
    getBalance: () => resourceService.getBalance(),
    getDrafts: () => {
      const drafts = draftStore.getAll();
      return {
        items: Object.keys(drafts).map((filename) =>
          projectMediaDraft(filename, drafts[filename]),
        ),
      };
    },
    scanArticles: () =>
      Promise.resolve(workbenchService.scanArticles()).then((items) => ({
        items: items.map(projectMediaArticleSummary),
      })),
    preflightPaidMedia: async (input) => {
      if (
        !paidMediaPreflightService ||
        typeof paidMediaPreflightService.preflight !== "function"
      ) {
        const error = new Error("Paid media preflight is unavailable");
        error.code = "PAID_MEDIA_PREFLIGHT_UNAVAILABLE";
        throw error;
      }
      return paidMediaPreflightService.preflight(input || {});
    },
    confirmPaidMedia: async (input) => {
      if (
        !paidMediaPreflightService ||
        typeof paidMediaPreflightService.confirm !== "function"
      ) {
        const error = new Error("Paid media confirmation is unavailable");
        error.code = "PAID_MEDIA_PREFLIGHT_UNAVAILABLE";
        throw error;
      }
      return paidMediaPreflightService.confirm(input || {});
    },
    getPaidMediaBatches: () => {
      if (
        !paidMediaBatchOrchestrator ||
        typeof paidMediaBatchOrchestrator.snapshot !== "function"
      )
        return { items: [] };
      return { items: paidMediaBatchOrchestrator.snapshot({}) };
    },
    startPaidMediaBatch: (input) => {
      if (
        !paidMediaBatchOrchestrator ||
        typeof paidMediaBatchOrchestrator.startBatch !== "function"
      ) {
        const error = new Error("Paid media execution is unavailable");
        error.code = "PAID_MEDIA_EXECUTION_UNAVAILABLE";
        throw error;
      }
      const batchId = input && input.batchId;
      return Promise.resolve(
        paidMediaBatchOrchestrator.startBatch(input || {}),
      ).then((execution) => ({
        executionStatus:
          execution && typeof execution.status === "string"
            ? execution.status
            : "idle",
        batch: paidMediaBatchOrchestrator.snapshot({ batchId })[0],
      }));
    },
    pausePaidMediaBatch: (input) => {
      if (
        !paidMediaBatchOrchestrator ||
        typeof paidMediaBatchOrchestrator.pauseBatch !== "function"
      ) {
        const error = new Error("Paid media execution is unavailable");
        error.code = "PAID_MEDIA_EXECUTION_UNAVAILABLE";
        throw error;
      }
      return {
        batch: paidMediaBatchOrchestrator.pauseBatch(input || {}),
      };
    },
    cancelRemainingPaidMediaBatchItems: (input) => {
      if (
        !paidMediaBatchOrchestrator ||
        typeof paidMediaBatchOrchestrator.cancelRemaining !== "function"
      ) {
        const error = new Error("Paid media execution is unavailable");
        error.code = "PAID_MEDIA_EXECUTION_UNAVAILABLE";
        throw error;
      }
      return Promise.resolve()
        .then(() => paidMediaBatchOrchestrator.cancelRemaining(input || {}))
        .then((result) => {
          if (invalidateData && result && result.cancelledCount > 0)
            invalidateData("PAID_BATCH_REMAINING_CANCELLED");
          return {
            executionStatus:
              result && typeof result.status === "string"
                ? result.status
                : "remaining_cancelled",
            cancelledCount: result?.cancelledCount || 0,
            idempotentCount: result?.idempotentCount || 0,
            skippedCount: result?.skippedCount || 0,
            batch: result && result.batch,
          };
        });
    },
    // The attention center needs the operational identity that the public
    // media order projection intentionally omits.
    listOrderAttention: () => orderService.listOrderViews(),
    getOrders: () => ({
      items: orderService.listOrderViews().map(projectOrderWithCancellation),
    }),
    prepareOrderCancellation: (input) =>
      cancellationService().prepareOrderCancellation(input || {}),
    cancelOrder: (input) =>
      orderMutation(
        () => cancellationService().cancelOrder(input || {}),
        "PAID_ORDER_CANCELLATION_CHANGED",
      ),
    prepareCancellationResolution: (input) =>
      cancellationService().prepareCancellationResolution(input || {}),
    confirmCancellationSucceeded: (input) =>
      orderMutation(
        () => cancellationService().confirmCancellationSucceeded(input || {}),
        "PAID_ORDER_CANCELLATION_CHANGED",
      ),
    confirmCancellationNotApplied: (input) =>
      orderMutation(
        () => cancellationService().confirmCancellationNotApplied(input || {}),
        "PAID_ORDER_CANCELLATION_CHANGED",
      ),
    syncOrder: async (orderNid) => {
      await orderMutation(
        () => orderService.syncOrder(orderNid),
        "PAID_ORDER_OBSERVATION_CHANGED",
      );
      const order = orderService
        .listOrderViews()
        .filter((item) => String(item.orderNid) === String(orderNid))[0];
      if (!order) {
        const error = new Error("Order projection is unavailable");
        error.code = "IPC_INTERNAL";
        throw error;
      }
      return { order: projectOrderWithCancellation(order) };
    },
    syncAllOrders: () =>
      orderMutation(
        () => orderService.syncAllOrders(),
        "PAID_ORDER_OBSERVATION_CHANGED",
        (result) => Number(result && result.mutationCount) > 0,
      ).then((result) => ({
        items: Array.isArray(result && result.items) ? result.items : [],
        succeeded: Number(result && result.succeeded) || 0,
        failed: Number(result && result.failed) || 0,
      })),
    prepareOrderStatusAnomalyResolution: (input) =>
      orderService.prepareOrderStatusAnomalyResolution(input || {}),
    resumeOrderTracking: (input) =>
      orderMutation(
        () => orderService.resumeOrderTracking(input || {}),
        "PAID_ORDER_STATUS_ANOMALY_RESOLVED",
      ),
    confirmOrderPublished: (input) =>
      orderMutation(
        () => orderService.confirmOrderPublished(input || {}),
        "PAID_ORDER_STATUS_ANOMALY_RESOLVED",
      ),
    confirmOrderNotPublished: (input) =>
      orderMutation(
        () => orderService.confirmOrderNotPublished(input || {}),
        "PAID_ORDER_STATUS_ANOMALY_RESOLVED",
      ),
    openPublishedUrl: (orderNid) => orderService.openPublishedUrl(orderNid),
  });
}

module.exports = { createMediaWorkbenchApplication };

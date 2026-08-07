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
const { createMediaWorkbenchService } = require("./media-workbench-service");
const { createMediaResourceService } = require("./media-resource-service");
const {
  createPaidMediaPreflightService,
} = require("./paid-media-preflight-service");
const { validateDraft } = require("./submission-boundary");
const {
  projectMediaResource,
  projectMediaDraft,
  projectMediaArticleSummary,
  projectMediaArticlePreview,
  projectMediaResourcePage,
  projectMediaPoolPage,
  projectMediaRefreshResult,
  projectMediaOrder,
} = require("../ipc/contracts/media-contracts");

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
      paths: values.paths,
      clientProvider,
      supplierProvider,
      operationalStore: values.operationalStore,
      openExternal: values.openExternal,
    });
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
          lifecycleFacts: values.paidLifecycleFacts,
          resourceService,
          systemSubmissionCodeProvider: values.systemSubmissionCodeProvider,
          clock: values.clock,
        })
      : null);
  const paidMediaBatchOrchestrator = values.paidMediaBatchOrchestrator || null;
  const paidOrderCreationResolutionService =
    values.paidOrderCreationResolutionService || null;
  const invalidateData =
    typeof values.invalidateData === "function" ? values.invalidateData : null;

  function resolutionService() {
    if (!paidOrderCreationResolutionService) {
      const error = new Error("Paid order resolution is unavailable");
      error.code = "PAID_ORDER_RESOLUTION_UNAVAILABLE";
      throw error;
    }
    return paidOrderCreationResolutionService;
  }

  function resolved(command) {
    return Promise.resolve(command()).then((result) => {
      if (invalidateData) invalidateData("PAID_ORDER_RESOLUTION_CHANGED");
      return result;
    });
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
    getDraft: (filename) => {
      workbenchService.resolveSubmissionFile(filename);
      const draft = draftStore.get(filename);
      return { draft: draft ? projectMediaDraft(filename, draft) : null };
    },
    setDraft: (filename, draft) => {
      workbenchService.resolveSubmissionFile(filename);
      draftStore.set(filename, validateDraft(draft));
      return { completed: true };
    },
    scanArticles: () =>
      Promise.resolve(workbenchService.scanArticles()).then((items) => ({
        items: items.map(projectMediaArticleSummary),
      })),
    previewArticle: (filename) =>
      Promise.resolve(workbenchService.previewArticle(filename)).then(
        (article) => ({
          article: projectMediaArticlePreview(article),
        }),
      ),
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
    prepareBindPaidOrderNumber: (input) =>
      resolutionService().prepareBindOrderNumber(input || {}),
    bindPaidOrderNumber: (input) =>
      resolved(() => resolutionService().bindOrderNumber(input || {})),
    prepareConfirmPaidOrderAbsent: (input) =>
      resolutionService().prepareConfirmNoOrder(input || {}),
    confirmPaidOrderAbsent: (input) =>
      resolved(() => resolutionService().confirmNoOrder(input || {})),
    getOrders: () => ({
      items: orderService.listOrderViews().map(projectMediaOrder),
    }),
    syncOrder: async (orderNid) => {
      await orderService.syncOrder(orderNid);
      const order = orderService
        .listOrderViews()
        .filter((item) => String(item.orderNid) === String(orderNid))[0];
      if (!order) {
        const error = new Error("Order projection is unavailable");
        error.code = "IPC_INTERNAL";
        throw error;
      }
      return { order: projectMediaOrder(order) };
    },
    openPublishedUrl: (orderNid) => orderService.openPublishedUrl(orderNid),
  });
}

module.exports = { createMediaWorkbenchApplication };

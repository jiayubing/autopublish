function createMediaWorkbenchComposition(options) {
  const {
    paths,
    workspaceRoot,
    platformSettingsService,
    contentStore,
    operationalStoreTransitionPorts,
    articleMutationCoordinator,
    invalidation,
    openExternal,
    reportCompositionDiagnostic,
  } = options;
  const mediaClientProvider = function () {
    const mediaRuntime = platformSettingsService.getAdapterForRuntime("media");
    return mediaRuntime.adapter.createClient(mediaRuntime.config);
  };
  const paidOrderCreationSupplier =
    require("../../src/platforms/media/media-supplier-adapter").createMediaSupplierAdapter(
      {
        clientProvider: mediaClientProvider,
      },
    );
  const paidOrderCreationPort = Object.freeze({
    createOrder: paidOrderCreationSupplier.createOrder,
  });
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
    createMediaResourceService,
    matchesPaidQuote,
  } = require("../services/media-resource-service");
  const mediaResourceStore = new MediaResourceStore({ paths });
  const mediaPoolStore = new MediaPoolStore({ paths });
  const mediaDraftStore = new MediaDraftStore({ paths });
  const mediaSupplierProvider = function () {
    return paidOrderCreationSupplier;
  };
  const paidOrderDetailsQueryPort = Object.freeze({
    getOrderDetails: function (orderIds) {
      return mediaSupplierProvider().getOrderDetails(orderIds);
    },
  });
  const mediaResourceService = createMediaResourceService({
    resourceStore: mediaResourceStore,
    poolStore: mediaPoolStore,
    clientProvider: mediaClientProvider,
    supplierProvider: mediaSupplierProvider,
  });
  const paidMediaRecheck = async function (claim) {
    const target = claim && claim.targetIdentityV1;
    let resource;
    try {
      resource = await mediaResourceService.queryCurrentResource(
        target && target.mediaResourceId,
      );
    } catch (_) {
      return { reasonCode: "PAID_ORDER_PRECHECK_FAILED" };
    }
    if (
      !matchesPaidQuote(resource, {
        resourceId: target && target.mediaResourceId,
        price: claim.quotedPrice,
      })
    )
      return { reasonCode: "PAID_MEDIA_CONFIRMATION_STALE" };
    let article;
    try {
      article = contentStore.getArticle(
        claim.articleIdentityV1.clientId,
        claim.articleIdentityV1.articleId,
      );
    } catch (_) {
      article = null;
    }
    const { fingerprintArticle } = require("../../src/content/content-store");
    if (
      !article ||
      !claim.publicationSnapshot ||
      fingerprintArticle(article) !== claim.publicationSnapshot.fingerprint
    )
      return { reasonCode: "PAID_MEDIA_CONFIRMATION_STALE" };
    let systemSubmissionCode = "";
    try {
      systemSubmissionCode =
        platformSettingsService.getRuntimeConfig("media").thirdPartyId || "";
    } catch (_) {
      reportCompositionDiagnostic(
        "WORKSPACE_MEDIA_CODE_READ_FAILED",
        "media-code-read",
      );
    }
    if (
      !systemSubmissionCode ||
      systemSubmissionCode !== claim.systemSubmissionCode
    )
      return { reasonCode: "PAID_MEDIA_SYSTEM_SUBMISSION_CODE_CHANGED" };
    return null;
  };
  const paidMediaBatchComposition =
    require("./paid-media-batch-composition").createPaidMediaBatchComposition({
      paidExecutionTransitions:
        operationalStoreTransitionPorts.paidExecutionTransitions,
      orderCreationResolutionTransitions:
        operationalStoreTransitionPorts.orderCreationResolutionTransitions,
      orderDetailsQueryPort: paidOrderDetailsQueryPort,
      orderCreationPort: paidOrderCreationPort,
      recheckPaidOrder: paidMediaRecheck,
    });
  const mediaApplication =
    require("../services/media-workbench-application").createMediaWorkbenchApplication(
      {
        paths,
        rootDir: workspaceRoot,
        platformSettingsService,
        resourceStore: mediaResourceStore,
        poolStore: mediaPoolStore,
        draftStore: mediaDraftStore,
        mediaResourceService,
        mediaSupplierProvider,
        orderObservationTransitions:
          operationalStoreTransitionPorts.orderObservationTransitions,
        orderCancellationTransitions:
          operationalStoreTransitionPorts.orderCancellationTransitions,
        contentStore,
        paidAdmissionFacade: Object.freeze({
          admitPaidBatch: articleMutationCoordinator.admitPaidBatch,
        }),
        clientSnapshotResolver: function (clientId) {
          const client =
            require("../../src/content/client-knowledge").getClient(
              workspaceRoot,
              clientId,
            );
          return {
            version: 1,
            clientId: client.id,
            displayName: client.name,
          };
        },
        paidLifecycleFacts:
          operationalStoreTransitionPorts.paidAdmissionTransitions,
        paidMediaBatchOrchestrator: paidMediaBatchComposition.orchestrator,
        systemSubmissionCodeProvider: function () {
          try {
            return (
              platformSettingsService.getRuntimeConfig("media").thirdPartyId ||
              ""
            );
          } catch (error) {
            if (error && error.code !== "PLATFORM_CONFIG_NOT_SET") throw error;
            return "";
          }
        },
        openExternal: openExternal,
        invalidateData: invalidation.invalidate,
      },
    );
  return { paidMediaBatchComposition, mediaApplication };
}

module.exports = { createMediaWorkbenchComposition };

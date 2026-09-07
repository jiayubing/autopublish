"use strict";
const {
  productionIpcRegistry,
} = require("../ipc/contracts/production-registry");
const {
  reportDiagnostic,
} = require("../../src/diagnostics/diagnostic-producer");

function reportCompositionDiagnostic(code, operation) {
  reportDiagnostic({
    code,
    module: "workspace-runtime-composition",
    category: "lifecycle",
    operationId: operation || "composition",
    metadata: { action: operation || "composition" },
  });
}

function subscribeGenerationRuntimeState(
  contentGenerationBatchService,
  sendToRenderer,
) {
  if (
    !contentGenerationBatchService ||
    typeof contentGenerationBatchService.subscribe !== "function"
  )
    return function () {};
  const eventContract = productionIpcRegistry.byCapability(
    "generation.runtimeChanged",
  );
  return contentGenerationBatchService.subscribe(function (value) {
    sendToRenderer(
      eventContract.channel,
      productionIpcRegistry.event(eventContract, value),
    );
  });
}

// This module owns the workspace-level runtime lifecycle and connects the
// domain compositions. Platform/runtime and content-production construction
// stay behind their own composition boundaries.
async function createWorkspaceRuntimeComposition(deps) {
  const values = deps || {};
  const options = values.options || {};
  const sendToRenderer = values.sendToRenderer;
  const bootstrapState = values.bootstrapState || {};
  const invalidation = values.invalidation;
  if (!invalidation || typeof invalidation.invalidate !== "function")
    throw new Error("Workspace composition requires invalidation");
  let runtime = null;
  let modules = null;
  let ipcDeps = null;
  let articleLifecycleOwner = null;
  let disposers = [];
  let disposerSet = new Set();
  let ownedServices = [];
  let disposed = false;

  function ownService(service) {
    if (
      service &&
      typeof service.dispose === "function" &&
      !ownedServices.includes(service)
    )
      ownedServices.push(service);
    return service;
  }

  function ownDisposer(dispose) {
    if (typeof dispose === "function" && !disposerSet.has(dispose)) {
      disposerSet.add(dispose);
      disposers.push(dispose);
    }
    return dispose;
  }

  function current(name) {
    return (modules && modules[name]) || null;
  }

  function taskState() {
    const service = current("taskService");
    return service && service.getState ? service.getState() : null;
  }

  function collectionState() {
    const service = current("doubaoCollectionService");
    return service && service.getQueueState ? service.getQueueState() : null;
  }

  function generationState() {
    const service = current("contentGenerationBatchService");
    return service && service.getState ? service.getState() : null;
  }

  function contentGenerationState() {
    const service = current("aiContentService");
    return service && service.getState ? service.getState() : null;
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    const pending = disposers.splice(0).reverse();
    disposerSet.clear();
    for (const release of pending) {
      try {
        await release();
      } catch (_) {
        reportCompositionDiagnostic("WORKSPACE_DISPOSER_FAILED", "disposer");
      }
    }
    const services = ownedServices.splice(0).reverse();
    for (const service of services) {
      try {
        await service.dispose();
      } catch (_) {
        reportCompositionDiagnostic(
          "WORKSPACE_SERVICE_DISPOSE_FAILED",
          "service-dispose",
        );
      }
    }
    modules = null;
    articleLifecycleOwner = null;
    ipcDeps = null;
    runtime = null;
  }

  try {
    const configureRuntimeEnvironment =
      require("../runtime-paths").configureRuntimeEnvironment;
    runtime = configureRuntimeEnvironment({
      workspaceRoot: bootstrapState.workspacePath,
      appRoot: options.appRoot,
      resourcesPath: options.resourcesPath,
      roamingConfigRoot: options.userDataPath,
      localStateRoot: options.sessionDataPath,
    });
    if (
      runtime.diagnosticsService &&
      typeof runtime.diagnosticsService.report === "function"
    ) {
      const {
        setDiagnosticReporter,
      } = require("../../src/diagnostics/diagnostic-producer");
      const reporter = runtime.diagnosticsService.report;
      ownDisposer(setDiagnosticReporter(reporter));
    }
    const paths = runtime.paths;
    const injectedPaths = paths && paths.installation ? paths : undefined;
    const workspaceRoot = runtime.workspaceRoot;
    const clientImageLibrary =
      require("../../src/content/client-image-library").createClientImageLibrary(
        {
          workspaceRoot,
          paths: injectedPaths,
          imageDirectoryName: paths.clientImageDirectoryName,
        },
      );
    const operationalStoreTransitionPorts = {};
    let contentStore = null;
    const operationalStore =
      require("../../src/infrastructure/operational-store/operational-store").createOperationalStore(
        {
          workspaceRoot,
          clock: options.clock,
          transitionPorts: operationalStoreTransitionPorts,
        },
      );
    ownService({
      dispose: function () {
        operationalStore.close();
      },
    });

    const platformRuntimeComposition = ownService(
      await require("./platform-runtime-composition").createPlatformRuntimeComposition(
        {
          workspaceRoot,
          paths,
          userDataPath: options.userDataPath,
          safeStorage: options.safeStorage,
          operationalStore,
          clientImageLibrary,
          getTaskState: taskState,
          diagnosticsService: runtime.diagnosticsService,
        },
      ),
    );
    const directoryEntries = platformRuntimeComposition.directoryEntries;
    const regularDirectoryEntries =
      platformRuntimeComposition.regularDirectoryEntries;
    const regularSubmissionPorts =
      platformRuntimeComposition.regularSubmissionPorts;
    const remoteReviewPorts = platformRuntimeComposition.remoteReviewPorts;
    const loginSessionPorts = platformRuntimeComposition.loginSessionPorts;
    const legacyQueuePorts = platformRuntimeComposition.legacyQueuePorts;
    const clientProfileReaders =
      platformRuntimeComposition.clientProfileReaders;
    const submissionPlatformDirectory =
      platformRuntimeComposition.submissionPlatformDirectory;
    const platformSettingsService =
      platformRuntimeComposition.platformSettingsService;
    const platformAccountProfileService =
      platformRuntimeComposition.platformAccountProfileService;
    const accountInspector = platformRuntimeComposition.accountInspector;
    const platformSessionService =
      platformRuntimeComposition.platformSessionService;

    const contentLifecycleComposition = ownService(
      require("./content-lifecycle-composition").createContentLifecycleComposition(
        {
          workspaceRoot,
          paths: injectedPaths,
          publicationTransitions:
            operationalStoreTransitionPorts.publicationTransitions,
          lifecycleFacts:
            operationalStoreTransitionPorts.publicationTransitions,
          regularQueueTransitions:
            operationalStoreTransitionPorts.regularQueueTransitions,
          paidAdmissionTransitions:
            operationalStoreTransitionPorts.paidAdmissionTransitions,
          systemSubmissionCodeProvider: function () {
            try {
              return (
                platformSettingsService.getRuntimeConfig("media")
                  .thirdPartyId || ""
              );
            } catch (error) {
              if (error && error.code !== "PLATFORM_CONFIG_NOT_SET")
                throw error;
              return "";
            }
          },
          clock: options.clock,
        },
      ),
    );
    contentStore = contentLifecycleComposition.contentStore;
    const articleMutationCoordinator =
      contentLifecycleComposition.articleMutationCoordinator;
    const regularQueueApplication =
      require("../services/regular-queue-application").createRegularQueueApplication(
        {
          contentStore,
          articleMutationCoordinator,
          regularQueueTransitions:
            operationalStoreTransitionPorts.regularQueueTransitions,
          regularQueueGroupTransitions:
            operationalStoreTransitionPorts.regularQueueGroupTransitions,
          regularQueueGroupImageCountTransitions:
            operationalStoreTransitionPorts.regularQueueGroupImageCountTransitions,
          regularQueueGroupSubmissionIntervalTransitions:
            operationalStoreTransitionPorts.regularQueueGroupSubmissionIntervalTransitions,
          onDataInvalidated: invalidation.invalidate,
          accountProfileResolver: platformAccountProfileService.assertBound,
          clientSnapshotResolver: function (clientId) {
            const client =
              require("../../src/content/client-knowledge").getClient(
                workspaceRoot,
                clientId,
              );
            return {
              version: 1,
              clientId,
              displayName: client.name || clientId,
            };
          },
          platforms: regularDirectoryEntries,
        },
      );
    const createDesktopTaskService =
      require("../services/desktop-task-service").createDesktopTaskService;
    const taskService = ownService(
      createDesktopTaskService({
        cwd: workspaceRoot,
        paths: injectedPaths,
        invalidateData: invalidation.invalidate,
        workspaceRuntimeId: invalidation.getWorkspaceRuntimeId(),
        platformSettingsService,
        loginSessionPorts,
      }),
    );
    const autoTrashArticle = async function (selection) {
      if (
        contentStore &&
        typeof contentStore.isArticleTrashed === "function" &&
        contentStore.isArticleTrashed(selection.clientId, selection.articleId)
      )
        return { status: "committed", idempotent: true };
      if (
        !articleLifecycleOwner ||
        typeof articleLifecycleOwner.previewArticleRemovalImpact !==
          "function" ||
        typeof articleLifecycleOwner.trashArticles !== "function"
      )
        return { status: "blocked", reasonCode: "REMOVAL_BLOCKED" };
      const preview = articleLifecycleOwner.previewArticleRemovalImpact({
        selections: [selection],
      });
      if (!preview || preview.canCommit !== true) {
        const reason =
          preview &&
          Array.isArray(preview.blockedItems) &&
          preview.blockedItems[0] &&
          preview.blockedItems[0].reasonCode;
        return {
          status: "blocked",
          reasonCode:
            reason === "IDENTITY_MISSING" || reason === "REMOVAL_NEEDS_REPAIR"
              ? reason
              : "REMOVAL_BLOCKED",
        };
      }
      return articleLifecycleOwner.trashArticles({
        selections: [selection],
        token: preview.token,
        confirmed: true,
      });
    };
    const publicationRecoveryComposition = ownService(
      require("./publication-recovery-composition").createPublicationRecoveryComposition(
        {
          workspaceRoot,
          operationalStore,
          articleMutationCoordinator,
          createPostProcessor: function (store) {
            return require("../services/publication-post-processor").createPublicationPostProcessor(
              {
                workspaceRoot,
                paths: injectedPaths,
                platforms: directoryEntries,
                operationalStore: store,
                autoTrashArticle,
              },
            );
          },
        },
      ),
    );
    const legacyProviderSettings =
      require("../runtime-config").createLegacyProviderSettingsMigration({
        configRoot: options.userDataPath,
        workspaceRoot,
        runtimeConfigStore: runtime.runtimeConfigStore,
        platformSettingsService,
      });
    const submissionMaintenance = ownService(
      require("../services/submission-maintenance-service").createSubmissionMaintenanceService(
        {
          workspaceRoot,
          paths: injectedPaths,
          contentStore,
          operationalStore: publicationRecoveryComposition.operationalStore,
          directoryEntries: regularDirectoryEntries,
          onDataInvalidated: invalidation.invalidate,
        },
      ),
    );
    const articleRemovalImpactQuery =
      require("../services/article-submission-removal-coordinator").createArticleSubmissionRemovalCoordinator(
        {
          lifecycleFacts: publicationRecoveryComposition.operationalStore,
        },
      );
    submissionMaintenance.recoverPreparedBatches();

    const contentProductionComposition = ownService(
      await require("./content-production-composition").createContentProductionComposition(
        {
          workspaceRoot,
          paths: injectedPaths,
          userDataPath: options.userDataPath,
          safeStorage: options.safeStorage,
          contentStore,
          operationalStore: publicationRecoveryComposition.operationalStore,
          articleMutationCoordinator,
          articleRemovalTransactionStore:
            contentLifecycleComposition.articleRemovalTransactionStore,
          articleRemovalTransitionPort:
            contentLifecycleComposition.articleRemovalTransitionPort,
          articleRemovalImpactQuery,
          onDataInvalidated: invalidation.invalidate,
          sendToRenderer,
          runtimeDiagnosticsService: runtime.diagnosticsService,
          getBatchState: function () {
            return generationState() || taskState() || {};
          },
        },
      ),
    );
    const doubaoCollectionService =
      contentProductionComposition.doubaoCollectionService;
    const aiProviderService = contentProductionComposition.aiProviderService;
    const aiContentService = contentProductionComposition.aiContentService;
    const contentGenerationBatchService =
      contentProductionComposition.contentGenerationBatchService;
    articleLifecycleOwner = contentProductionComposition.articleLifecycleOwner;

    await publicationRecoveryComposition.publicationRecovery.recover();
    contentProductionComposition.start();

    const adapters = {};
    legacyQueuePorts.forEach(function (platform) {
      adapters[platform.id] = platform.port;
    });
    const regularImagePlanService =
      require("../services/regular-image-plan-service").createRegularImagePlanService(
        { imageSelectionPort: clientImageLibrary.imageSelectionPort },
      );
    const platformSubmissionExecutor =
      require("../services/regular-platform-preparation-port").createRegularPlatformPreparationPort(
        {
          regularSubmissionPorts,
          accountInspector,
          regularImagePlanService,
          clientProfileReaders,
        },
      );
    const regularPlatformOutcomeService =
      require("../services/regular-platform-outcome-service").createRegularPlatformOutcomeService(
        {
          regularOutcomeTransitions:
            operationalStoreTransitionPorts.regularOutcomeTransitions,
          clock: options.clock,
        },
      );
    const regularQueueGroupComposition =
      require("./regular-queue-group-composition").createRegularQueueGroupComposition(
        {
          regularQueueGroupTransitions:
            operationalStoreTransitionPorts.regularQueueGroupTransitions,
          platformSubmissionExecutor,
          regularPlatformOutcomeService,
          onDataInvalidated: invalidation.invalidate,
        },
      );
    const regularRemoteReviewReconciler = ownService(
      require("../services/regular-remote-review-reconciler").createRegularRemoteReviewReconciler(
        {
          remoteReviewPorts,
          regularPlatformOutcomeService,
          onDataInvalidated: invalidation.invalidate,
        },
      ),
    );
    regularRemoteReviewReconciler.start();
    const { paidMediaBatchComposition, mediaApplication } =
      require("./media-workbench-composition").createMediaWorkbenchComposition({
        paths,
        workspaceRoot,
        platformSettingsService,
        contentStore,
        operationalStoreTransitionPorts,
        articleMutationCoordinator,
        invalidation,
        openExternal: options.openExternal,
        reportCompositionDiagnostic,
      });
    const platformWorkbenchService = ownService(
      require("../services/platform-workbench-service").createPlatformWorkbenchService(
        {
          rootDir: workspaceRoot,
          paths: injectedPaths,
          contentStore,
          platforms: directoryEntries,
          adapters,
        },
      ),
    );
    const platformApplication =
      require("../services/platform-workbench-application").createPlatformWorkbenchApplication(
        {
          directoryEntries,
          loginSessionPorts,
          platformSessionService,
          platformWorkbenchService,
          taskService,
          assertPlaywrightAvailable:
            platformRuntimeComposition.assertPlaywrightAvailable,
        },
      );
    const attentionPorts = publicationRecoveryComposition.createAttentionPorts({
      submissionMaintenance,
      regularQueueApplication,
      articleRemovalService: aiContentService,
      regularPlatformOutcomeService,
      paidOrderCreationResolutionService:
        paidMediaBatchComposition.orderCreationResolutionService,
      orderReconciliationPort: {
        prepareOrderStatusAnomalyResolution:
          mediaApplication.prepareOrderStatusAnomalyResolution,
        resumeOrderTracking: mediaApplication.resumeOrderTracking,
        confirmOrderPublished: mediaApplication.confirmOrderPublished,
        confirmOrderNotPublished: mediaApplication.confirmOrderNotPublished,
      },
      postProcessingPort: publicationRecoveryComposition.postProcessor
        ? {
            retry: function (input) {
              return publicationRecoveryComposition.operationalStore.retryPostProcessing(
                input,
              );
            },
          }
        : undefined,
      clock: options.clock,
      getRevision: invalidation.getRevision,
      onDataInvalidated: invalidation.invalidate,
      readers: {
        listOrderAttention: mediaApplication.listOrderAttention,
        listTransactions: aiContentService.listArticleRemovalTransactions,
        listArticles: aiContentService.listGeneratedArticles,
        listTrashedArticles: aiContentService.listTrashedArticles,
        getArticle: aiContentService.getGeneratedArticle,
      },
    });
    const submissionCenterSnapshot =
      require("../services/submission-center-snapshot").createSubmissionCenterSnapshot(
        {
          getRevision: invalidation.getRevision,
          getWorkspaceRuntimeId: invalidation.getWorkspaceRuntimeId,
          validateClient: function (clientId) {
            return require("../../src/content/client-knowledge").getClient(
              workspaceRoot,
              clientId,
            );
          },
          listRegularQueueGroups:
            regularQueueApplication.listRegularQueueGroups,
          listPaidMediaBatches: mediaApplication.getPaidMediaBatches,
          listAttention: attentionPorts.attentionQuery.list,
        },
      );
    modules = {
      taskService,
      platformSettingsService,
      doubaoCollectionService,
      aiProviderService,
      contentStore,
      submissionMaintenance,
      regularQueueApplication,
      regularImagePlanService,
      regularQueueGroupOrchestrator: regularQueueGroupComposition.orchestrator,
      regularPlatformOutcomeService,
      paidMediaBatchOrchestrator: paidMediaBatchComposition.orchestrator,
      paidOrderCreationResolutionService:
        paidMediaBatchComposition.orderCreationResolutionService,
      aiContentService,
      contentGenerationBatchService,
      platformWorkbenchService,
      platformAccountProfileService,
      publicationRecoveryComposition,
      attentionPorts,
      submissionCenterSnapshot,
      platformApplication,
      mediaApplication,
    };
    ipcDeps = {
      ipcMain: options.ipcMain,
      taskService,
      sendToRenderer,
      publishGenerationEvents: false,
      openExternal: options.openExternal,
      rootDir: workspaceRoot,
      appRoot: runtime.appRoot,
      paths,
      doubaoCollectionService,
      aiProviderService,
      platformSettingsService,
      legacyProviderSettings,
      contentStore,
      aiContentService,
      submissionMaintenance,
      regularQueueApplication,
      regularQueueGroupOrchestrator: regularQueueGroupComposition.orchestrator,
      contentGenerationBatchService,
      platformWorkbenchService,
      platformApplication,
      mediaApplication,
      paidMediaPreflightService: Object.freeze({
        preflight: mediaApplication.preflightPaidMedia,
        confirm: mediaApplication.confirmPaidMedia,
      }),
      paidMediaExecutionService: Object.freeze({
        list: mediaApplication.getPaidMediaBatches,
        start: mediaApplication.startPaidMediaBatch,
        startAll: mediaApplication.startAllPaidMediaBatches,
        pause: mediaApplication.pausePaidMediaBatch,
        cancelRemaining: mediaApplication.cancelRemainingPaidMediaBatchItems,
      }),
      directoryEntries,
      submissionPlatformDirectory,
      platformSessionService,
      regularPlatformOutcomeService,
      operationalStore: publicationRecoveryComposition.operationalStore,
      platformAccountProfileService,
      publishedArchiveQueries:
        operationalStoreTransitionPorts.publishedArchiveQueries,
      articleMutationCoordinator,
      articleAttentionQuery: attentionPorts.attentionQuery,
      submissionCenterSnapshot,
      articleAttentionResolver: attentionPorts.attentionResolver,
      postProcessingPort: attentionPorts.postProcessingPort,
      runtimeDiagnosticsService: runtime.diagnosticsService,
      invalidateData: invalidation.invalidate,
      getWorkspaceDataRevision: invalidation.getRevision,
      getWorkspaceRuntimeIdentity: invalidation.getRuntimeIdentity,
      authService: options.authService,
    };
    if (paths && paths.localState) {
      const storageMaintenanceService = ownService(
        require("../services/storage-maintenance-service").createStorageMaintenanceService(
          {
            paths,
            getActivityState: function () {
              return {
                task: taskState(),
                collection: collectionState(),
                generation: generationState(),
                contentGeneration: contentGenerationState(),
              };
            },
          },
        ),
      );
      modules.storageMaintenanceService = storageMaintenanceService;
      ipcDeps.storageMaintenanceService = storageMaintenanceService;
    }
    ownDisposer(
      subscribeGenerationRuntimeState(
        contentGenerationBatchService,
        sendToRenderer,
      ),
    );
    const doubaoQueueContract = productionIpcRegistry.byChannel(
      "content:doubao-queue-state",
    );
    ownDisposer(
      doubaoCollectionService.subscribe(function (value) {
        sendToRenderer(
          doubaoQueueContract.channel,
          productionIpcRegistry.event(
            doubaoQueueContract,
            require("../ipc/contracts/doubao-contracts").projectQueue(value),
          ),
        );
      }),
    );
    return Object.freeze({
      runtime,
      modules,
      ipcDeps,
      dispose,
    });
  } catch (error) {
    await dispose();
    throw error;
  }
}

module.exports = { createWorkspaceRuntimeComposition };

"use strict";
const {
  productionIpcRegistry,
} = require("../ipc/contracts/production-registry");
const {
  projectArticleRemovalTransaction,
} = require("../ipc/contracts/article-removal-contracts");
const {
  projectPlatformSnapshot,
} = require("../ipc/contracts/platform-contracts");
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
function subscribePlatformState(taskService, sendToRenderer) {
  if (!taskService || typeof taskService.subscribe !== "function")
    return function () {};
  const eventContract = productionIpcRegistry.byCapability(
    "platform.stateChanged",
  );
  return taskService.subscribe(function (value) {
    sendToRenderer(
      eventContract.channel,
      productionIpcRegistry.event(
        eventContract,
        projectPlatformSnapshot(value),
      ),
    );
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
// This module owns construction and wiring of workspace-scoped services. The
// runtime lifecycle module below owns only the returned composition's start /
// dispose boundary; business operations remain behind application services.
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
    const { loadPlatforms } = require("../../src/core/platforms");
    const loadedPlatforms = loadPlatforms();
    const operationalStoreTransitionPorts = {};
    let contentStore = null;
    const articleReader = Object.freeze({
      getArticle: function (clientId, articleId) {
        if (!contentStore || typeof contentStore.getArticle !== "function") {
          const error = new Error("Paid staging article reader is unavailable");
          error.code = "PAID_STAGING_ARTICLE_STATE_UNAVAILABLE";
          throw error;
        }
        return contentStore.getArticle(clientId, articleId);
      },
    });
    const operationalStore =
      require("../../src/infrastructure/operational-store/operational-store").createOperationalStore(
        {
          workspaceRoot,
          clock: options.clock,
          articleReader,
          transitionPorts: operationalStoreTransitionPorts,
        },
      );
    ownService({
      dispose: function () {
        operationalStore.close();
      },
    });
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
          paidStagingTransitions:
            operationalStoreTransitionPorts.paidStagingTransitions,
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
          onDataInvalidated: invalidation.invalidate,
          paidStagingTransitions:
            operationalStoreTransitionPorts.paidStagingTransitions,
          accountProfileResolver:
            operationalStore.assertExecutableAccountProfile,
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
          platforms: loadedPlatforms,
        },
      );
    const createPlatformSettingsService =
      require("../services/platform-settings-service").createPlatformSettingsService;
    const {
      createMediaSettingsAdapter,
    } = require("../services/platform-settings/media-settings-adapter");
    const {
      createHepanSettingsAdapter,
    } = require("../services/platform-settings/hepan-settings-adapter");
    const platformSettingsService = ownService(
      createPlatformSettingsService({
        userDataPath: options.userDataPath,
        safeStorage: options.safeStorage,
        env: process.env,
        localStateRoot: paths && paths.localState,
        adapters: [
          createMediaSettingsAdapter(),
          createHepanSettingsAdapter({
            localStateRoot: paths && paths.localState,
          }),
        ],
        getTaskState: taskState,
      }),
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
      }),
    );
    let accountInspector = null;
    const workerPublisher =
      require("../services/worker-publisher").createWorkerPublisher({
        taskService,
        inspectAccount: function (task) {
          return accountInspector
            ? accountInspector.inspect(task)
            : { verified: false };
        },
      });
    const mediaPublisher =
      require("../services/media-publisher").createMediaPublisher({
        supplierProvider: function () {
          const {
            createMediaSupplierAdapter,
          } = require("../../src/platforms/media/media-supplier-adapter");
          return createMediaSupplierAdapter({
            clientProvider: function () {
              const mediaRuntime =
                platformSettingsService.getAdapterForRuntime("media");
              return mediaRuntime.adapter.createClient(mediaRuntime.config);
            },
          });
        },
        systemSubmissionIdProvider: function () {
          return (
            platformSettingsService.getRuntimeConfig("media").thirdPartyId || ""
          );
        },
      });
    const mediaClientProvider = function () {
      const mediaRuntime =
        platformSettingsService.getAdapterForRuntime("media");
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
        !resource ||
        resource.resourceId !== (target && target.mediaResourceId) ||
        resource.available !== true ||
        resource.price !== claim.quotedPrice ||
        (claim.resourceFingerprint &&
          resource.fingerprint !== claim.resourceFingerprint)
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
    const publisher =
      require("../services/desktop-publisher-router").createDesktopPublisherRouter(
        { workerPublisher, mediaPublisher },
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
    const publicationComposition = ownService(
      require("./publication-workflow-composition").createPublicationWorkflowComposition(
        {
          workspaceRoot,
          operationalStore,
          articleMutationCoordinator,
          publisher,
          createPostProcessor: function (operationalStore) {
            return require("../services/publication-post-processor").createPublicationPostProcessor(
              {
                workspaceRoot,
                paths: injectedPaths,
                platforms: loadedPlatforms.map(function (platform) {
                  return { id: platform.id, scanDir: platform.scanDir };
                }),
                operationalStore,
                autoTrashArticle,
              },
            );
          },
        },
      ),
    );
    accountInspector =
      require("../services/platform-account-inspector").createPlatformAccountInspector(
        {
          adapters:
            require("../services/platform-account-runtime").createPlatformAccountRuntimeAdapters(
              { loadedPlatforms, platformSettingsService },
            ),
          operationalStore: publicationComposition.operationalStore,
          bindingStore:
            require("../services/platform-account-binding-store").createPlatformAccountBindingStore(
              { localStateRoot: paths.localState },
            ),
        },
      );
    if (
      runtime.diagnosticsService &&
      runtime.diagnosticsService.setPlatformSettingsService
    )
      runtime.diagnosticsService.setPlatformSettingsService(
        platformSettingsService,
      );
    const legacyProviderSettings =
      require("../runtime-config").createLegacyProviderSettingsMigration({
        configRoot: options.userDataPath,
        workspaceRoot,
        runtimeConfigStore: runtime.runtimeConfigStore,
        platformSettingsService,
      });
    const doubaoCollectionService = ownService(
      require("../services/doubao-collection-service").createDoubaoCollectionDesktopService(
        {
          workspaceRoot,
          paths: injectedPaths,
          onDataInvalidated: invalidation.invalidate,
        },
      ),
    );
    const aiProviderService = ownService(
      require("../services/ai-provider-service").createAiProviderService({
        userDataPath: options.userDataPath,
        paths: injectedPaths,
        safeStorage: options.safeStorage,
        getBatchState: function () {
          return generationState() || taskState() || {};
        },
      }),
    );
    const contentSubmissionService = ownService(
      require("../services/content-submission-service").createContentSubmissionService(
        {
          workspaceRoot,
          paths: injectedPaths,
          contentStore,
          operationalStore: publicationComposition.operationalStore,
          platforms: loadedPlatforms,
          onDataInvalidated: invalidation.invalidate,
          getDataRevision: invalidation.getRevision,
        },
      ),
    );
    const aiContentService = ownService(
      require("../services/ai-content-service").createAiContentService({
        workspaceRoot,
        paths: injectedPaths,
        contentStore,
        operationalStore: publicationComposition.operationalStore,
        articleMutationCoordinator,
        articleRemovalTransactionStore:
          contentLifecycleComposition.articleRemovalTransactionStore,
        articleRemovalTransitionPort:
          contentLifecycleComposition.articleRemovalTransitionPort,
        contentSubmissionService,
        onArticleRemovalTransaction: function (transaction) {
          const eventContract = productionIpcRegistry.byChannel(
            "content:article-removal-transaction",
          );
          sendToRenderer(
            eventContract.channel,
            productionIpcRegistry.event(
              eventContract,
              projectArticleRemovalTransaction(transaction),
            ),
          );
          invalidation.invalidate("ARTICLE_REMOVAL_TRANSACTION_CHANGED");
        },
        onDataInvalidated: invalidation.invalidate,
        aiClientFactory: function () {
          return aiProviderService.createClient();
        },
      }),
    );
    articleLifecycleOwner = aiContentService;
    await publicationComposition.publicationWorkflow.recover();
    const attentionPorts = publicationComposition.createAttentionPorts({
      contentSubmissionService,
      regularQueueApplication,
      articleRemovalService: aiContentService,
      getRevision: invalidation.getRevision,
      onDataInvalidated: invalidation.invalidate,
      readers: {
        listTransactions: aiContentService.listArticleRemovalTransactions,
        getArticle: aiContentService.getGeneratedArticle,
        platformCapabilities: contentSubmissionService.listPlatforms,
      },
    });
    if (aiContentService.recoverPendingArticleRemovals) {
      const removalRecoveryScheduler = ownService(
        require("../../src/content/article-removal-recovery-scheduler").createArticleRemovalRecoveryScheduler(
          {
            recover: aiContentService.recoverPendingArticleRemovals,
            onDiagnostic: function (diagnostic) {
              try {
                runtime.diagnosticsService &&
                  runtime.diagnosticsService.report &&
                  runtime.diagnosticsService.report(diagnostic);
              } catch (_) {
                reportCompositionDiagnostic(
                  "WORKSPACE_RECOVERY_DIAGNOSTIC_FAILED",
                  "recovery-diagnostic",
                );
              }
            },
          },
        ),
      );
      removalRecoveryScheduler.start();
    }
    const contentGenerationBatchService = ownService(
      require("../services/content-generation-batch-service").createContentGenerationBatchService(
        {
          workspaceRoot,
          paths: injectedPaths,
          contentStore,
          articleMutationCoordinator,
          aiProviderService,
          onDataInvalidated: invalidation.invalidate,
        },
      ),
    );
    const adapters = {};
    loadedPlatforms.forEach(function (platform) {
      adapters[platform.id] = platform;
    });
    const regularPlatformAdapters = loadedPlatforms.map(function (platform) {
      return platform.id === "hepan"
        ? require("../services/hepan-regular-preparation-adapter").createHepanRegularPreparationAdapter(
            { platformSettingsService, paths: injectedPaths },
          )
        : platform;
    });
    const platformSubmissionExecutor =
      require("../services/regular-platform-preparation-port").createRegularPlatformPreparationPort(
        { adapters: regularPlatformAdapters, accountInspector },
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
        },
      );
    const paidMediaBatchComposition =
      require("./paid-media-batch-composition").createPaidMediaBatchComposition(
        {
          paidExecutionTransitions:
            operationalStoreTransitionPorts.paidExecutionTransitions,
          orderCreationResolutionTransitions:
            operationalStoreTransitionPorts.orderCreationResolutionTransitions,
          orderDetailsQueryPort: paidOrderDetailsQueryPort,
          orderCreationPort: paidOrderCreationPort,
          recheckPaidOrder: paidMediaRecheck,
        },
      );
    const platformWorkbenchService = ownService(
      require("../services/platform-workbench-service").createPlatformWorkbenchService(
        {
          rootDir: workspaceRoot,
          paths: injectedPaths,
          contentStore,
          platforms: loadedPlatforms.map(function (platform) {
            return { id: platform.id, scanDir: platform.scanDir };
          }),
          adapters,
        },
      ),
    );
    const platformSessionService =
      require("../services/platform-session-service").createPlatformSessionService(
        {
          adapters,
          assertPlaywrightAvailable: function () {
            return require("../services/playwright-capability").assertPlaywrightAvailable(
              runtime.diagnosticsService,
            );
          },
        },
      );
    const platformApplication =
      require("../services/platform-workbench-application").createPlatformWorkbenchApplication(
        {
          loadedPlatforms,
          platformSessionService,
          platformWorkbenchService,
          taskService,
          assertPlaywrightAvailable: function () {
            return require("../services/playwright-capability").assertPlaywrightAvailable(
              runtime.diagnosticsService,
            );
          },
        },
      );
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
          paidStaging: Object.freeze({
            listPaidStagingItems: (input) =>
              operationalStore.listPaidStagingItems(input),
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
          paidOrderCreationResolutionService:
            paidMediaBatchComposition.orderCreationResolutionService,
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
          platformWorkbenchService,
          openExternal: options.openExternal,
          invalidateData: invalidation.invalidate,
        },
      );
    modules = {
      taskService,
      platformSettingsService,
      doubaoCollectionService,
      aiProviderService,
      contentStore,
      contentSubmissionService,
      regularQueueApplication,
      regularQueueGroupOrchestrator: regularQueueGroupComposition.orchestrator,
      regularPlatformOutcomeService,
      paidMediaBatchOrchestrator: paidMediaBatchComposition.orchestrator,
      paidOrderCreationResolutionService:
        paidMediaBatchComposition.orderCreationResolutionService,
      aiContentService,
      contentGenerationBatchService,
      generationSubmissionHandoffService: null,
      platformWorkbenchService,
      publicationComposition,
      attentionPorts,
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
      contentSubmissionService,
      regularQueueApplication,
      regularQueueGroupOrchestrator: regularQueueGroupComposition.orchestrator,
      contentGenerationBatchService,
      generationSubmissionHandoffService: null,
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
        pause: mediaApplication.pausePaidMediaBatch,
      }),
      loadedPlatforms,
      platformSessionService,
      regularPlatformOutcomeService,
      operationalStore: publicationComposition.operationalStore,
      publishedArchiveQueries:
        operationalStoreTransitionPorts.publishedArchiveQueries,
      articleMutationCoordinator,
      publicationWorkflow: publicationComposition.publicationWorkflow,
      articleAttentionQuery: attentionPorts.attentionQuery,
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
              };
            },
          },
        ),
      );
      modules.storageMaintenanceService = storageMaintenanceService;
      ipcDeps.storageMaintenanceService = storageMaintenanceService;
    }
    ownDisposer(subscribePlatformState(taskService, sendToRenderer));
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
    const generationSubmissionHandoffService =
      require("../services/generation-submission-handoff-service").createGenerationSubmissionHandoffService(
        {
          generationBatchService: contentGenerationBatchService,
          contentStore,
          regularQueueApplication,
          targetPlatforms: loadedPlatforms,
        },
      );
    modules.generationSubmissionHandoffService =
      generationSubmissionHandoffService;
    ipcDeps.generationSubmissionHandoffService =
      generationSubmissionHandoffService;

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

"use strict";
const {
  productionIpcRegistry,
} = require("../ipc/contracts/production-registry");
const {
  projectArticleRemovalTransaction,
} = require("../ipc/contracts/article-removal-contracts");
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
    let platformSettingsService = null;
    const clientImageLibrary =
      require("../../src/content/client-image-library").createClientImageLibrary(
        {
          workspaceRoot,
          paths: injectedPaths,
          imageDirectoryName: paths.clientImageDirectoryName,
        },
      );
    const { loadPlatforms } = require("../../src/core/platforms");
    const platformRuntimeContext = Object.freeze({
      ...require("../../src/platforms/platform-runtime-context").createPlatformRuntimeContextFromWorkspacePaths(
        paths,
      ),
      imageAssetReader: clientImageLibrary.imageAssetReader,
      getPlatformSettingsService: function () {
        return platformSettingsService;
      },
    });
    const loadedPlatforms = loadPlatforms({ runtimeContext: platformRuntimeContext });
    const directoryEntries = Object.freeze(
      loadedPlatforms.map(function (platform) {
        return platform.submissionDirectoryEntry;
      }),
    );
    const regularDirectoryEntries = Object.freeze(
      loadedPlatforms
        .filter(function (platform) { return Boolean(platform.regularSubmission); })
        .map(function (platform) { return platform.submissionDirectoryEntry; }),
    );
    const regularSubmissionPorts = Object.freeze(
      loadedPlatforms
        .filter(function (platform) { return Boolean(platform.regularSubmission); })
        .map(function (platform) {
          return Object.freeze({
            id: platform.definition.id,
            preparePlatformSubmission:
              platform.regularSubmission.preparePlatformSubmission,
          });
        }),
    );
    const accountInspectionPorts = Object.freeze(
      loadedPlatforms
        .filter(function (platform) { return Boolean(platform.accountInspection); })
        .map(function (platform) {
          return Object.freeze({ id: platform.definition.id, port: platform.accountInspection });
        }),
    );
    const loginSessionPorts = Object.freeze(
      loadedPlatforms
        .filter(function (platform) { return Boolean(platform.loginSession); })
        .map(function (platform) {
          return Object.freeze({ id: platform.definition.id, port: platform.loginSession });
        }),
    );
    const legacyQueuePorts = Object.freeze(
      loadedPlatforms
        .filter(function (platform) { return Boolean(platform.legacyQueue); })
        .map(function (platform) {
          return Object.freeze({ id: platform.definition.id, port: platform.legacyQueue });
        }),
    );
    const settingsAdapters = Object.freeze(
      loadedPlatforms
        .filter(function (platform) {
          return Boolean(platform.settingsContribution);
        })
        .map(function (platform) {
          return platform.settingsContribution.createSettingsAdapter({
            localStateRoot: paths && paths.localState,
          });
        }),
    );
    platformSettingsService = ownService(
      require("../services/platform-settings-service").createPlatformSettingsService(
        {
          userDataPath: options.userDataPath,
          safeStorage: options.safeStorage,
          env: process.env,
          localStateRoot: paths && paths.localState,
          adapters: settingsAdapters,
          getTaskState: taskState,
        },
      ),
    );
    const contentProfilePort = Object.freeze({
      read: function (input) {
        const value = input || {};
        return require("../../src/content/client-knowledge").getClientPublicationProfile(
          workspaceRoot,
          value.clientId,
          value.profileKey,
        );
      },
    });
    const clientProfileReaders = Object.freeze(
      loadedPlatforms
        .filter(function (platform) {
          return Boolean(platform.clientProfileContribution);
        })
        .map(function (platform) {
          return Object.freeze({
            id: platform.definition.id,
            requirement: platform.clientProfileContribution.requirement,
            reader:
              platform.clientProfileContribution.createProfileReader(
                contentProfilePort,
              ),
          });
        }),
    );
    const submissionPlatformDirectory =
      require("../services/submission-target-catalog").createSubmissionTargetCatalog({
        directoryEntries: regularDirectoryEntries,
      });
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
    const platformAccountBindingStore =
      require("../services/platform-account-binding-store").createPlatformAccountBindingStore(
        { localStateRoot: paths.localState },
      );
    const platformAccountIdentityService =
      require("../services/platform-account-identity-service").createPlatformAccountIdentityService(
        {
          adapters: Object.fromEntries(
            accountInspectionPorts.map(function (platform) {
              return [platform.id, platform.port];
            }),
          ),
        },
      );
    const platformAccountProfileService =
      require("../services/platform-account-profile-service").createPlatformAccountProfileService(
        {
          operationalStore,
          bindingStore: platformAccountBindingStore,
          identityService: platformAccountIdentityService,
        },
      );
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
          onDataInvalidated: invalidation.invalidate,
          accountProfileResolver:
            platformAccountProfileService.assertBound,
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
    let accountInspector = null;
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
      if (!matchesPaidQuote(resource, {
        resourceId: target && target.mediaResourceId,
        price: claim.quotedPrice,
      }))
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
          createPostProcessor: function (operationalStore) {
            return require("../services/publication-post-processor").createPublicationPostProcessor(
              {
                workspaceRoot,
                paths: injectedPaths,
                platforms: directoryEntries,
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
          operationalStore: publicationRecoveryComposition.operationalStore,
          bindingStore: platformAccountBindingStore,
          identityService: platformAccountIdentityService,
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
    const aiContentService = ownService(
      require("../services/ai-content-service").createAiContentService({
        workspaceRoot,
        paths: injectedPaths,
        contentStore,
        operationalStore: publicationRecoveryComposition.operationalStore,
        articleMutationCoordinator,
        articleRemovalTransactionStore:
          contentLifecycleComposition.articleRemovalTransactionStore,
        articleRemovalTransitionPort:
          contentLifecycleComposition.articleRemovalTransitionPort,
        articleRemovalImpactQuery,
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
    await publicationRecoveryComposition.publicationRecovery.recover();
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
          platforms: directoryEntries,
          adapters,
        },
      ),
    );
    const platformSessionService =
      require("../services/platform-session-service").createPlatformSessionService(
        {
          adapters: Object.fromEntries(loginSessionPorts.map(function (platform) { return [platform.id, platform.port]; })),
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
          directoryEntries,
          loginSessionPorts,
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
      require("../services/submission-center-snapshot").createSubmissionCenterSnapshot({
        getRevision: invalidation.getRevision,
        getWorkspaceRuntimeId: invalidation.getWorkspaceRuntimeId,
        validateClient: function (clientId) {
          return require("../../src/content/client-knowledge").getClient(
            workspaceRoot,
            clientId,
          );
        },
        listRegularQueueGroups: regularQueueApplication.listRegularQueueGroups,
        listPaidMediaBatches: mediaApplication.getPaidMediaBatches,
        listAttention: attentionPorts.attentionQuery.list,
      });
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

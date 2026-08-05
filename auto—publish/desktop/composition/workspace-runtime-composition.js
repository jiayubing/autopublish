"use strict";

const {
  productionIpcRegistry,
} = require("../ipc/contracts/production-registry");
const {
  projectArticleRemovalTransaction,
} = require("../ipc/contracts/content-core-contracts");
const {
  projectPlatformSnapshot,
} = require("../ipc/contracts/platform-contracts");

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
      } catch (_) {}
    }
    const services = ownedServices.splice(0).reverse();
    for (const service of services) {
      try {
        await service.dispose();
      } catch (_) {}
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
    const contentLifecycleComposition = ownService(
      require("./content-lifecycle-composition").createContentLifecycleComposition(
        { workspaceRoot, paths: injectedPaths },
      ),
    );
    const contentStore = contentLifecycleComposition.contentStore;
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
    const { loadPlatforms } = require("../../src/core/platforms");
    const loadedPlatforms = loadPlatforms();
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
        clientProvider: function () {
          const mediaRuntime =
            platformSettingsService.getAdapterForRuntime("media");
          return mediaRuntime.adapter.createClient(mediaRuntime.config);
        },
        thirdIdProvider: function () {
          return (
            platformSettingsService.getRuntimeConfig("media").thirdPartyId || ""
          );
        },
      });
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
    let retryFailedPublicationExecutor = null;
    const contentSubmissionService = ownService(
      require("../services/content-submission-service").createContentSubmissionService(
        {
          workspaceRoot,
          paths: injectedPaths,
          contentStore,
          operationalStore: publicationComposition.operationalStore,
          onDataInvalidated: invalidation.invalidate,
          getDataRevision: invalidation.getRevision,
          retryFailedPublication: function (task) {
            if (!retryFailedPublicationExecutor) {
              const error = new Error(
                "Publication retry workflow is unavailable",
              );
              error.code = "PUBLICATION_RETRY_REQUIRES_WORKFLOW";
              throw error;
            }
            return retryFailedPublicationExecutor(task);
          },
        },
      ),
    );
    const aiContentService = ownService(
      require("../services/ai-content-service").createAiContentService({
        workspaceRoot,
        paths: injectedPaths,
        contentStore,
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
              } catch (_) {}
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
          aiProviderService,
          onDataInvalidated: invalidation.invalidate,
        },
      ),
    );
    const adapters = {};
    loadedPlatforms.forEach(function (platform) {
      adapters[platform.id] = platform;
    });
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
    const publicationSubmissionOrchestrator =
      require("../services/publication-submission-orchestrator").createPublicationSubmissionOrchestrator(
        {
          workflow: publicationComposition.publicationWorkflow,
          operationalStore: publicationComposition.operationalStore,
          workerPublisher,
        },
      );
    retryFailedPublicationExecutor = async function (task) {
      const command =
        await platformWorkbenchService.preparePublicationCommand(task);
      return publicationSubmissionOrchestrator.submit(
        [Object.assign({}, command, { publicationId: task.publicationId })],
        { retryFailed: true },
      );
    };
    const publicationSubmissionService =
      require("../services/publication-submission-service").createPublicationSubmissionService(
        {
          workbench: platformWorkbenchService,
          orchestrator: publicationSubmissionOrchestrator,
        },
      );
    const mediaPublicationSubmissionService =
      require("../services/media-publication-submission-service").createMediaPublicationSubmissionService(
        {
          workbench: platformWorkbenchService,
          orchestrator: publicationSubmissionOrchestrator,
        },
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
          publicationSubmissionService,
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
          operationalStore: publicationComposition.operationalStore,
          platformWorkbenchService,
          mediaPublicationSubmissionService,
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
      aiContentService,
      contentGenerationBatchService,
      generationSubmissionHandoffService: null,
      platformWorkbenchService,
      publicationComposition,
      attentionPorts,
      publicationSubmissionService,
      mediaPublicationSubmissionService,
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
      contentGenerationBatchService,
      generationSubmissionHandoffService: null,
      platformWorkbenchService,
      platformApplication,
      mediaApplication,
      loadedPlatforms,
      platformSessionService,
      publicationSubmissionService,
      mediaPublicationSubmissionService,
      operationalStore: publicationComposition.operationalStore,
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
          contentSubmissionService,
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

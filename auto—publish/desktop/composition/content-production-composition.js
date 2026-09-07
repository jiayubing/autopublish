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

function reportContentProductionDiagnostic(code, operation) {
  reportDiagnostic({
    code,
    module: "content-production-composition",
    category: "lifecycle",
    operationId: operation || "content-production",
    metadata: { action: operation || "content-production" },
  });
}

function createContentProductionComposition(options) {
  const value = options || {};
  if (typeof value.workspaceRoot !== "string" || !value.workspaceRoot.trim())
    throw new Error("CONTENT_PRODUCTION_WORKSPACE_REQUIRED");
  if (!value.contentStore)
    throw new Error("CONTENT_PRODUCTION_CONTENT_STORE_REQUIRED");

  const ownedServices = [];
  let started = false;
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

  async function dispose() {
    if (disposed) return;
    disposed = true;
    const services = ownedServices.splice(0).reverse();
    for (const service of services) {
      try {
        await service.dispose();
      } catch (_) {
        reportContentProductionDiagnostic(
          "CONTENT_PRODUCTION_SERVICE_DISPOSE_FAILED",
          "service-dispose",
        );
      }
    }
  }

  try {
    const doubaoCollectionService = ownService(
      require("../services/doubao-collection-service").createDoubaoCollectionDesktopService(
        {
          workspaceRoot: value.workspaceRoot,
          paths: value.paths,
          onDataInvalidated: value.onDataInvalidated,
        },
      ),
    );
    const aiProviderService = ownService(
      require("../services/ai-provider-service").createAiProviderService({
        userDataPath: value.userDataPath,
        paths: value.paths,
        safeStorage: value.safeStorage,
        getBatchState: value.getBatchState,
      }),
    );
    const aiContentService = ownService(
      require("../services/ai-content-service").createAiContentService({
        workspaceRoot: value.workspaceRoot,
        paths: value.paths,
        contentStore: value.contentStore,
        operationalStore: value.operationalStore,
        articleMutationCoordinator: value.articleMutationCoordinator,
        articleRemovalTransactionStore: value.articleRemovalTransactionStore,
        articleRemovalTransitionPort: value.articleRemovalTransitionPort,
        articleRemovalImpactQuery: value.articleRemovalImpactQuery,
        onArticleRemovalTransaction: function (transaction) {
          const eventContract = productionIpcRegistry.byChannel(
            "content:article-removal-transaction",
          );
          value.sendToRenderer(
            eventContract.channel,
            productionIpcRegistry.event(
              eventContract,
              projectArticleRemovalTransaction(transaction),
            ),
          );
          value.onDataInvalidated("ARTICLE_REMOVAL_TRANSACTION_CHANGED");
        },
        onDataInvalidated: value.onDataInvalidated,
        aiClientFactory: function () {
          return aiProviderService.createClient();
        },
      }),
    );
    const removalRecoveryScheduler = aiContentService.recoverPendingArticleRemovals
      ? ownService(
          require("../../src/content/article-removal-recovery-scheduler").createArticleRemovalRecoveryScheduler(
            {
              recover: aiContentService.recoverPendingArticleRemovals,
              onDiagnostic: function (diagnostic) {
                try {
                  value.runtimeDiagnosticsService &&
                    value.runtimeDiagnosticsService.report &&
                    value.runtimeDiagnosticsService.report(diagnostic);
                } catch (_) {
                  reportContentProductionDiagnostic(
                    "CONTENT_PRODUCTION_RECOVERY_DIAGNOSTIC_FAILED",
                    "recovery-diagnostic",
                  );
                }
              },
            },
          ),
        )
      : null;
    const contentGenerationBatchService = ownService(
      require("../services/content-generation-batch-service").createContentGenerationBatchService(
        {
          workspaceRoot: value.workspaceRoot,
          paths: value.paths,
          contentStore: value.contentStore,
          articleMutationCoordinator: value.articleMutationCoordinator,
          aiProviderService,
          onDataInvalidated: value.onDataInvalidated,
        },
      ),
    );

    return Object.freeze({
      doubaoCollectionService,
      aiProviderService,
      aiContentService,
      contentGenerationBatchService,
      articleLifecycleOwner: aiContentService,
      start: function () {
        if (disposed || started) return;
        started = true;
        if (removalRecoveryScheduler) removalRecoveryScheduler.start();
      },
      dispose,
    });
  } catch (error) {
    void dispose();
    throw error;
  }
}

module.exports = { createContentProductionComposition };

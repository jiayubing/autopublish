import { createArticleManagementFeature } from "./article-management-feature.js";
import { createContentSourcesFeature } from "./content-sources-feature.js";
import { createContentGenerationFeature } from "./content-generation-feature.js";
import { createPaidMediaExecutionFeature } from "./paid-media-execution-feature.js";

export function createContentWorkbenchFeature(adapters = {}) {
  const sources = createContentSourcesFeature(adapters);
  const paidMediaExecution = createPaidMediaExecutionFeature(adapters);
  const management = createArticleManagementFeature(adapters);
  const generation = typeof adapters.generateArticle === "function"
    ? createContentGenerationFeature({
        generate: adapters.generateArticle,
        commit: (article) => {
          sources.setCurrentArticle(article);
          void management.refreshManagement("command-result");
        },
        refreshCurrent: (reason) => management.refreshManagement(reason),
      })
    : null;
  const generationBoundary = generation
    ? Object.freeze({
        getSnapshot: generation.getSnapshot,
        subscribe: generation.subscribe,
        generate: generation.generate,
      })
    : null;
  const listeners = new Set();
  let disposed = false;
  let snapshot;

  const sourceScopeKey = (sourceSnapshot = sources.getSnapshot()) =>
    [
      sourceSnapshot.scope?.workspaceRuntimeId || "",
      sourceSnapshot.selectedClientId || "none",
    ].join(":");

  const syncGenerationScope = () => {
    if (!generation) return;
    const sourceSnapshot = sources.getSnapshot();
    if (!sourceSnapshot.scope?.workspaceRuntimeId) return;
    generation.setScope({
      workspaceRuntimeId: sourceSnapshot.scope.workspaceRuntimeId,
      clientId: sourceSnapshot.selectedClientId || "none",
    });
  };

  const syncManagementScope = () => {
    const sourceSnapshot = sources.getSnapshot();
    const workspaceRuntimeId = sourceSnapshot.scope?.workspaceRuntimeId;
    if (!workspaceRuntimeId) return;
    management.setScope({
      workspaceRuntimeId,
      clientId: sourceSnapshot.selectedClientId || "none",
    });
  };

  const refreshManagementAfterSourceRefresh = async (
    previousScopeKey,
    reason,
  ) => {
    syncManagementScope();
    const sourceSnapshot = sources.getSnapshot();
    if (
      previousScopeKey !== sourceScopeKey(sourceSnapshot) &&
      sourceSnapshot.selectedClientId &&
      !["initial", "identity", "runtime-switch"].includes(reason)
    )
      return management.refreshManagement("scope-change");
    return true;
  };

  const refreshSources = async (reason = "manual", options = {}) => {
    const previousScopeKey = sourceScopeKey();
    if (!(await sources.refreshSources(reason, options))) return false;
    return refreshManagementAfterSourceRefresh(previousScopeKey, reason);
  };

  const refreshContentSources = async (reason = "manual") => {
    const previousScopeKey = sourceScopeKey();
    if (!(await sources.refresh(reason))) return false;
    return refreshManagementAfterSourceRefresh(previousScopeKey, reason);
  };

  const publish = () => {
    const sourceSnapshot = sources.getSnapshot();
    const managementSnapshot = management.getSnapshot();
    snapshot = Object.freeze({
      ...sourceSnapshot,
      management: managementSnapshot.management,
      managementQuery: managementSnapshot.query,
      removal: managementSnapshot.removal,
      paidMediaExecution: paidMediaExecution.getSnapshot(),
      generation: generation ? generation.getSnapshot() : null,
      commands: Object.freeze({
        ...sourceSnapshot.commands,
        ...managementSnapshot.commands,
        ...paidMediaExecution.getSnapshot().commands,
      }),
    });
    listeners.forEach((listener) => listener());
  };

  const unsubscribeSources = sources.subscribe(() => {
    syncManagementScope();
    syncGenerationScope();
    publish();
  });
  const unsubscribeManagement = management.subscribe(publish);
  const unsubscribePaidMediaExecution = paidMediaExecution.subscribe(publish);
  const unsubscribeGeneration = generation ? generation.subscribe(publish) : () => {};
  management.setArticleResultHandler((result) =>
    sources.setCurrentArticle(result?.article || result),
  );
  syncManagementScope();
  syncGenerationScope();
  publish();

  const sourceOnlyCommands = Object.freeze({
    ...sources.commands,
    // Article persistence is the hand-off seam from production to the
    // library; it is intentionally limited to editor/load, never admission
    // or removal.
    getArticleEditor: management.commands.getArticleEditor,
    saveArticle: management.commands.saveArticle,
  });
  const libraryCommands = Object.freeze({
    ...sources.commands,
    getArticleEditor: management.commands.getArticleEditor,
    openPublicationUrl: management.commands.openPublicationUrl,
    saveArticle: management.commands.saveArticle,
    previewRegularQueueAdmission: management.commands.previewRegularQueueAdmission,
    admitRegularQueueItems: management.commands.admitRegularQueueItems,
    startRegularQueueGroup: management.commands.startRegularQueueGroup,
    previewPaidMediaPreflight: management.commands.previewPaidMediaPreflight,
    confirmPaidMediaBatch: management.commands.confirmPaidMediaBatch,
    previewContentArticleRemoval: management.commands.previewContentArticleRemoval,
    trashContentArticles: management.commands.trashContentArticles,
    getContentArticleRemovalTransaction: management.commands.getContentArticleRemovalTransaction,
    retryContentArticleRemovalTransaction: management.commands.retryContentArticleRemovalTransaction,
    restoreContentArticle: management.commands.restoreContentArticle,
    preparePermanentDeleteContentArticle: management.commands.preparePermanentDeleteContentArticle,
    permanentlyDeleteContentArticle: management.commands.permanentlyDeleteContentArticle,
  });
  const refreshLibrary = async (reason = "manual") => {
    if (!(await sources.refreshSources(reason, { refreshFallbackData: false })))
      return false;
    syncManagementScope();
    const hasSelectedClient = Boolean(sources.getSnapshot().selectedClientId);
    const [clientResult, researchResult, managementResult] = await Promise.all([
      hasSelectedClient ? sources.refreshClientData(reason) : true,
      sources.refreshResearchIndex(reason),
      hasSelectedClient ? management.refreshManagement(reason) : true,
    ]);
    return clientResult && researchResult && managementResult;
  };
  const refreshProduction = async (reason = "manual") => {
    if (!(await sources.refreshSources(reason, { refreshFallbackData: false })))
      return false;
    const hasSelectedClient = Boolean(sources.getSnapshot().selectedClientId);
    const [clientResult, researchResult] = await Promise.all([
      hasSelectedClient ? sources.refreshClientData(reason) : true,
      sources.refreshResearchIndex(reason),
    ]);
    return clientResult && researchResult;
  };
  const projectBoundary = (kind) => {
    const boundary = {
      getClientDetails: adapters.getClientDetails,
      generation: generationBoundary,
      getSnapshot() {
        const sourceSnapshot = sources.getSnapshot();
        const managementSnapshot = management.getSnapshot();
        return kind === "production"
          ? Object.freeze({
              ...sourceSnapshot,
              generation: generationBoundary,
              // ContentWorkbench keeps the shared editor effect contract
              // in both modes; expose only the minimal revision fence here,
              // never the library articles/trash/removal read model.
              management: Object.freeze({
                revision: managementSnapshot.management.revision,
                workflowByArticle: Object.freeze({}),
              }),
              commands: Object.freeze({
                ...sourceSnapshot.commands,
                getArticleEditor: managementSnapshot.commands.getArticleEditor,
                saveArticle: managementSnapshot.commands.saveArticle,
              }),
            })
          : Object.freeze({
              ...sourceSnapshot,
              generation: generationBoundary,
              management: managementSnapshot.management,
              managementQuery: managementSnapshot.query,
              removal: managementSnapshot.removal,
              commands: Object.freeze({
                ...sourceSnapshot.commands,
                ...managementSnapshot.commands,
              }),
            });
      },
      get snapshot() {
        return boundary.getSnapshot();
      },
      subscribe(listener) {
        const unsubs = [sources.subscribe(listener)];
        if (kind === "library") unsubs.push(management.subscribe(listener));
        return () => unsubs.forEach((unsubscribe) => unsubscribe());
      },
      setScope(nextScope) {
        sources.setScope(nextScope);
        syncManagementScope();
        syncGenerationScope();
      },
      refresh: kind === "production" ? refreshProduction : refreshLibrary,
      refreshSources,
      refreshClientData: sources.refreshClientData,
      refreshResearchIndex: sources.refreshResearchIndex,
      refreshManagement: management.refreshManagement,
      refreshDoubaoQueue: sources.refreshDoubaoQueue,
      selectClient: async (clientId) => {
        const changed = await sources.selectClient(clientId);
        if (changed) {
          syncManagementScope();
          await management.refreshManagement("scope-change");
        }
        return changed;
      },
      setCurrentArticle: sources.setCurrentArticle,
      commands: kind === "production" ? sourceOnlyCommands : libraryCommands,
      watchRemovalTransaction: management.watchRemovalTransaction,
      clearRemovalTransaction: management.clearRemovalTransaction,
      dispose() {
        // The parent aggregate owns disposal; boundary views are intentionally
        // non-owning projections over the same source/management stores.
      },
    };
    return Object.freeze(boundary);
  };
  const production = Object.freeze(projectBoundary("production"));
  const library = Object.freeze(projectBoundary("library"));

  return Object.freeze({
    production,
    library,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(nextScope) {
      if (disposed) return;
      sources.setScope(nextScope);
      syncManagementScope();
      syncGenerationScope();
      paidMediaExecution.setScope(nextScope);
      publish();
    },
    async refresh(reason = "manual") {
      if (
        !(await sources.refreshSources(reason, { refreshFallbackData: false }))
      )
        return false;
      syncManagementScope();
      const hasSelectedClient = Boolean(sources.getSnapshot().selectedClientId);
      const [clientResult, researchResult, managementResult, paidMediaResult] =
        await Promise.all([
          hasSelectedClient ? sources.refreshClientData(reason) : true,
          sources.refreshResearchIndex(reason),
          hasSelectedClient ? management.refreshManagement(reason) : true,
          paidMediaExecution.refresh(reason),
        ]);
      return (
        clientResult && researchResult && managementResult && paidMediaResult
      );
    },
    refreshSources,
    refreshContentSources,
    refreshClientData: sources.refreshClientData,
    refreshResearchIndex: sources.refreshResearchIndex,
    refreshManagement: management.refreshManagement,
    refreshPaidMediaBatches: paidMediaExecution.refresh,
    refreshDoubaoQueue: sources.refreshDoubaoQueue,
    async selectClient(clientId) {
      const changed = await sources.selectClient(clientId);
      if (!changed) return false;
      syncManagementScope();
      await management.refreshManagement("scope-change");
      return true;
    },
    setCurrentArticle: sources.setCurrentArticle,
    watchRemovalTransaction: management.watchRemovalTransaction,
    clearRemovalTransaction: management.clearRemovalTransaction,
    commands: Object.freeze({
      ...sources.commands,
      ...management.commands,
      ...paidMediaExecution.commands,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeSources();
      unsubscribeManagement();
      unsubscribePaidMediaExecution();
      unsubscribeGeneration();
      sources.dispose();
      management.dispose();
      generation?.dispose();
      paidMediaExecution.dispose();
      listeners.clear();
    },
  });
}

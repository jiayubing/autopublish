import { createArticleManagementFeature } from "./article-management-feature.js";
import { createContentSourcesFeature } from "./content-sources-feature.js";
import { createPaidMediaExecutionFeature } from "./paid-media-execution-feature.js";

export function createContentWorkbenchFeature(adapters = {}) {
  const sources = createContentSourcesFeature(adapters);
  const paidMediaExecution = createPaidMediaExecutionFeature(adapters);
  const management = createArticleManagementFeature(adapters);
  const listeners = new Set();
  let disposed = false;
  let snapshot;

  const sourceScopeKey = (sourceSnapshot = sources.getSnapshot()) =>
    [
      sourceSnapshot.scope?.workspaceRuntimeId || "",
      sourceSnapshot.selectedClientId || "none",
    ].join(":");

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
      paidStaging: managementSnapshot.paidStaging,
      removal: managementSnapshot.removal,
      paidMediaExecution: paidMediaExecution.getSnapshot(),
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
    publish();
  });
  const unsubscribeManagement = management.subscribe(publish);
  const unsubscribePaidMediaExecution = paidMediaExecution.subscribe(publish);
  management.setArticleResultHandler((result) =>
    sources.setCurrentArticle(result?.article || result),
  );
  syncManagementScope();
  publish();

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(nextScope) {
      if (disposed) return;
      sources.setScope(nextScope);
      syncManagementScope();
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
      sources.dispose();
      management.dispose();
      paidMediaExecution.dispose();
      listeners.clear();
    },
  });
}

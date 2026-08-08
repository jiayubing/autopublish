import {
  createCommandOwner,
  createQueryIdentity,
} from "../../infrastructure/query-identity/query-identity.js";
import { staleContentCommandResult } from "./content-command-result.js";

const EMPTY_MANAGEMENT = Object.freeze({
  revision: 0,
  articles: Object.freeze([]),
  trash: Object.freeze([]),
  submissionBatches: Object.freeze([]),
  cancellationPlans: Object.freeze([]),
  publicationRecords: Object.freeze([]),
  workflowByArticle: Object.freeze({}),
  publicationSummaries: Object.freeze({}),
  attention: Object.freeze({
    revision: 0,
    items: Object.freeze([]),
    counts: { total: 0, actionable: 0 },
  }),
  submissionPlatforms: Object.freeze([]),
});

const COMMAND_SCOPES = Object.freeze({
  getArticleEditor: null,
  saveArticle: "management",
  prepareRegularUncertainResolution: "management",
  confirmRegularAccepted: "management",
  confirmRegularNotAccepted: "management",
  previewRegularQueueAdmission: null,
  admitRegularQueueItems: "management",
  previewPaidMediaPreflight: null,
  confirmPaidMediaBatch: "management",
  removePendingQueueItems: "management",
  cancelContentSubmissionBatch: "management",
  previewContentArticleRemoval: null,
  trashContentArticles: "management",
  getContentArticleRemovalTransaction: null,
  retryContentArticleRemovalTransaction: "management",
  restoreContentArticle: "management",
  preparePermanentDeleteContentArticle: null,
  permanentlyDeleteContentArticle: "management",
});

// The removal service normally emits a transaction event before the command
// resolves.  The event path owns the refresh when observed; command
// completion supplies a deduplicated fallback for an event/query race.
const REMOVAL_EVENT_COMMANDS = new Set([
  "trashContentArticles",
  "retryContentArticleRemovalTransaction",
]);

const CLIENT_IDENTITY = Object.freeze({
  getArticleEditor: (input) => [input?.clientId],
  saveArticle: (input) => [input?.clientId || input?.article?.clientId],
  previewRegularQueueAdmission: (input) =>
    (input?.articleRefs || input?.selections || []).map(
      (item) => item?.clientId || item?.articleRef?.clientId,
    ),
  admitRegularQueueItems: (input) =>
    (input?.articleRefs || input?.selections || []).map(
      (item) => item?.clientId || item?.articleRef?.clientId,
    ),
  previewPaidMediaPreflight: (input) =>
    (input?.articleRefs || []).map((item) => item?.clientId),
  removePendingQueueItems: (input) =>
    (input?.items || input?.selections || []).map(
      (item) => item?.articleRef?.clientId || item?.clientId,
    ),
  previewContentArticleRemoval: (input) =>
    (input?.selections || []).map((item) => item?.clientId),
  trashContentArticles: (input) =>
    (input?.selections || input?.articles || []).map((item) => item?.clientId),
  restoreContentArticle: (input) => [input?.clientId],
  preparePermanentDeleteContentArticle: (input) => [input?.clientId],
  permanentlyDeleteContentArticle: (input) => [input?.clientId],
});

function safeError(value) {
  return Object.freeze({
    code:
      value && typeof value.code === "string"
        ? value.code
        : "CONTENT_MANAGEMENT_FAILED",
    category: "internal",
    retryability: "safe",
    userMessage:
      value instanceof Error && value.message
        ? value.message
        : "文章管理操作失败。",
  });
}

function transactionIdOf(value) {
  const id = value?.transactionId || value?.id;
  return typeof id === "string" && id ? id : null;
}

function isTerminalTransaction(value) {
  return value?.status === "committed" || value?.status === "superseded";
}

function removalTerminalKey(transaction, fallbackTransactionId = "") {
  const transactionId = transactionIdOf(transaction) || fallbackTransactionId;
  return `${transactionId}:${transaction?.status || ""}`;
}

function removalEventKey(transaction, fallbackTransactionId = "") {
  const transactionId = transactionIdOf(transaction) || fallbackTransactionId;
  if (isTerminalTransaction(transaction))
    return `terminal:${removalTerminalKey(transaction, transactionId)}`;
  return [
    transactionId,
    transaction?.status || "",
    transaction?.phase || "",
    transaction?.revision ?? "",
    transaction?.updatedAt ?? transaction?.updated_at ?? "",
    transaction?.errorCode || "",
    transaction?.reasonCode || "",
  ].join(":");
}

export function createArticleManagementFeature(adapters = {}) {
  if (typeof adapters.loadManagement !== "function")
    throw new TypeError("Article management feature dependencies are required");

  const managementIdentity = createQueryIdentity({
    feature: "content",
    query: "articleManagement",
  });
  const removalIdentity = createQueryIdentity({
    feature: "content",
    query: "articleRemovalTransaction",
  });
  const commandOwners = Object.fromEntries(
    Object.keys(COMMAND_SCOPES).map((name) => [
      name,
      createCommandOwner({ feature: "content", command: name }),
    ]),
  );
  const listeners = new Set();
  let disposed = false;
  let scope = null;
  let management = EMPTY_MANAGEMENT;
  let query = Object.freeze({ loading: false, error: null, reason: null });
  let removal = Object.freeze({
    transactionId: null,
    transaction: null,
    query: Object.freeze({ loading: false, error: null, reason: null }),
  });
  let unsubscribeRemoval = null;
  let lastRemovalTerminalKey = null;
  let lastRemovalRefreshKey = null;
  let lastRemovalRefreshTransactionId = null;
  let pendingCommandRemovalRefresh = null;
  let onArticleResult = null;
  let snapshot;

  const publish = () => {
    snapshot = Object.freeze({
      scope,
      management,
      query,
      removal,
      commands: Object.freeze(
        Object.fromEntries(
          Object.entries(commandOwners).map(([name, owner]) => [
            name,
            owner.getSnapshot(),
          ]),
        ),
      ),
    });
    listeners.forEach((listener) => listener());
  };

  const clearRemovalSubscription = () => {
    if (unsubscribeRemoval) unsubscribeRemoval();
    unsubscribeRemoval = null;
  };

  const removalTransactionFromResult = (value) => {
    const nested = value?.transaction;
    return nested && transactionIdOf(nested) ? nested : value;
  };

  const refreshRemovalManagement = (
    value,
    reason = "removal-transaction",
    fromCommand = false,
  ) => {
    const transaction = removalTransactionFromResult(value);
    const transactionId = transactionIdOf(transaction);
    if (!transactionId) return false;
    const refreshKey = removalEventKey(transaction, transactionId);
    if (lastRemovalRefreshKey === refreshKey) return false;
    lastRemovalRefreshKey = refreshKey;
    lastRemovalRefreshTransactionId = transactionId;
    const terminalKey = isTerminalTransaction(transaction)
      ? removalTerminalKey(transaction, transactionId)
      : null;
    if (terminalKey) lastRemovalTerminalKey = terminalKey;
    if (fromCommand)
      pendingCommandRemovalRefresh = { transactionId, refreshKey, terminalKey };
    void refreshManagement(
      isTerminalTransaction(transaction) ? "removal-committed" : reason,
    );
    return true;
  };

  const applyRemoval = (
    transaction,
    token,
    reason = "event",
    fromEvent = false,
    expectedTransactionId = null,
    eventTokenRef = null,
  ) => {
    if (fromEvent && transactionIdOf(transaction) !== expectedTransactionId)
      return false;
    if (disposed || !removalIdentity.isCurrent(token)) return false;
    if (
      fromEvent &&
      isTerminalTransaction(transaction) &&
      removalTerminalKey(transaction, removal.transactionId) ===
        lastRemovalTerminalKey
    )
      return true;
    if (fromEvent) {
      token = removalIdentity.begin(undefined, "event");
      if (eventTokenRef) eventTokenRef.current = token;
    }
    if (!transaction) {
      clearRemovalSubscription();
      removalIdentity.invalidate();
      removal = Object.freeze({
        transactionId: null,
        transaction: null,
        query: Object.freeze({
          loading: false,
          error: null,
          reason: "missing",
        }),
      });
      publish();
      return false;
    }
    removal = Object.freeze({
      transactionId: transactionIdOf(transaction) || removal.transactionId,
      transaction,
      query: Object.freeze({ loading: false, error: null, reason }),
    });
    publish();
    if (isTerminalTransaction(transaction)) {
      const terminalKey = removalTerminalKey(
        transaction,
        removal.transactionId,
      );
      if (lastRemovalTerminalKey === terminalKey) return true;
      lastRemovalTerminalKey = terminalKey;
    }
    if (fromEvent || isTerminalTransaction(transaction))
      refreshRemovalManagement(transaction, "removal-transaction");
    return true;
  };

  const watchRemovalTransaction = async (transactionId) => {
    if (
      disposed ||
      !scope ||
      typeof transactionId !== "string" ||
      !transactionId
    )
      return false;
    clearRemovalSubscription();
    const token = removalIdentity.begin(
      {
        workspaceRuntimeId: scope.workspaceRuntimeId,
        clientId: scope.clientId,
        transactionId,
      },
      "watch",
    );
    const preserveRefresh = lastRemovalRefreshTransactionId === transactionId;
    const commandRefresh =
      pendingCommandRemovalRefresh?.transactionId === transactionId
        ? pendingCommandRemovalRefresh
        : null;
    pendingCommandRemovalRefresh = null;
    if (commandRefresh) {
      lastRemovalTerminalKey = commandRefresh.terminalKey;
      lastRemovalRefreshKey = commandRefresh.refreshKey;
      lastRemovalRefreshTransactionId = transactionId;
    } else if (!preserveRefresh) {
      lastRemovalTerminalKey = null;
      lastRemovalRefreshKey = null;
      lastRemovalRefreshTransactionId = null;
    }
    removal = Object.freeze({
      transactionId,
      transaction: null,
      query: Object.freeze({ loading: true, error: null, reason: "watch" }),
    });
    publish();
    if (typeof adapters.subscribeRemovalTransaction === "function") {
      const eventTokenRef = { current: token };
      unsubscribeRemoval = adapters.subscribeRemovalTransaction(
        transactionId,
        (transaction) =>
          applyRemoval(
            transaction,
            eventTokenRef.current,
            "event",
            true,
            transactionId,
            eventTokenRef,
          ),
      );
    }
    if (typeof adapters.getRemovalTransaction !== "function") return true;
    try {
      const transaction = await adapters.getRemovalTransaction({
        transactionId,
      });
      if (applyRemoval(transaction, token, "query")) return true;
      return Boolean(
        removal.transactionId === transactionId && removal.transaction,
      );
    } catch (value) {
      if (!removalIdentity.isCurrent(token)) return false;
      removal = Object.freeze({
        transactionId,
        transaction: null,
        query: Object.freeze({
          loading: false,
          error: safeError(value),
          reason: "watch",
        }),
      });
      publish();
      return false;
    }
  };

  const clearRemovalTransaction = () => {
    if (disposed) return;
    clearRemovalSubscription();
    removalIdentity.invalidate();
    lastRemovalTerminalKey = null;
    lastRemovalRefreshKey = null;
    lastRemovalRefreshTransactionId = null;
    pendingCommandRemovalRefresh = null;
    removal = Object.freeze({
      transactionId: null,
      transaction: null,
      query: Object.freeze({ loading: false, error: null, reason: null }),
    });
    publish();
  };

  const refreshManagement = async (reason = "manual") => {
    if (disposed || !scope || !scope.clientId || scope.clientId === "none")
      return false;
    const requestedClientId = scope.clientId;
    const token = managementIdentity.begin(
      {
        workspaceRuntimeId: scope.workspaceRuntimeId,
        clientId: requestedClientId,
      },
      reason,
    );
    query = Object.freeze({ loading: true, error: null, reason });
    publish();
    try {
      const next = await adapters.loadManagement(requestedClientId);
      if (
        !managementIdentity.isCurrent(token) ||
        requestedClientId !== scope.clientId
      )
        return false;
      management = Object.freeze({ ...EMPTY_MANAGEMENT, ...(next || {}) });
      query = Object.freeze({ loading: false, error: null, reason });
      publish();
      return true;
    } catch (value) {
      if (
        !managementIdentity.isCurrent(token) ||
        requestedClientId !== scope.clientId
      )
        return false;
      query = Object.freeze({
        loading: false,
        error: safeError(value),
        reason,
      });
      publish();
      return false;
    }
  };

  const refreshAfterCommand = async (
    name,
    reason = "command-result",
    result = null,
  ) => {
    if (REMOVAL_EVENT_COMMANDS.has(name)) {
      refreshRemovalManagement(result, reason, true);
      return;
    }
    if (COMMAND_SCOPES[name] === "management") await refreshManagement(reason);
  };

  const assertClientScope = (name, input) => {
    const extract = CLIENT_IDENTITY[name];
    if (!extract || !scope?.clientId || scope.clientId === "none") return;
    for (const clientId of extract(input)) {
      if (
        typeof clientId === "string" &&
        clientId &&
        clientId !== scope.clientId
      ) {
        const error = new Error("Content command client scope is invalid");
        error.code = "CONTENT_CLIENT_SCOPE_MISMATCH";
        throw error;
      }
    }
  };

  const runCommand = async (name, input) => {
    if (
      disposed ||
      !scope ||
      (COMMAND_SCOPES[name] !== null &&
        (!scope.clientId || scope.clientId === "none"))
    )
      throw new Error("Content command is unavailable");
    const adapter = adapters[name];
    if (typeof adapter !== "function")
      throw new Error(`Content command is unavailable: ${name}`);
    assertClientScope(name, input);
    const owner = commandOwners[name];
    if (owner.getSnapshot().busy) return { ignored: true };
    const commandScope =
      COMMAND_SCOPES[name] === null
        ? Object.freeze({ workspaceRuntimeId: scope.workspaceRuntimeId })
        : Object.freeze({
            workspaceRuntimeId: scope.workspaceRuntimeId,
            clientId: scope.clientId,
          });
    const commandClientId = scope.clientId;
    const isCommandScopeCurrent = () =>
      Boolean(
        !disposed &&
        scope &&
        scope.workspaceRuntimeId === commandScope.workspaceRuntimeId &&
        (COMMAND_SCOPES[name] === null || scope.clientId === commandClientId),
      );
    const token = owner.begin(commandScope);
    publish();
    try {
      const result = await adapter(input);
      if (!owner.isCurrent(token)) {
        await refreshAfterCommand(name, "stale-command-result");
        return staleContentCommandResult();
      }
      await refreshAfterCommand(name, "command-result", result);
      if (!owner.isCurrent(token) || !isCommandScopeCurrent())
        return staleContentCommandResult();
      if (name === "saveArticle" && typeof onArticleResult === "function")
        onArticleResult(result);
      owner.finalize(token, { result });
      publish();
      return result;
    } catch (value) {
      if (!owner.isCurrent(token)) {
        await refreshAfterCommand(name, "stale-command-result");
        return staleContentCommandResult();
      }
      const error = safeError(value);
      await refreshAfterCommand(name, "command-error");
      if (!owner.isCurrent(token) || !isCommandScopeCurrent())
        return staleContentCommandResult();
      owner.finalize(token, { error });
      publish();
      throw Object.assign(new Error(error.userMessage), error);
    }
  };

  // Keep command names explicit at the feature boundary so composed callers
  // retain stable TypeChecker symbols for each management capability.
  const commands = Object.freeze({
    getArticleEditor: (input) => runCommand("getArticleEditor", input),
    saveArticle: (input) => runCommand("saveArticle", input),
    prepareRegularUncertainResolution: (input) =>
      runCommand("prepareRegularUncertainResolution", input),
    confirmRegularAccepted: (input) =>
      runCommand("confirmRegularAccepted", input),
    confirmRegularNotAccepted: (input) =>
      runCommand("confirmRegularNotAccepted", input),
    previewRegularQueueAdmission: (input) =>
      runCommand("previewRegularQueueAdmission", input),
    admitRegularQueueItems: (input) =>
      runCommand("admitRegularQueueItems", input),
    previewPaidMediaPreflight: (input) =>
      runCommand("previewPaidMediaPreflight", input),
    confirmPaidMediaBatch: (input) =>
      runCommand("confirmPaidMediaBatch", input),
    removePendingQueueItems: (input) =>
      runCommand("removePendingQueueItems", input),
    cancelContentSubmissionBatch: (input) =>
      runCommand("cancelContentSubmissionBatch", input),
    previewContentArticleRemoval: (input) =>
      runCommand("previewContentArticleRemoval", input),
    trashContentArticles: (input) => runCommand("trashContentArticles", input),
    getContentArticleRemovalTransaction: (input) =>
      runCommand("getContentArticleRemovalTransaction", input),
    retryContentArticleRemovalTransaction: (input) =>
      runCommand("retryContentArticleRemovalTransaction", input),
    restoreContentArticle: (input) =>
      runCommand("restoreContentArticle", input),
    preparePermanentDeleteContentArticle: (input) =>
      runCommand("preparePermanentDeleteContentArticle", input),
    permanentlyDeleteContentArticle: (input) =>
      runCommand("permanentlyDeleteContentArticle", input),
  });

  publish();
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setArticleResultHandler(handler) {
      onArticleResult = typeof handler === "function" ? handler : null;
    },
    setScope(nextScope) {
      if (disposed) return;
      if (
        !nextScope ||
        typeof nextScope.workspaceRuntimeId !== "string" ||
        !nextScope.workspaceRuntimeId ||
        typeof nextScope.clientId !== "string"
      )
        throw new TypeError("Article management scope is invalid");
      if (
        scope?.workspaceRuntimeId === nextScope.workspaceRuntimeId &&
        scope?.clientId === nextScope.clientId
      )
        return;
      clearRemovalSubscription();
      lastRemovalTerminalKey = null;
      lastRemovalRefreshKey = null;
      lastRemovalRefreshTransactionId = null;
      pendingCommandRemovalRefresh = null;
      scope = Object.freeze({
        workspaceRuntimeId: nextScope.workspaceRuntimeId,
        clientId: nextScope.clientId,
      });
      managementIdentity.setScope(scope);
      removalIdentity.setScope(scope);
      management = EMPTY_MANAGEMENT;
      query = Object.freeze({ loading: false, error: null, reason: null });
      removal = Object.freeze({
        transactionId: null,
        transaction: null,
        query: Object.freeze({ loading: false, error: null, reason: null }),
      });
      Object.values(commandOwners).forEach((owner) => owner.invalidate());
      publish();
    },
    refreshManagement,
    watchRemovalTransaction,
    clearRemovalTransaction,
    commands,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearRemovalSubscription();
      lastRemovalRefreshTransactionId = null;
      pendingCommandRemovalRefresh = null;
      managementIdentity.dispose();
      removalIdentity.dispose();
      Object.values(commandOwners).forEach((owner) => owner.dispose());
      listeners.clear();
      scope = null;
      management = EMPTY_MANAGEMENT;
    },
  });
}

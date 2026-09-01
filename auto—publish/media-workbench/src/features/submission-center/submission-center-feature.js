import { createQueryIdentity } from "../../infrastructure/query-identity/query-identity.js";

function queryState(loading = false, error = null, reason = null) {
  return Object.freeze({ loading, error, reason });
}

function safeError(value) {
  return Object.freeze({
    code: value?.code || "SUBMISSION_CENTER_QUERY_FAILED",
    category: value?.category || "internal",
    retryability: value?.retryability || "safe",
    userMessage: value?.userMessage || value?.message || "无法读取投稿中心。",
  });
}

const EMPTY = Object.freeze({
  schemaVersion: 1,
  clientId: "",
  revision: 0,
  regular: Object.freeze({ groups: Object.freeze([]) }),
  paid: Object.freeze({ batches: Object.freeze([]) }),
  attention: Object.freeze({ items: Object.freeze([]) }),
  counts: Object.freeze({ regularItems: 0, paidBatches: 0, attentionItems: 0, total: 0 }),
  page: 1,
  pageSize: 100,
  hasMore: false,
  failures: Object.freeze([]),
});

export function createSubmissionCenterFeature(adapters = {}) {
  if (typeof adapters.getSnapshot !== "function")
    throw new TypeError("Submission center query dependency is required");
  const identity = createQueryIdentity({ feature: "submission-center", query: "snapshot" });
  const listeners = new Set();
  let disposed = false;
  let scope = null;
  let queryOptions = { page: 1, pageSize: 100 };
  let data = EMPTY;
  let query = queryState();
  let snapshot;

  function publish() {
    snapshot = Object.freeze({ scope, data, query });
    listeners.forEach((listener) => listener());
  }
  publish();

  const feature = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setScope(nextScope) {
      if (disposed) return false;
      if (!nextScope?.workspaceRuntimeId)
        throw new TypeError("Submission center scope is invalid");
      if (scope?.workspaceRuntimeId === nextScope.workspaceRuntimeId && scope?.clientId === nextScope.clientId)
        return false;
      scope = Object.freeze({
        workspaceRuntimeId: nextScope.workspaceRuntimeId,
        ...(nextScope.clientId ? { clientId: nextScope.clientId } : {}),
      });
      identity.setScope(scope);
      data = EMPTY;
      query = queryState();
      publish();
      return true;
    },
    clearScope() {
      if (disposed) return false;
      identity.invalidate();
      scope = null;
      data = EMPTY;
      query = queryState();
      publish();
      return true;
    },
    async refresh(reason = "manual") {
      if (disposed || !scope) return false;
      const token = identity.begin(scope, reason);
      query = queryState(true, null, reason);
      publish();
      try {
      const request = {
        ...(scope.clientId ? { clientId: scope.clientId } : {}),
        ...queryOptions,
      };
      const next = await adapters.getSnapshot(
        queryOptions.page === 1 && queryOptions.pageSize === 100
          ? (scope.clientId || request)
          : request,
      );
        if (!identity.isCurrent(token)) return false;
        if (next?.clientId !== scope.clientId && next?.clientId !== null)
          throw Object.assign(new Error("投稿中心客户范围不匹配。"), { code: "SUBMISSION_CENTER_SNAPSHOT_INVALID" });
        data = Object.freeze(next);
        query = queryState(false, null, reason);
        publish();
        return true;
      } catch (value) {
        if (!identity.isCurrent(token)) return false;
        data = EMPTY;
        query = queryState(false, safeError(value), reason);
        publish();
        return false;
      }
    },
    setPage(nextPage) {
      if (!Number.isInteger(nextPage) || nextPage < 1) return false;
      queryOptions = { ...queryOptions, page: nextPage };
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      identity.dispose();
      data = EMPTY;
      listeners.clear();
    },
  };
  return Object.freeze(feature);
}

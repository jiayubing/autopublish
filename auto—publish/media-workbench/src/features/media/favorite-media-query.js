import { createQueryIdentity } from "../../infrastructure/query-identity/query-identity.js";
import { DEFAULT_RESOURCE_PAGE_SIZE } from "./media-feature.js";

const emptyPage = () => ({
  items: [],
  total: 0,
  page: 1,
  totalPages: 0,
  hasPrev: false,
  hasNext: false,
  loading: false,
  errorMessage: undefined,
});

export function createFavoriteMediaQuery({ getPoolPage }) {
  const identity = createQueryIdentity({
    feature: "favorite-media",
    query: "page",
  });
  const listeners = new Set();
  let runtimeId = null;
  let requested = false;
  let disposed = false;
  let snapshot = emptyPage();
  function publish(next) {
    snapshot = Object.freeze(next);
    listeners.forEach((listener) => listener());
  }
  async function loadPage(page = 1) {
    if (disposed || !runtimeId) return;
    requested = true;
    const token = identity.begin(undefined, "page");
    publish({ ...snapshot, page, loading: true, errorMessage: undefined });
    try {
      const result = await getPoolPage({
        page,
        pageSize: DEFAULT_RESOURCE_PAGE_SIZE,
        resourceIds: [],
      });
      if (!identity.isCurrent(token)) return;
      publish({
        items: result.items,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        hasPrev: result.hasPrev,
        hasNext: result.hasNext,
        loading: false,
        errorMessage: undefined,
      });
    } catch (_) {
      if (identity.isCurrent(token))
        publish({
          ...snapshot,
          loading: false,
          errorMessage: "无法加载收藏媒体。",
        });
    }
  }
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(scope) {
      if (disposed || runtimeId === scope.workspaceRuntimeId) return;
      runtimeId = scope.workspaceRuntimeId;
      identity.setScope(scope);
      publish(emptyPage());
    },
    loadPage,
    refresh() {
      if (requested) return loadPage(snapshot.page);
    },
    dispose() {
      disposed = true;
      identity.dispose();
      listeners.clear();
    },
  });
}

import {
  createCommandOwner,
  createQueryIdentity,
} from "../../infrastructure/query-identity/query-identity.js";

export const DEFAULT_RESOURCE_PAGE_SIZE = 50;

const QUERY_NAMES = [
  "articles",
  "drafts",
  "resources",
  "pool",
  "balance",
  "orders",
];
const COMMAND_NAMES = [
  "scanArticles",
  "openArticle",
  "saveDraft",
  "selection",
  "refreshResources",
  "togglePool",
  "checkBalance",
  "prepareSubmission",
  "submitPrepared",
  "syncOrder",
  "openPublishedUrl",
];

function safeError(value, fallbackCode, fallbackMessage) {
  const candidateMessage =
    value && typeof value === "object" && typeof value.userMessage === "string"
      ? value.userMessage
      : value instanceof Error && typeof value.message === "string"
        ? value.message
        : null;
  const isSafeOperationalError = Boolean(
    value &&
    typeof value === "object" &&
    typeof value.code === "string" &&
    typeof value.category === "string" &&
    typeof value.retryability === "string" &&
    typeof candidateMessage === "string" &&
    candidateMessage.length <= 1000 &&
    !/[\x00-\x1f\x7f]/.test(candidateMessage),
  );
  return Object.freeze({
    code: value && typeof value.code === "string" ? value.code : fallbackCode,
    category: isSafeOperationalError ? value.category : "internal",
    retryability: isSafeOperationalError ? value.retryability : "manual-check",
    userMessage: isSafeOperationalError ? candidateMessage : fallbackMessage,
  });
}

function boundedItems(value) {
  return Array.isArray(value) ? value.slice(0, DEFAULT_RESOURCE_PAGE_SIZE) : [];
}

function emptyQuery() {
  return Object.freeze({ loading: false, error: null, reason: null });
}

function emptyPage() {
  return {
    items: [],
    total: 0,
    page: 1,
    pageSize: DEFAULT_RESOURCE_PAGE_SIZE,
    totalPages: 0,
    hasPrev: false,
    hasNext: false,
    query: emptyQuery(),
  };
}

function articleIdentity(article) {
  return (
    (article && (article.articleId || article.id || article.filename)) || null
  );
}

export function createMediaFeature(adapters = {}) {
  const required = [
    "getResourcePage",
    "searchResourcePage",
    "refreshResources",
    "getPoolPage",
    "addToPool",
    "removeFromPool",
    "getBalance",
    "getDrafts",
    "getDraft",
    "setDraft",
    "scanArticles",
    "previewArticle",
    "buildConfirmation",
    "submitSelected",
    "getOrders",
    "syncOrder",
    "openPublishedUrl",
  ];
  for (const name of required) {
    if (typeof adapters[name] !== "function")
      throw new TypeError(`Media feature dependency ${name} is required`);
  }

  const queries = Object.fromEntries(
    QUERY_NAMES.map((name) => [
      name,
      createQueryIdentity({ feature: "media", query: name }),
    ]),
  );
  const owners = Object.fromEntries(
    COMMAND_NAMES.map((name) => [
      name,
      createCommandOwner({ feature: "media", command: name }),
    ]),
  );
  const listeners = new Set();
  let disposed = false;
  let scope = null;
  let articles = { items: [], activeArticle: null, query: emptyQuery() };
  let drafts = { items: [], query: emptyQuery() };
  let resources = { ...emptyPage(), search: "" };
  let pool = { ...emptyPage(), memberResourceIds: [] };
  let balance = { value: 0, query: emptyQuery() };
  let orders = { items: [], query: emptyQuery() };
  let preflight = { data: null };
  let preparedArticles = [];
  let selectionRevision = 0;
  let syncingOrderNid = null;
  let snapshot;

  const publish = () => {
    const submissionCandidates = articles.items.filter(
      (article) =>
        Array.isArray(article.selectedResources) &&
        article.selectedResources.length > 0,
    );
    snapshot = Object.freeze({
      scope,
      articles: Object.freeze({
        ...articles,
        items: Object.freeze([...articles.items]),
      }),
      drafts: Object.freeze({
        ...drafts,
        items: Object.freeze([...drafts.items]),
      }),
      resources: Object.freeze({
        ...resources,
        items: Object.freeze([...resources.items]),
      }),
      pool: Object.freeze({
        ...pool,
        items: Object.freeze([...pool.items]),
        memberResourceIds: Object.freeze([...pool.memberResourceIds]),
      }),
      balance: Object.freeze({ ...balance }),
      orders: Object.freeze({
        ...orders,
        items: Object.freeze([...orders.items]),
        syncingOrderNid,
      }),
      preflight: Object.freeze({ ...preflight }),
      selectionRevision,
      readyForSubmission: submissionCandidates.length > 0,
      commands: Object.freeze(
        Object.fromEntries(
          Object.entries(owners).map(([name, owner]) => [
            name,
            owner.getSnapshot(),
          ]),
        ),
      ),
    });
    listeners.forEach((listener) => listener());
  };

  function beginQuery(name, reason, update) {
    const token = queries[name].begin(undefined, reason);
    update(Object.freeze({ loading: true, error: null, reason }));
    publish();
    return token;
  }

  async function loadArticles(reason = "manual") {
    if (disposed || !scope) return;
    const token = beginQuery("articles", reason, (query) => {
      articles = { ...articles, query };
    });
    try {
      const items = await adapters.scanArticles();
      if (!queries.articles.isCurrent(token)) return;
      const nextItems = Array.isArray(items) ? items : [];
      const activeId = articleIdentity(articles.activeArticle);
      const nextActive = activeId
        ? nextItems.find((item) => articleIdentity(item) === activeId) || null
        : null;
      articles = {
        items: nextItems,
        activeArticle: nextActive
          ? { ...articles.activeArticle, ...nextActive }
          : null,
        query: Object.freeze({ loading: false, error: null, reason }),
      };
      if (preflight.data) {
        preflight = { data: null };
        preparedArticles = [];
      }
      publish();
    } catch (value) {
      if (!queries.articles.isCurrent(token)) return;
      articles = {
        ...articles,
        query: Object.freeze({
          loading: false,
          error: safeError(
            value,
            "MEDIA_ARTICLES_QUERY_FAILED",
            "无法加载媒体稿件。",
          ),
          reason,
        }),
      };
      publish();
    }
  }

  async function loadDrafts(reason = "manual") {
    if (disposed || !scope) return;
    const token = beginQuery("drafts", reason, (query) => {
      drafts = { ...drafts, query };
    });
    try {
      const items = await adapters.getDrafts();
      if (!queries.drafts.isCurrent(token)) return;
      drafts = {
        items: Array.isArray(items) ? items : [],
        query: Object.freeze({ loading: false, error: null, reason }),
      };
      publish();
    } catch (value) {
      if (!queries.drafts.isCurrent(token)) return;
      drafts = {
        ...drafts,
        query: Object.freeze({
          loading: false,
          error: safeError(
            value,
            "MEDIA_DRAFTS_QUERY_FAILED",
            "无法加载媒体草稿。",
          ),
          reason,
        }),
      };
      publish();
    }
  }

  async function loadResourcePage(page = 1, reason = "manual") {
    if (disposed || !scope) return;
    const targetPage = Number.isInteger(page) && page > 0 ? page : 1;
    const token = beginQuery("resources", reason, (query) => {
      resources = { ...resources, page: targetPage, query };
    });
    try {
      const input = { page: targetPage, pageSize: DEFAULT_RESOURCE_PAGE_SIZE };
      const result = resources.search
        ? await adapters.searchResourcePage({
            query: resources.search,
            ...input,
          })
        : await adapters.getResourcePage(input);
      if (!queries.resources.isCurrent(token)) return;
      resources = {
        ...resources,
        ...result,
        items: boundedItems(result.items),
        pageSize: DEFAULT_RESOURCE_PAGE_SIZE,
        query: Object.freeze({ loading: false, error: null, reason }),
      };
      publish();
      await loadPoolPage(
        pool.page,
        reason,
        resources.items.map((item) => item.resourceId),
      );
    } catch (value) {
      if (!queries.resources.isCurrent(token)) return;
      resources = {
        ...resources,
        query: Object.freeze({
          loading: false,
          error: safeError(
            value,
            "MEDIA_RESOURCE_QUERY_FAILED",
            "无法加载媒体资源。",
          ),
          reason,
        }),
      };
      publish();
    }
  }

  async function loadPoolPage(
    page = 1,
    reason = "manual",
    resourceIds = resources.items.map((item) => item.resourceId),
  ) {
    if (disposed || !scope) return;
    const targetPage = Number.isInteger(page) && page > 0 ? page : 1;
    const token = beginQuery("pool", reason, (query) => {
      pool = { ...pool, page: targetPage, query };
    });
    try {
      const result = await adapters.getPoolPage({
        page: targetPage,
        pageSize: DEFAULT_RESOURCE_PAGE_SIZE,
        resourceIds: resourceIds.slice(0, 100),
      });
      if (!queries.pool.isCurrent(token)) return;
      pool = {
        ...pool,
        ...result,
        items: boundedItems(result.items),
        memberResourceIds: Array.isArray(result.memberResourceIds)
          ? result.memberResourceIds
              .filter((resourceId) => typeof resourceId === "string")
              .slice(0, 100)
          : [],
        pageSize: DEFAULT_RESOURCE_PAGE_SIZE,
        query: Object.freeze({ loading: false, error: null, reason }),
      };
      publish();
    } catch (value) {
      if (!queries.pool.isCurrent(token)) return;
      pool = {
        ...pool,
        query: Object.freeze({
          loading: false,
          error: safeError(
            value,
            "MEDIA_POOL_QUERY_FAILED",
            "无法加载资源池。",
          ),
          reason,
        }),
      };
      publish();
    }
  }

  async function refreshBalance(reason = "manual") {
    if (disposed || !scope) return;
    const token = beginQuery("balance", reason, (query) => {
      balance = { ...balance, query };
    });
    try {
      const value = await adapters.getBalance();
      if (!queries.balance.isCurrent(token)) return;
      balance = {
        value: Number.isFinite(value) ? value : 0,
        query: Object.freeze({ loading: false, error: null, reason }),
      };
      publish();
    } catch (value) {
      if (!queries.balance.isCurrent(token)) return;
      balance = {
        ...balance,
        query: Object.freeze({
          loading: false,
          error: safeError(
            value,
            "MEDIA_BALANCE_QUERY_FAILED",
            "无法读取媒体余额。",
          ),
          reason,
        }),
      };
      publish();
    }
  }

  async function refreshOrders(reason = "manual") {
    if (disposed || !scope) return;
    const token = beginQuery("orders", reason, (query) => {
      orders = { ...orders, query };
    });
    try {
      const items = await adapters.getOrders();
      if (!queries.orders.isCurrent(token)) return;
      orders = {
        items: Array.isArray(items) ? items : [],
        query: Object.freeze({ loading: false, error: null, reason }),
      };
      publish();
    } catch (value) {
      if (!queries.orders.isCurrent(token)) return;
      orders = {
        ...orders,
        query: Object.freeze({
          loading: false,
          error: safeError(
            value,
            "MEDIA_ORDERS_QUERY_FAILED",
            "无法加载订单。",
          ),
          reason,
        }),
      };
      publish();
    }
  }

  async function runCommand(
    name,
    action,
    fallbackCode,
    fallbackMessage,
    afterSuccess,
  ) {
    if (disposed || !scope || owners[name].getSnapshot().busy) return undefined;
    const token = owners[name].begin(scope);
    publish();
    try {
      const result = await action();
      if (!owners[name].isCurrent(token)) return undefined;
      if (afterSuccess) await afterSuccess(result, token);
      if (!owners[name].isCurrent(token)) return undefined;
      owners[name].finalize(token, { result });
      publish();
      return result;
    } catch (value) {
      if (owners[name].isCurrent(token)) {
        owners[name].finalize(token, {
          error: safeError(value, fallbackCode, fallbackMessage),
        });
        publish();
      }
      return undefined;
    }
  }

  function updateSelectedResources(updater) {
    const activeId = articleIdentity(articles.activeArticle);
    if (!activeId) return;
    const apply = (article) =>
      articleIdentity(article) === activeId
        ? {
            ...article,
            selectedResources: updater(article.selectedResources || []),
          }
        : article;
    articles = {
      ...articles,
      items: articles.items.map(apply),
      activeArticle: apply(articles.activeArticle),
    };
    preflight = { data: null };
    preparedArticles = [];
    selectionRevision += 1;
    const token = owners.selection.begin(scope);
    owners.selection.finalize(token, { result: { selectionRevision } });
    publish();
  }

  const feature = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(nextScope) {
      if (disposed) return;
      if (
        !nextScope ||
        typeof nextScope.workspaceRuntimeId !== "string" ||
        !nextScope.workspaceRuntimeId
      )
        throw new TypeError("Media scope is invalid");
      if (scope?.workspaceRuntimeId === nextScope.workspaceRuntimeId) return;
      scope = Object.freeze({
        workspaceRuntimeId: nextScope.workspaceRuntimeId,
      });
      for (const query of Object.values(queries)) query.setScope(scope);
      for (const owner of Object.values(owners)) owner.invalidate();
      articles = { items: [], activeArticle: null, query: emptyQuery() };
      drafts = { items: [], query: emptyQuery() };
      resources = { ...emptyPage(), search: "" };
      pool = { ...emptyPage(), memberResourceIds: [] };
      balance = { value: 0, query: emptyQuery() };
      orders = { items: [], query: emptyQuery() };
      preflight = { data: null };
      preparedArticles = [];
      selectionRevision = 0;
      syncingOrderNid = null;
      publish();
    },
    async refresh(reason = "manual") {
      await Promise.all([
        loadArticles(reason),
        loadDrafts(reason),
        loadResourcePage(1, reason),
        refreshBalance(reason),
        refreshOrders(reason),
      ]);
    },
    async refreshWorkbench(reason = "manual") {
      await Promise.all([
        loadArticles(reason),
        loadDrafts(reason),
        loadResourcePage(1, reason),
        refreshBalance(reason),
      ]);
    },
    loadArticles,
    loadDrafts,
    loadResourcePage,
    loadPoolPage,
    refreshBalance,
    refreshOrders,
    async searchResources(search) {
      resources = {
        ...resources,
        search: typeof search === "string" ? search.trim() : "",
        page: 1,
      };
      publish();
      await loadResourcePage(1, "manual");
    },
    scanArticles: () =>
      runCommand(
        "scanArticles",
        () => adapters.scanArticles(),
        "MEDIA_ARTICLE_SCAN_FAILED",
        "扫描媒体稿件失败。",
        async () => loadArticles("command-result"),
      ),
    openArticle(filename) {
      return runCommand(
        "openArticle",
        async () => {
          const [preview, draft] = await Promise.all([
            adapters.previewArticle(filename),
            adapters.getDraft(filename).catch(() => null),
          ]);
          return {
            ...preview,
            ...(draft || {}),
            filename,
            selectedResources:
              draft?.selectedResources || preview?.selectedResources || [],
          };
        },
        "MEDIA_ARTICLE_PREVIEW_FAILED",
        "无法打开媒体稿件。",
        (opened) => {
          const current = articles.items.find(
            (item) => articleIdentity(item) === filename,
          );
          const merged = { ...(current || {}), ...opened };
          articles = {
            ...articles,
            items: articles.items.map((item) =>
              articleIdentity(item) === filename ? merged : item,
            ),
            activeArticle: merged,
          };
          publish();
        },
      );
    },
    closeArticle() {
      articles = { ...articles, activeArticle: null };
      publish();
    },
    saveDraft(draft) {
      const targetId = articleIdentity(articles.activeArticle);
      return runCommand(
        "saveDraft",
        () => adapters.setDraft(draft.filename, draft),
        "MEDIA_DRAFT_SAVE_FAILED",
        "保存媒体草稿失败。",
        () => {
          const apply = (article) =>
            articleIdentity(article) === targetId
              ? {
                  ...article,
                  title: draft.title,
                  remark: draft.remark,
                  ignoreImages: draft.ignoreImages,
                  selectedResources: article.selectedResources || [],
                }
              : article;
          articles = {
            ...articles,
            items: articles.items.map(apply),
            activeArticle: apply(articles.activeArticle),
          };
          drafts = {
            ...drafts,
            items: [
              ...drafts.items.filter(
                (item) => item.filename !== draft.filename,
              ),
              {
                ...draft,
                selectedResources:
                  articles.activeArticle?.selectedResources ||
                  draft.selectedResources ||
                  [],
              },
            ],
          };
          publish();
        },
      );
    },
    removeSelectedResource(resourceId) {
      updateSelectedResources((items) =>
        items.filter((item) => item.resourceId !== resourceId),
      );
    },
    toggleSelectedResource(resource) {
      updateSelectedResources((items) =>
        items.some((item) => item.resourceId === resource.resourceId)
          ? items.filter((item) => item.resourceId !== resource.resourceId)
          : [...items, resource],
      );
    },
    refreshResources() {
      return runCommand(
        "refreshResources",
        () => adapters.refreshResources({ fetchAll: true }),
        "MEDIA_RESOURCE_REFRESH_FAILED",
        "刷新资源失败。",
        () => loadResourcePage(1, "command-result"),
      );
    },
    togglePool(resource) {
      const inPool =
        pool.items.some((item) => item.resourceId === resource.resourceId) ||
        pool.memberResourceIds.includes(resource.resourceId);
      return runCommand(
        "togglePool",
        () =>
          inPool
            ? adapters.removeFromPool(resource.resourceId)
            : adapters.addToPool(resource),
        "MEDIA_POOL_UPDATE_FAILED",
        "更新资源池失败。",
        () => loadPoolPage(pool.page, "command-result"),
      );
    },
    checkBalance() {
      return runCommand(
        "checkBalance",
        () => adapters.getBalance(),
        "MEDIA_BALANCE_QUERY_FAILED",
        "无法读取媒体余额。",
        (value) => {
          balance = {
            value: Number.isFinite(value) ? value : 0,
            query: Object.freeze({
              loading: false,
              error: null,
              reason: "command-result",
            }),
          };
          publish();
        },
      );
    },
    prepareSubmission() {
      const candidates = articles.items
        .filter(
          (article) =>
            Array.isArray(article.selectedResources) &&
            article.selectedResources.length > 0,
        )
        .map((article) => ({
          ...article,
          selectedResources: [...article.selectedResources],
        }));
      return runCommand(
        "prepareSubmission",
        () => adapters.buildConfirmation(candidates),
        "MEDIA_SUBMISSION_PREFLIGHT_FAILED",
        "媒体投稿预检失败。",
        (data) => {
          preparedArticles = candidates;
          preflight = { data };
          publish();
        },
      );
    },
    dismissPreflight() {
      preflight = { data: null };
      preparedArticles = [];
      publish();
    },
    submitPrepared() {
      const submissions = preparedArticles;
      return runCommand(
        "submitPrepared",
        async () => {
          if (!submissions.length) {
            throw Object.freeze({
              code: "SUBMISSION_INPUT_INVALID",
              category: "validation",
              retryability: "never",
              userMessage: "投稿预检已失效，请重新预检。",
            });
          }
          return adapters.submitSelected(submissions);
        },
        "MEDIA_SUBMISSION_FAILED",
        "媒体投稿失败。",
        async () => {
          await Promise.all([
            loadArticles("command-result"),
            refreshOrders("command-result"),
            refreshBalance("command-result"),
          ]);
          preflight = { data: null };
          preparedArticles = [];
          publish();
        },
      );
    },
    syncOrder(orderNid) {
      if (!orderNid) return undefined;
      syncingOrderNid = orderNid;
      publish();
      return runCommand(
        "syncOrder",
        () => adapters.syncOrder(orderNid),
        "MEDIA_ORDER_SYNC_FAILED",
        "同步订单失败。",
        async () => {
          await refreshOrders("command-result");
          syncingOrderNid = null;
          publish();
        },
      ).then((value) => {
        syncingOrderNid = null;
        publish();
        return value;
      });
    },
    openPublishedUrl(orderNid) {
      if (!orderNid) return undefined;
      return runCommand(
        "openPublishedUrl",
        () => adapters.openPublishedUrl(orderNid),
        "MEDIA_ORDER_OPEN_FAILED",
        "无法打开发布页面。",
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const query of Object.values(queries)) query.dispose();
      for (const owner of Object.values(owners)) owner.dispose();
      listeners.clear();
    },
  };
  publish();
  return Object.freeze(feature);
}

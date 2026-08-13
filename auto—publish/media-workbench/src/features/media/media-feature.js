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
  "refreshResources",
  "togglePool",
  "checkBalance",
  "syncOrder",
  "syncAllOrders",
  "prepareOrderCancellation",
  "cancelOrder",
  "prepareCancellationResolution",
  "confirmCancellationSucceeded",
  "confirmCancellationNotApplied",
  "prepareOrderStatusAnomalyResolution",
  "resumeOrderTracking",
  "confirmOrderPublished",
  "confirmOrderNotPublished",
  "openPublishedUrl",
];
const ORDER_MUTATION_COMMANDS = [
  "syncOrder",
  "syncAllOrders",
  "prepareOrderCancellation",
  "cancelOrder",
  "prepareCancellationResolution",
  "confirmCancellationSucceeded",
  "confirmCancellationNotApplied",
  "prepareOrderStatusAnomalyResolution",
  "resumeOrderTracking",
  "confirmOrderPublished",
  "confirmOrderNotPublished",
];

function safeError(value, fallbackCode, fallbackMessage) {
  const candidateMessage =
    value && typeof value === "object" && typeof value.userMessage === "string"
      ? value.userMessage
      : null;
  const candidateCode = value && typeof value.code === "string" &&
    /^[A-Z][A-Z0-9_]{1,127}$/.test(value.code)
    ? value.code
    : fallbackCode;
  const isSafeOperationalError = Boolean(
    value &&
    typeof value === "object" &&
    typeof value.code === "string" &&
    typeof value.category === "string" &&
    typeof value.retryability === "string" &&
    typeof candidateMessage === "string" &&
    candidateMessage.length <= 1000 &&
    !/[\\/\x00-\x1f\x7f]/.test(candidateMessage) &&
    !/\b(?:cookie|authorization|bearer|token|api[-_ ]?key|password|secret|header|body|database|path)\b/i.test(candidateMessage),
  );
  return Object.freeze({
    code: candidateCode,
    category: isSafeOperationalError ? value.category : "internal",
    retryability: isSafeOperationalError ? value.retryability : "manual-check",
    userMessage: isSafeOperationalError ? candidateMessage : fallbackMessage,
  });
}

function boundedItems(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .filter((item) => {
      const resourceId =
        item && typeof item.resourceId === "string" ? item.resourceId : null;
      if (!resourceId) return true;
      if (seen.has(resourceId)) return false;
      seen.add(resourceId);
      return true;
    })
    .slice(0, DEFAULT_RESOURCE_PAGE_SIZE);
}

function boundedResourceIds(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.filter((resourceId) => typeof resourceId === "string")),
  ].slice(0, 100);
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
    "scanArticles",
    "getOrders",
    "syncOrder",
    "syncAllOrders",
    "prepareOrderCancellation",
    "cancelOrder",
    "prepareCancellationResolution",
    "confirmCancellationSucceeded",
    "confirmCancellationNotApplied",
    "prepareOrderStatusAnomalyResolution",
    "resumeOrderTracking",
    "confirmOrderPublished",
    "confirmOrderNotPublished",
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
  let articles = { items: [], query: emptyQuery() };
  let drafts = { items: [], query: emptyQuery() };
  let resources = { ...emptyPage(), search: "" };
  let pool = { ...emptyPage(), memberResourceIds: [] };
  let balance = { value: 0, query: emptyQuery() };
  let orders = {
    items: [],
    query: emptyQuery(),
    syncFailures: [],
    anomalyPreparations: {},
  };
  let autoRefreshedOrderScope = null;
  let syncingOrderNid = null;
  let syncingOrderRevision = 0;
  let snapshot;

  const publish = () => {
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
        syncFailures: Object.freeze([...(orders.syncFailures || [])]),
        anomalyPreparations: Object.freeze({
          ...(orders.anomalyPreparations || {}),
        }),
        syncingOrderNid,
        mutationBusy: ORDER_MUTATION_COMMANDS.some(
          (name) => owners[name].getSnapshot().busy,
        ),
      }),
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
      articles = {
        items: nextItems,
        query: Object.freeze({ loading: false, error: null, reason }),
      };
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
        memberResourceIds: boundedResourceIds(result.memberResourceIds),
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
      const nextItems = Array.isArray(items) ? items : [];
      const openAnomalyOrderIds = new Set(
        nextItems
          .filter((item) => item && item.anomaly)
          .map((item) => item.orderNid),
      );
      orders = {
        ...orders,
        items: nextItems,
        anomalyPreparations: Object.fromEntries(
          Object.entries(orders.anomalyPreparations || {}).filter(([orderId]) =>
            openAnomalyOrderIds.has(orderId),
          ),
        ),
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
    commandOptions,
  ) {
    const options = commandOptions || {};
    if (
      disposed ||
      !scope ||
      owners[name].getSnapshot().busy ||
      (options.exclusiveOrderMutation === true &&
        ORDER_MUTATION_COMMANDS.some(
          (commandName) => owners[commandName].getSnapshot().busy,
        ))
    )
      return undefined;
    const token = owners[name].begin(scope);
    if (typeof options.onAcquired === "function") options.onAcquired(token);
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
        if (typeof options.onError === "function") options.onError(value);
        owners[name].finalize(token, {
          error: safeError(value, fallbackCode, fallbackMessage),
        });
        publish();
      }
      return undefined;
    }
  }

  function resolvePreparedOrderStatusAnomaly(orderId, action, adapter) {
    const preparation = orders.anomalyPreparations[orderId];
    if (!preparation) {
      return runCommand(
        action,
        () => {
          const error = new Error("订单状态核对需要先重新准备证据");
          error.code = "ORDER_STATUS_ANOMALY_PREPARATION_REQUIRED";
          throw error;
        },
        "ORDER_STATUS_ANOMALY_RESOLUTION_FAILED",
        "订单状态核对未能安全完成。",
        null,
        { exclusiveOrderMutation: true },
      );
    }
    if (!preparation.allowedActions.includes(action)) return undefined;
    return runCommand(
      action,
      () =>
        adapter({
          orderId,
          confirmationToken: preparation.confirmationToken,
        }),
      "ORDER_STATUS_ANOMALY_RESOLUTION_FAILED",
      "订单状态核对未能安全完成。",
      async () => {
        const next = { ...orders.anomalyPreparations };
        delete next[orderId];
        orders = { ...orders, anomalyPreparations: next };
        await refreshOrders("command-result");
      },
      {
        exclusiveOrderMutation: true,
        onError(value) {
          if (
            value &&
            [
              "ORDER_STATUS_ANOMALY_TOKEN_STALE",
              "ORDER_STATUS_ANOMALY_STATE_STALE",
              "ORDER_STATUS_ANOMALY_QUERY_STALE",
            ].includes(value.code)
          ) {
            const next = { ...orders.anomalyPreparations };
            delete next[orderId];
            orders = { ...orders, anomalyPreparations: next };
            publish();
          }
        },
      },
    );
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
      articles = { items: [], query: emptyQuery() };
      drafts = { items: [], query: emptyQuery() };
      resources = { ...emptyPage(), search: "" };
      pool = { ...emptyPage(), memberResourceIds: [] };
      balance = { value: 0, query: emptyQuery() };
      orders = {
        items: [],
        query: emptyQuery(),
        syncFailures: [],
        anomalyPreparations: {},
      };
      autoRefreshedOrderScope = null;
      syncingOrderNid = null;
      syncingOrderRevision += 1;
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
    openOrders() {
      if (!scope || autoRefreshedOrderScope === scope.workspaceRuntimeId)
        return undefined;
      autoRefreshedOrderScope = scope.workspaceRuntimeId;
      return feature.syncAllOrders();
    },
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
    syncOrder(orderNid) {
      if (!orderNid) return undefined;
      let requestRevision = null;
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
        {
          exclusiveOrderMutation: true,
          onAcquired() {
            requestRevision = ++syncingOrderRevision;
            syncingOrderNid = orderNid;
          },
        },
      ).then((value) => {
        if (
          requestRevision === syncingOrderRevision &&
          syncingOrderNid === orderNid
        ) {
          syncingOrderNid = null;
          publish();
        }
        return value;
      });
    },
    syncAllOrders() {
      return runCommand(
        "syncAllOrders",
        () => adapters.syncAllOrders(),
        "MEDIA_ORDER_SYNC_FAILED",
        "刷新订单失败。",
        async (result) => {
          orders = {
            ...orders,
            syncFailures: Array.isArray(result?.items)
              ? result.items.filter((item) => !item.ok)
              : [],
          };
          await refreshOrders("command-result");
        },
        { exclusiveOrderMutation: true },
      );
    },
    prepareOrderCancellation(orderId) {
      if (!orderId) return undefined;
      return runCommand(
        "prepareOrderCancellation",
        () => adapters.prepareOrderCancellation(orderId),
        "ORDER_CANCELLATION_PREPARE_FAILED",
        "无法准备取消订单。",
        undefined,
        { exclusiveOrderMutation: true },
      );
    },
    cancelOrder(input) {
      return runCommand(
        "cancelOrder",
        () => adapters.cancelOrder(input),
        "ORDER_CANCELLATION_FAILED",
        "取消结果不确定，请人工核对。",
        () => refreshOrders("command-result"),
        { exclusiveOrderMutation: true },
      );
    },
    prepareCancellationResolution(cancellationAttemptId) {
      return runCommand(
        "prepareCancellationResolution",
        () => adapters.prepareCancellationResolution(cancellationAttemptId),
        "ORDER_CANCELLATION_RESOLUTION_PREPARE_FAILED",
        "无法核对取消结果。",
        undefined,
        { exclusiveOrderMutation: true },
      );
    },
    confirmCancellationSucceeded(input) {
      return runCommand(
        "confirmCancellationSucceeded",
        () => adapters.confirmCancellationSucceeded(input),
        "ORDER_CANCELLATION_RESOLUTION_FAILED",
        "无法确认订单已取消。",
        () => refreshOrders("command-result"),
        { exclusiveOrderMutation: true },
      );
    },
    confirmCancellationNotApplied(input) {
      return runCommand(
        "confirmCancellationNotApplied",
        () => adapters.confirmCancellationNotApplied(input),
        "ORDER_CANCELLATION_RESOLUTION_FAILED",
        "无法确认取消未生效。",
        () => refreshOrders("command-result"),
        { exclusiveOrderMutation: true },
      );
    },
    prepareOrderStatusAnomalyResolution(orderId) {
      if (!orderId) return undefined;
      if (orders.anomalyPreparations[orderId]) {
        const next = { ...orders.anomalyPreparations };
        delete next[orderId];
        orders = { ...orders, anomalyPreparations: next };
        publish();
      }
      return runCommand(
        "prepareOrderStatusAnomalyResolution",
        () => adapters.prepareOrderStatusAnomalyResolution(orderId),
        "ORDER_STATUS_ANOMALY_PREPARE_FAILED",
        "无法准备订单状态核对。",
        (preparation) => {
          orders = {
            ...orders,
            anomalyPreparations: {
              ...orders.anomalyPreparations,
              [orderId]: preparation,
            },
          };
          publish();
        },
        { exclusiveOrderMutation: true },
      );
    },
    resumeOrderTracking(orderId) {
      return resolvePreparedOrderStatusAnomaly(
        orderId,
        "resumeOrderTracking",
        adapters.resumeOrderTracking,
      );
    },
    confirmOrderPublished(orderId) {
      return resolvePreparedOrderStatusAnomaly(
        orderId,
        "confirmOrderPublished",
        adapters.confirmOrderPublished,
      );
    },
    confirmOrderNotPublished(orderId) {
      return resolvePreparedOrderStatusAnomaly(
        orderId,
        "confirmOrderNotPublished",
        adapters.confirmOrderNotPublished,
      );
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
      publish();
      listeners.clear();
    },
  };
  publish();
  return Object.freeze(feature);
}

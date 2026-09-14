const NOT_CONFIGURED_CODES = new Set(["MEDIA_CONFIG_NOT_SET"]);

function errorCode(value) {
  return value && typeof value.code === "string" ? value.code : "";
}

function safeError(value, fallbackMessage) {
  const code = errorCode(value) || "MEDIA_BALANCE_QUERY_FAILED";
  const userMessage =
    value &&
    typeof value === "object" &&
    typeof value.userMessage === "string" &&
    value.userMessage.length <= 1000
      ? value.userMessage
      : fallbackMessage;
  return Object.freeze({ code, userMessage });
}

function snapshotOf(state) {
  return Object.freeze({
    status: state.status,
    value: state.value,
    query: Object.freeze({ ...state.query }),
  });
}

export function createMediaBalanceFeature(adapters = {}) {
  if (typeof adapters.getBalance !== "function")
    throw new TypeError("Media balance query dependency is required");
  const listeners = new Set();
  let disposed = false;
  let request = 0;
  let state = {
    status: "idle",
    value: null,
    query: { loading: false, error: null, reason: null },
  };
  let snapshot = snapshotOf(state);

  const publish = () => {
    snapshot = snapshotOf(state);
    listeners.forEach((listener) => listener());
  };

  const feature = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async refresh(reason = "manual") {
      if (disposed) return snapshot;
      const token = ++request;
      state = {
        status: "loading",
        value: state.status === "ready" ? state.value : null,
        query: { loading: true, error: null, reason },
      };
      publish();
      try {
        const value = await adapters.getBalance();
        if (disposed || token !== request) return snapshot;
        if (Number.isFinite(value)) {
          state = {
            status: "ready",
            value,
            query: { loading: false, error: null, reason },
          };
        } else {
          state = {
            status: "error",
            value: null,
            query: {
              loading: false,
              error: safeError(null, "无法读取媒体余额。"),
              reason,
            },
          };
        }
        publish();
        return snapshot;
      } catch (value) {
        if (disposed || token !== request) return snapshot;
        if (NOT_CONFIGURED_CODES.has(errorCode(value))) {
          state = {
            status: "notConfigured",
            value: null,
            query: { loading: false, error: null, reason },
          };
        } else {
          state = {
            status: "error",
            value: null,
            query: {
              loading: false,
              error: safeError(value, "无法读取媒体余额。"),
              reason,
            },
          };
        }
        publish();
        return snapshot;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      request += 1;
      listeners.clear();
    },
  };
  return Object.freeze(feature);
}

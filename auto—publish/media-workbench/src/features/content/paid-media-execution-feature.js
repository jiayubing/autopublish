import {
  createCommandOwner,
  createQueryIdentity,
} from "../../infrastructure/query-identity/query-identity.js";

function safeError(value) {
  const safe = Boolean(
    value &&
      typeof value === "object" &&
      typeof value.code === "string" &&
      typeof value.category === "string" &&
      typeof value.retryability === "string" &&
      typeof value.userMessage === "string",
  );
  return Object.freeze({
    code:
      value && typeof value.code === "string"
        ? value.code
        : "PAID_MEDIA_EXECUTION_FAILED",
    category: safe ? value.category : "internal",
    retryability: safe ? value.retryability : "manual-check",
    userMessage:
      safe
        ? value.userMessage
        : value instanceof Error && value.message
        ? value.message
        : "付费批次操作未能安全完成。",
  });
}

export function createPaidMediaExecutionFeature(adapters = {}) {
  for (const name of [
    "listPaidMediaBatches",
    "startPaidMediaBatch",
    "pausePaidMediaBatch",
    "cancelRemainingPaidMediaBatchItems",
  ]) {
    if (typeof adapters[name] !== "function")
      throw new TypeError(
        `Paid-media execution dependency is required: ${name}`,
      );
  }

  const queryIdentity = createQueryIdentity({
    feature: "content",
    query: "paidMediaExecution",
  });
  const commandOwners = Object.freeze({
    startPaidMediaBatch: createCommandOwner({
      feature: "content",
      command: "startPaidMediaBatch",
    }),
    pausePaidMediaBatch: createCommandOwner({
      feature: "content",
      command: "pausePaidMediaBatch",
    }),
    cancelRemainingPaidMediaBatchItems: createCommandOwner({
      feature: "content",
      command: "cancelRemainingPaidMediaBatchItems",
    }),
    prepareBindPaidOrderNumber: createCommandOwner({
      feature: "content",
      command: "prepareBindPaidOrderNumber",
    }),
    bindPaidOrderNumber: createCommandOwner({
      feature: "content",
      command: "bindPaidOrderNumber",
    }),
    prepareConfirmPaidOrderAbsent: createCommandOwner({
      feature: "content",
      command: "prepareConfirmPaidOrderAbsent",
    }),
    confirmPaidOrderAbsent: createCommandOwner({
      feature: "content",
      command: "confirmPaidOrderAbsent",
    }),
  });
  const listeners = new Set();
  let disposed = false;
  let scope = null;
  let items = Object.freeze([]);
  let query = Object.freeze({ loading: false, error: null, reason: null });
  let snapshot;

  const publish = () => {
    snapshot = Object.freeze({
      items,
      query,
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

  const refresh = async (reason = "manual") => {
    if (disposed || !scope) return false;
    const token = queryIdentity.begin(scope, reason);
    query = Object.freeze({ loading: true, error: null, reason });
    publish();
    try {
      const next = await adapters.listPaidMediaBatches();
      if (!queryIdentity.isCurrent(token)) return false;
      items = Object.freeze(Array.isArray(next) ? [...next] : []);
      query = Object.freeze({ loading: false, error: null, reason });
      publish();
      return true;
    } catch (value) {
      if (!queryIdentity.isCurrent(token)) return false;
      query = Object.freeze({
        loading: false,
        error: safeError(value),
        reason,
      });
      publish();
      return false;
    }
  };

  const runCommand = async (name, input) => {
    if (disposed || !scope)
      throw new Error("Paid-media command is unavailable");
    const owner = commandOwners[name];
    if (owner.getSnapshot().busy) return { ignored: true };
    const commandScope = scope;
    const token = owner.begin(commandScope);
    publish();
    try {
      const result = await adapters[name](input);
      await refresh("command-result");
      if (!owner.isCurrent(token)) return { stale: true };
      owner.finalize(token, { result });
      publish();
      return result;
    } catch (value) {
      await refresh("command-error");
      if (!owner.isCurrent(token)) return { stale: true };
      const error = safeError(value);
      owner.finalize(token, { error });
      publish();
      throw Object.assign(new Error(error.userMessage), error);
    }
  };

  publish();
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(nextScope) {
      if (disposed) return;
      if (scope?.workspaceRuntimeId === nextScope?.workspaceRuntimeId) return;
      scope = nextScope?.workspaceRuntimeId
        ? Object.freeze({ workspaceRuntimeId: nextScope.workspaceRuntimeId })
        : null;
      queryIdentity.setScope(scope);
      items = Object.freeze([]);
      query = Object.freeze({ loading: false, error: null, reason: null });
      Object.values(commandOwners).forEach((owner) => owner.invalidate());
      publish();
    },
    refresh,
    commands: Object.freeze({
      startPaidMediaBatch: (input) => runCommand("startPaidMediaBatch", input),
      pausePaidMediaBatch: (input) => runCommand("pausePaidMediaBatch", input),
      cancelRemainingPaidMediaBatchItems: (input) =>
        runCommand("cancelRemainingPaidMediaBatchItems", input),
      prepareBindPaidOrderNumber: (input) =>
        runCommand("prepareBindPaidOrderNumber", input),
      bindPaidOrderNumber: (input) => runCommand("bindPaidOrderNumber", input),
      prepareConfirmPaidOrderAbsent: (input) =>
        runCommand("prepareConfirmPaidOrderAbsent", input),
      confirmPaidOrderAbsent: (input) =>
        runCommand("confirmPaidOrderAbsent", input),
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      queryIdentity.dispose();
      Object.values(commandOwners).forEach((owner) => owner.dispose());
      listeners.clear();
      scope = null;
      items = Object.freeze([]);
    },
  });
}

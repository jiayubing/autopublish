const KNOWN_SCOPES = Object.freeze([
  "platformQueue",
  "articleAttention",
  "articleManagement",
  "orders",
  "contentSources",
  "mediaWorkbench",
  "submissionCenter",
]);
const KNOWN_SCOPE_SET = new Set(KNOWN_SCOPES);
const RUNTIME_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const REASON_CODE = /^[A-Za-z0-9._:-]{1,128}$/;

function safeDiagnostic(code) {
  return Object.freeze({ code, category: "workspace-invalidation" });
}

function validEvent(event) {
  return Boolean(
    event &&
    typeof event === "object" &&
    !Array.isArray(event) &&
    Object.keys(event).every((key) =>
      [
        "schemaVersion",
        "workspaceRuntimeId",
        "revision",
        "scopes",
        "reasonCode",
      ].includes(key),
    ) &&
    (event.schemaVersion === undefined || event.schemaVersion === 1) &&
    typeof event.workspaceRuntimeId === "string" &&
    RUNTIME_ID.test(event.workspaceRuntimeId) &&
    Number.isSafeInteger(event.revision) &&
    event.revision >= 1 &&
    Array.isArray(event.scopes) &&
    event.scopes.length <= 32 &&
    typeof event.reasonCode === "string" &&
    REASON_CODE.test(event.reasonCode),
  );
}

export function createWorkspaceCoordinator(options = {}) {
  const transportSubscribe = options.subscribe;
  const diagnose =
    typeof options.diagnose === "function" ? options.diagnose : () => {};
  if (typeof transportSubscribe !== "function")
    throw new TypeError("Workspace invalidation transport is required");
  const registrations = new Map();
  const snapshotListeners = new Set();
  let unsubscribe = null;
  let started = false;
  let disposed = false;
  let workspaceRuntimeId = null;
  let lastRevision = 0;
  let snapshot = Object.freeze({
    workspaceRuntimeId: null,
    lastRevision: 0,
    scopes: Object.freeze([]),
  });

  const publishSnapshot = () => {
    snapshot = Object.freeze({
      workspaceRuntimeId,
      lastRevision,
      scopes: Object.freeze([...registrations.keys()]),
    });
    snapshotListeners.forEach((listener) => listener());
  };

  const notify = (scope, kind, event) => {
    const listener = registrations.get(scope);
    if (!listener) return;
    listener(
      Object.freeze({
        kind,
        workspaceRuntimeId: event?.workspaceRuntimeId || workspaceRuntimeId,
        revision: event?.revision || lastRevision,
        reasonCode: event?.reasonCode || "WORKSPACE_INITIAL_LOAD",
        scope,
      }),
    );
  };

  const refreshAll = (kind, event) => {
    for (const scope of registrations.keys()) notify(scope, kind, event);
  };

  const consume = (event) => {
    if (disposed) return;
    if (
      event?.kind === "transport-diagnostic" &&
      event.code === "IPC_EVENT_INVALID"
    ) {
      diagnose(safeDiagnostic("WORKSPACE_INVALIDATION_TRANSPORT_REJECTED"));
      return;
    }
    if (!validEvent(event)) {
      diagnose(safeDiagnostic("WORKSPACE_INVALIDATION_EVENT_REJECTED"));
      return;
    }
    const unknownScopes = event.scopes.filter(
      (scope) => !KNOWN_SCOPE_SET.has(scope),
    );
    if (unknownScopes.length)
      diagnose(safeDiagnostic("WORKSPACE_INVALIDATION_UNKNOWN_SCOPE"));

    if (workspaceRuntimeId && event.workspaceRuntimeId !== workspaceRuntimeId) {
      workspaceRuntimeId = event.workspaceRuntimeId;
      lastRevision = event.revision;
      refreshAll("runtime-switch", event);
      publishSnapshot();
      return;
    }
    if (!workspaceRuntimeId) workspaceRuntimeId = event.workspaceRuntimeId;
    if (event.revision <= lastRevision) return;
    if (lastRevision > 0 && event.revision !== lastRevision + 1) {
      lastRevision = event.revision;
      diagnose(safeDiagnostic("WORKSPACE_INVALIDATION_REVISION_GAP"));
      refreshAll("revision-gap", event);
      publishSnapshot();
      return;
    }
    lastRevision = event.revision;
    for (const scope of new Set(event.scopes)) {
      if (KNOWN_SCOPE_SET.has(scope)) notify(scope, "invalidation", event);
    }
    publishSnapshot();
  };

  const stop = () => {
    if (disposed) return;
    if (typeof unsubscribe === "function") unsubscribe();
    unsubscribe = null;
    started = false;
  };

  return Object.freeze({
    register(scope, listener) {
      if (disposed) throw new Error("Workspace coordinator is disposed");
      if (!KNOWN_SCOPE_SET.has(scope) || typeof listener !== "function")
        throw new TypeError("Workspace scope registration is invalid");
      if (registrations.has(scope))
        throw new Error(`Workspace scope already has an owner: ${scope}`);
      registrations.set(scope, listener);
      publishSnapshot();
      if (started) notify(scope, "initial", null);
      return () => {
        if (registrations.get(scope) === listener) {
          registrations.delete(scope);
          publishSnapshot();
        }
      };
    },
    subscribe(listener) {
      if (typeof listener !== "function")
        throw new TypeError("Workspace snapshot listener is invalid");
      snapshotListeners.add(listener);
      return () => snapshotListeners.delete(listener);
    },
    initialize(identity) {
      if (
        disposed ||
        !identity ||
        typeof identity !== "object" ||
        Array.isArray(identity) ||
        Object.keys(identity).some(
          (key) => !["workspaceRuntimeId", "revision"].includes(key),
        ) ||
        typeof identity.workspaceRuntimeId !== "string" ||
        !RUNTIME_ID.test(identity.workspaceRuntimeId) ||
        !Number.isSafeInteger(identity.revision) ||
        identity.revision < 0
      )
        return false;
      if (
        workspaceRuntimeId === identity.workspaceRuntimeId &&
        identity.revision <= lastRevision
      )
        return false;
      const kind =
        workspaceRuntimeId && workspaceRuntimeId !== identity.workspaceRuntimeId
          ? "runtime-switch"
          : "identity";
      workspaceRuntimeId = identity.workspaceRuntimeId;
      lastRevision = identity.revision;
      refreshAll(kind, {
        workspaceRuntimeId,
        revision: lastRevision,
        reasonCode: "WORKSPACE_IDENTITY_SYNC",
      });
      publishSnapshot();
      return true;
    },
    start() {
      if (disposed || started) return;
      started = true;
      unsubscribe = transportSubscribe(consume);
      refreshAll("initial", null);
    },
    stop,
    getSnapshot() {
      return snapshot;
    },
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      registrations.clear();
      workspaceRuntimeId = null;
      lastRevision = 0;
      snapshotListeners.clear();
      publishSnapshot();
    },
  });
}

export { KNOWN_SCOPES };

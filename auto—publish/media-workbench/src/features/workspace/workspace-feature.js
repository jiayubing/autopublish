import {
  createCommandOwner,
  createQueryIdentity,
} from "../../infrastructure/query-identity/query-identity.js";

const COMMANDS = Object.freeze([
  "chooseDirectory",
  "confirmSelection",
  "cancelSelection",
  "openCurrent",
  "requestSwitch",
]);

function safeError(value, fallback) {
  return Object.freeze({
    code:
      typeof value?.code === "string"
        ? value.code
        : "WORKSPACE_OPERATION_FAILED",
    userMessage: fallback,
  });
}

export function createWorkspaceFeature(bridge = {}) {
  const bootstrapIdentity = createQueryIdentity({
    feature: "workspace",
    query: "bootstrap",
  });
  const currentIdentity = createQueryIdentity({
    feature: "workspace",
    query: "current",
  });
  const owners = Object.fromEntries(
    COMMANDS.map((command) => [
      command,
      createCommandOwner({ feature: "workspace", command }),
    ]),
  );
  const scope = Object.freeze({ installationId: "desktop" });
  bootstrapIdentity.setScope(scope);
  currentIdentity.setScope(scope);
  const listeners = new Set();
  let disposed = false;
  let bootstrap = { data: null, query: { loading: false, error: null } };
  let current = { data: null, query: { loading: false, error: null } };
  let selection = { data: null, query: { loading: false, error: null } };
  let snapshot;

  function publish() {
    snapshot = Object.freeze({
      bootstrap: Object.freeze({
        ...bootstrap,
        query: Object.freeze({ ...bootstrap.query }),
      }),
      current: Object.freeze({
        ...current,
        query: Object.freeze({ ...current.query }),
      }),
      selection: Object.freeze({
        ...selection,
        query: Object.freeze({ ...selection.query }),
      }),
      commands: Object.freeze(
        Object.fromEntries(
          COMMANDS.map((name) => [name, owners[name].getSnapshot()]),
        ),
      ),
    });
    listeners.forEach((listener) => listener());
  }
  publish();

  async function query(name, identity, loader, fallback) {
    if (disposed) return undefined;
    const token = identity.begin(undefined, "initial");
    const previous = name === "bootstrap" ? bootstrap : current;
    const loadingState = { ...previous, query: { loading: true, error: null } };
    if (name === "bootstrap") bootstrap = loadingState;
    else current = loadingState;
    publish();
    try {
      const data = await loader();
      if (!identity.isCurrent(token)) return undefined;
      const next = { data, query: { loading: false, error: null } };
      if (name === "bootstrap") bootstrap = next;
      else current = next;
      publish();
      return data;
    } catch (value) {
      if (!identity.isCurrent(token)) return undefined;
      const data =
        name === "bootstrap"
          ? {
              state: "invalid",
              configured: false,
              environmentManaged: false,
              label: "工作区状态不可用",
              selection: null,
              errorCode: "WORKSPACE_BOOTSTRAP_FAILED",
              changed: null,
            }
          : previous.data;
      const next = {
        data,
        query: { loading: false, error: safeError(value, fallback) },
      };
      if (name === "bootstrap") bootstrap = next;
      else current = next;
      publish();
      return undefined;
    }
  }

  async function runCommand(name, input, fallback) {
    if (disposed) return undefined;
    const owner = owners[name];
    if (owner.getSnapshot().busy) return { ignored: true };
    const token = owner.begin(scope);
    publish();
    try {
      const result = await bridge[name](input);
      if (!owner.isCurrent(token)) return undefined;
      owner.finalize(token, { result });
      if (
        [
          "chooseDirectory",
          "confirmSelection",
          "cancelSelection",
          "requestSwitch",
        ].includes(name)
      ) {
        selection = { data: result, query: { loading: false, error: null } };
        if (result?.state === "ready" || result?.state === "relaunching")
          bootstrap = { data: result, query: { loading: false, error: null } };
      }
      publish();
      return result;
    } catch (value) {
      if (owner.isCurrent(token)) {
        const error = safeError(value, fallback);
        owner.finalize(token, { error });
        selection = { ...selection, query: { loading: false, error } };
        publish();
      }
      throw value;
    } finally {
      if (owner.isCurrent(token)) {
        owner.finalize(token, {});
        publish();
      }
    }
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async initialize() {
      const [bootstrapResult] = await Promise.all([
        query(
          "bootstrap",
          bootstrapIdentity,
          bridge.getBootstrapState,
          "工作区状态检查失败",
        ),
        query(
          "current",
          currentIdentity,
          bridge.getCurrent,
          "无法读取当前工作区",
        ),
      ]);
      if (!disposed && selection.data === null && bootstrapResult) {
        selection = {
          data: bootstrapResult,
          query: { loading: false, error: null },
        };
        publish();
      }
      return bootstrapResult;
    },
    refreshCurrent: () =>
      query(
        "current",
        currentIdentity,
        bridge.getCurrent,
        "无法读取当前工作区",
      ),
    chooseDirectory: () =>
      runCommand("chooseDirectory", undefined, "无法选择工作区"),
    confirmSelection() {
      const token = selection.data?.selection?.token;
      if (typeof token !== "string" || !token)
        return Promise.resolve(undefined);
      return runCommand("confirmSelection", { token }, "无法确认工作区");
    },
    cancelSelection: () =>
      runCommand("cancelSelection", undefined, "无法取消工作区选择"),
    openCurrent: () =>
      runCommand("openCurrent", undefined, "无法打开当前工作区"),
    requestSwitch: () =>
      runCommand("requestSwitch", undefined, "无法切换工作区"),
    dispose() {
      if (disposed) return;
      disposed = true;
      bootstrapIdentity.dispose();
      currentIdentity.dispose();
      COMMANDS.forEach((name) => owners[name].dispose());
      listeners.clear();
      publish();
    },
  });
}

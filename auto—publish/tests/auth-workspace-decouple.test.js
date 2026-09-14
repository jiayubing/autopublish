const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { registerAuthIpc } = require("../desktop/ipc/auth-ipc");
const {
  createAuthenticatedRuntime,
} = require("../desktop/services/authenticated-runtime");
const {
  registerWorkspaceBootstrapIpc,
  rendererWorkspaceState,
} = require("../desktop/ipc/workspace-bootstrap-ipc");

function createIpc() {
  const handlers = new Map();
  return {
    handlers,
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
    },
  };
}

describe("auth and workspace startup decoupling", function () {
  it("keeps login authenticated when workspace start rejects", async function () {
    const { handlers, ipcMain } = createIpc();
    const events = [];
    const runtime = createAuthenticatedRuntime({
      start: async () => {
        const error = new Error("migration blocked");
        error.code = "WORKSPACE_MIGRATION_BLOCKED";
        throw error;
      },
      dispose: async () => {},
    });
    registerAuthIpc({
      ipcMain,
      sendToRenderer: (channel, payload) => events.push([channel, payload]),
      authService: {
        login: async () => ({
          authenticated: true,
          user: { loginName: "admin" },
          sessionStatus: "authenticated",
        }),
        getState: () => ({
          authenticated: true,
          user: { loginName: "admin" },
          sessionStatus: "authenticated",
        }),
      },
      onAuthenticated: () => runtime.start({ workspacePath: "fixture" }),
    });

    const result = await handlers.get("auth:login")(null, {
      loginName: "admin",
      password: "secret",
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.authenticated, true);
    assert.notEqual(result.error && result.error.code, "AUTH_SERVER_ERROR");
    assert.equal(events[0][0], "auth-state-changed");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(runtime.getState().phase, "failed");
  });

  it("joins concurrent workspace starts on the bootstrap query instead of auth", async function () {
    const { handlers, ipcMain } = createIpc();
    let starts = 0;
    let releaseStart;
    const startGate = new Promise((resolve) => {
      releaseStart = resolve;
    });
    const runtime = createAuthenticatedRuntime({
      start: async () => {
        starts += 1;
        await startGate;
      },
      dispose: async () => {},
    });
    registerWorkspaceBootstrapIpc({
      ipcMain,
      requireAuthenticated: async () => "token",
      dialog: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      },
      workspaceBootstrapService: {
        getBootstrapState: () => ({
          state: "ready",
          workspacePath: "C:\\workspace",
        }),
        chooseDirectory() {},
        confirmSelection() {},
        cancelSelection() {},
        getCurrent() {},
        openCurrent() {},
        requestSwitch() {},
      },
      getRuntimePhase: () => runtime.getState().phase,
      ensureRuntime: () => runtime.start({ workspacePath: "C:\\workspace" }),
    });

    const first = handlers.get("workspace:get-bootstrap-state")(
      {},
      { schemaVersion: 1, payload: {} },
    );
    const second = handlers.get("workspace:get-bootstrap-state")(
      {},
      { schemaVersion: 1, payload: {} },
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(starts, 1);
    assert.equal(runtime.getState().phase, "starting");
    releaseStart();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(firstResult.ok, true);
    assert.equal(firstResult.data.state, "ready");
    assert.equal(secondResult.data.state, "ready");
    assert.equal(runtime.getState().phase, "running");
  });

  it("projects workspace start failure onto bootstrap instead of auth", async function () {
    const runtime = createAuthenticatedRuntime({
      start: async () => {
        throw Object.assign(new Error("blocked"), {
          code: "WORKSPACE_MIGRATION_BLOCKED",
        });
      },
      dispose: async () => {},
    });
    await assert.rejects(() => runtime.start({ workspacePath: "fixture" }));
    assert.deepEqual(
      rendererWorkspaceState(
        { state: "ready", workspacePath: "C:\\workspace" },
        runtime.getState().phase,
      ),
      {
        state: "invalid",
        configured: true,
        environmentManaged: false,
        label: "工作区启动失败",
        selection: null,
        errorCode: "WORKSPACE_OPEN_FAILED",
        changed: null,
      },
    );
  });

  it("disposes the runtime on logout without changing the auth success contract", async function () {
    const { handlers, ipcMain } = createIpc();
    let disposed = 0;
    const runtime = createAuthenticatedRuntime({
      start: async () => {},
      dispose: async () => {
        disposed += 1;
      },
    });
    await runtime.start({ workspacePath: "fixture" });
    registerAuthIpc({
      ipcMain,
      sendToRenderer: () => {},
      authService: {
        logout: async () => ({
          authenticated: false,
          sessionStatus: "signed_out",
        }),
        getState: () => ({
          authenticated: false,
          sessionStatus: "signed_out",
        }),
      },
      onUnauthenticated: () => runtime.dispose(),
    });
    const result = await handlers.get("auth:logout")(null, {});
    assert.equal(result.ok, true);
    assert.equal(result.data.authenticated, false);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(disposed, 1);
    assert.equal(runtime.getState().phase, "stopped");
  });
});

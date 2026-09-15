const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  registerWorkspaceBootstrapIpc,
} = require("../desktop/ipc/workspace-bootstrap-ipc");

const emptyRequest = { schemaVersion: 1, payload: {} };
const tokenRequest = (token) => ({ schemaVersion: 1, payload: { token } });

function createHarness() {
  const handlers = new Map();
  let pendingToken = null;
  let state = {
    state: "selection_required",
    workspacePath: null,
    envOverride: false,
  };
  let ensureCalls = 0;

  const service = {
    getBootstrapState() {
      return state;
    },
    chooseDirectory(value) {
      pendingToken = "selection-token";
      state = {
        state: "confirmation_required",
        selection: {
          token: pendingToken,
          kind: "empty_directory",
          path: value,
        },
      };
      return state;
    },
    confirmSelection(input) {
      if (!pendingToken || input.token !== pendingToken) {
        const error = new Error("selection expired");
        error.code = "WORKSPACE_SELECTION_EXPIRED";
        throw error;
      }
      pendingToken = null;
      state = {
        state: "relaunching",
        workspacePath: "C:\\selected-workspace",
        envOverride: false,
        changed: true,
      };
      return state;
    },
    cancelSelection() {
      pendingToken = null;
      state = {
        state: "selection_required",
        workspacePath: null,
        envOverride: false,
      };
      const error = new Error("cancelled");
      error.code = "WORKSPACE_SELECTION_CANCELLED";
      throw error;
    },
    getCurrent() {
      return state;
    },
    openCurrent() {},
    requestSwitch() {
      return state;
    },
  };

  registerWorkspaceBootstrapIpc({
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    workspaceBootstrapService: service,
    showOpenDialog: async () => ({
      canceled: false,
      filePaths: ["C:\\selected-workspace"],
    }),
    ensureRuntime: async () => {
      ensureCalls += 1;
      // This models runtime activation bootstrapping the workspace service.
      // A pending one-use selection must never be exposed to this path.
      pendingToken = null;
    },
    getRuntimePhase: () => "idle",
  });

  return {
    handlers,
    getEnsureCalls: () => ensureCalls,
  };
}

describe("workspace selection confirmation regression", function () {
  it("keeps the one-use confirmation token alive until confirm-selection", async function () {
    const harness = createHarness();

    const selected = await harness.handlers.get("workspace:choose-directory")(
      {},
      emptyRequest,
    );
    assert.equal(selected.ok, true);
    assert.equal(selected.data.state, "confirmation_required");
    assert.equal(selected.data.selection.token, "selection-token");
    assert.equal(harness.getEnsureCalls(), 0);

    const confirmed = await harness.handlers.get("workspace:confirm-selection")(
      {},
      tokenRequest("selection-token"),
    );
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.data.state, "relaunching");
    assert.equal(confirmed.data.changed, true);
    assert.equal(harness.getEnsureCalls(), 0);
  });

  it("projects explicit cancellation back to selection_required", async function () {
    const harness = createHarness();

    const selected = await harness.handlers.get("workspace:choose-directory")(
      {},
      emptyRequest,
    );
    assert.equal(selected.ok, true);
    assert.equal(selected.data.state, "confirmation_required");

    const cancelled = await harness.handlers.get("workspace:cancel-selection")(
      {},
      emptyRequest,
    );
    assert.equal(cancelled.ok, true);
    assert.equal(cancelled.data.state, "selection_required");
    assert.equal(cancelled.data.selection, null);
    assert.equal(cancelled.data.errorCode, null);
    assert.equal(harness.getEnsureCalls(), 0);
  });
});

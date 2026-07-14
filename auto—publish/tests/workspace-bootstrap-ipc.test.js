const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { registerWorkspaceBootstrapIpc } = require("../desktop/ipc/workspace-bootstrap-ipc");

function fakeIpc() {
  const handlers = new Map();
  return {
    handlers,
    ipcMain: {
      handle: function(channel, handler) { handlers.set(channel, handler); }
    }
  };
}

function assertEnvelope(result) {
  assert.equal(typeof result, "object");
  assert.equal(typeof result.ok, "boolean");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "stack"), false);
  if (result.ok) assert.equal(Object.prototype.hasOwnProperty.call(result, "error"), false);
  else assert.equal(Object.prototype.hasOwnProperty.call(result, "data"), false);
}

describe("workspace bootstrap IPC", function() {
  it("registers exactly the seven workspace bootstrap channels", function() {
    const fake = fakeIpc();
    registerWorkspaceBootstrapIpc({
      ipcMain: fake.ipcMain,
      workspaceBootstrapService: {
        getBootstrapState: function() {}, getCurrent: function() {}, openCurrent: function() {},
        chooseDirectory: function() {}, requestSwitch: function() {}, confirmSelection: function() {}, cancelSelection: function() {}
      },
      showOpenDialog: async function() { return { canceled: true, filePaths: [] }; }
    });
    assert.deepEqual(Array.from(fake.handlers.keys()).sort(), [
      "workspace:cancel-selection", "workspace:choose-directory", "workspace:confirm-selection",
      "workspace:get-bootstrap-state", "workspace:get-current", "workspace:open-current", "workspace:request-switch"
    ].sort());
  });

  it("uses the native open-directory dialog and passes only the selected path to choose", async function() {
    const fake = fakeIpc();
    const calls = [];
    const serviceCalls = [];
    registerWorkspaceBootstrapIpc({
      ipcMain: fake.ipcMain,
      showOpenDialog: async function(options) { calls.push(options); return { canceled: false, filePaths: ["C:\\selected"] }; },
      workspaceBootstrapService: {
        chooseDirectory: function(value) { serviceCalls.push(value); return { state: "confirmation_required" }; },
        requestSwitch: function() {}, getBootstrapState: function() {}, getCurrent: function() {}, openCurrent: function() {},
        confirmSelection: function() {}, cancelSelection: function() {}
      }
    });
    const result = await fake.handlers.get("workspace:choose-directory")();
    assert.deepEqual(calls, [{ properties: ["openDirectory"] }]);
    assert.deepEqual(serviceCalls, ["C:\\selected"]);
    assert.deepEqual(result, { ok: true, data: { state: "confirmation_required" } });
  });

  it("maps dialog cancellation to a stable error without side effects", async function() {
    const fake = fakeIpc();
    let cancelled = 0;
    registerWorkspaceBootstrapIpc({
      ipcMain: fake.ipcMain,
      showOpenDialog: async function() { return { canceled: true, filePaths: [] }; },
      workspaceBootstrapService: {
        cancelSelection: function() { cancelled += 1; const error = new Error("cancel"); error.code = "WORKSPACE_SELECTION_CANCELLED"; throw error; },
        getBootstrapState: function() {}, getCurrent: function() {}, openCurrent: function() {}, chooseDirectory: function() {},
        requestSwitch: function() {}, confirmSelection: function() {}
      }
    });
    const result = await fake.handlers.get("workspace:choose-directory")();
    assertEnvelope(result);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "WORKSPACE_SELECTION_CANCELLED");
    assert.equal(cancelled, 1);
  });

  it("keeps request-switch path-free and uses the directory dialog", async function() {
    const fake = fakeIpc();
    const calls = [];
    registerWorkspaceBootstrapIpc({
      ipcMain: fake.ipcMain,
      showOpenDialog: async function(options) { calls.push(options); return { canceled: false, filePaths: ["D:\\switch"] }; },
      workspaceBootstrapService: {
        requestSwitch: function(value) { assert.equal(value, "D:\\switch"); return { state: "confirmation_required" }; },
        getBootstrapState: function() {}, getCurrent: function() {}, openCurrent: function() {}, chooseDirectory: function() {},
        confirmSelection: function() {}, cancelSelection: function() {}
      }
    });
    const result = await fake.handlers.get("workspace:request-switch")({}, undefined);
    assert.deepEqual(calls, [{ properties: ["openDirectory"] }]);
    assert.equal(result.ok, true);

    const forged = await fake.handlers.get("workspace:request-switch")({}, { path: "C:\\renderer-forged" });
    assertEnvelope(forged);
    assert.equal(forged.ok, false);
    assert.equal(forged.error.code, "WORKSPACE_IPC_INPUT_INVALID");
  });

  it("passes only a token to confirm-selection and rejects renderer paths", async function() {
    const fake = fakeIpc();
    const calls = [];
    registerWorkspaceBootstrapIpc({
      ipcMain: fake.ipcMain,
      showOpenDialog: async function() { return { canceled: true, filePaths: [] }; },
      workspaceBootstrapService: {
        confirmSelection: function(value) { calls.push(value); return { state: "relaunching" }; },
        getBootstrapState: function() {}, getCurrent: function() {}, openCurrent: function() {}, chooseDirectory: function() {},
        requestSwitch: function() {}, cancelSelection: function() {}
      }
    });
    const result = await fake.handlers.get("workspace:confirm-selection")({}, { token: "token-1" });
    assert.deepEqual(calls, [{ token: "token-1" }]);
    assert.deepEqual(result, { ok: true, data: { state: "relaunching" } });
    const forged = await fake.handlers.get("workspace:confirm-selection")({}, { token: "token-1", path: "C:\\forged" });
    assertEnvelope(forged);
    assert.equal(forged.ok, false);
  });

  it("wraps all handler results and sanitizes arbitrary error details", async function() {
    const fake = fakeIpc();
    const service = {
      getBootstrapState: function() { const error = new Error("API key sk-secret C:\\private\\business.txt"); error.code = "WORKSPACE_PATH_INVALID"; throw error; },
      getCurrent: function() { return { workspacePath: "C:\\safe" }; },
      openCurrent: function() { return { opened: true }; },
      chooseDirectory: function() { return {}; }, requestSwitch: function() { return {}; },
      confirmSelection: function() { return {}; }, cancelSelection: function() { return {}; }
    };
    registerWorkspaceBootstrapIpc({ ipcMain: fake.ipcMain, workspaceBootstrapService: service, showOpenDialog: async function() { return { canceled: true, filePaths: [] }; } });
    for (const channel of fake.handlers.keys()) {
      const result = channel === "workspace:get-bootstrap-state" || channel === "workspace:get-current" || channel === "workspace:open-current"
        ? await fake.handlers.get(channel)()
        : channel === "workspace:confirm-selection" ? await fake.handlers.get(channel)({}, { token: "token" })
          : await fake.handlers.get(channel)();
      assertEnvelope(result);
    }
    const error = await fake.handlers.get("workspace:get-bootstrap-state")();
    assert.equal(error.error.code, "WORKSPACE_PATH_INVALID");
    assert.equal(error.error.message.includes("sk-secret"), false);
    assert.equal(error.error.message.includes("business.txt"), false);
  });

  it("delegates open-current to the service and does not expose Electron", async function() {
    const fake = fakeIpc();
    let opened = 0;
    registerWorkspaceBootstrapIpc({
      ipcMain: fake.ipcMain,
      workspaceBootstrapService: {
        openCurrent: function() { opened += 1; return { opened: true }; },
        getBootstrapState: function() { return {}; }, getCurrent: function() { return {}; }, chooseDirectory: function() {},
        requestSwitch: function() {}, confirmSelection: function() {}, cancelSelection: function() {}
      },
      showOpenDialog: async function() { return { canceled: true, filePaths: [] }; }
    });
    const result = await fake.handlers.get("workspace:open-current")();
    assert.deepEqual(result, { ok: true, data: { opened: true } });
    assert.equal(opened, 1);
  });

  it("sanitizes open-current failures with the stable open error code", async function() {
    const fake = fakeIpc();
    registerWorkspaceBootstrapIpc({
      ipcMain: fake.ipcMain,
      workspaceBootstrapService: {
        openCurrent: function() {
          const error = new Error("API key secret C:\\private\\workspace");
          error.code = "WORKSPACE_OPEN_FAILED";
          throw error;
        },
        getBootstrapState: function() { return {}; }, getCurrent: function() { return {}; }, chooseDirectory: function() {},
        requestSwitch: function() {}, confirmSelection: function() {}, cancelSelection: function() {}
      },
      showOpenDialog: async function() { return { canceled: true, filePaths: [] }; }
    });
    const result = await fake.handlers.get("workspace:open-current")();
    assertEnvelope(result);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "WORKSPACE_OPEN_FAILED");
    assert.equal(result.error.message.includes("secret"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result.error, "stack"), false);
  });

  it("sanitizes unavailable switch state errors", async function() {
    const fake = fakeIpc();
    registerWorkspaceBootstrapIpc({
      ipcMain: fake.ipcMain,
      workspaceBootstrapService: {
        requestSwitch: function() {
          const error = new Error("private task state");
          error.code = "WORKSPACE_SWITCH_STATE_UNAVAILABLE";
          throw error;
        },
        getBootstrapState: function() { return {}; }, getCurrent: function() { return {}; }, chooseDirectory: function() {},
        openCurrent: function() {}, confirmSelection: function() {}, cancelSelection: function() {}
      },
      showOpenDialog: async function() { return { canceled: false, filePaths: ["C:\\candidate"] }; }
    });
    const result = await fake.handlers.get("workspace:request-switch")({}, undefined);
    assertEnvelope(result);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "WORKSPACE_SWITCH_STATE_UNAVAILABLE");
    assert.equal(result.error.message.includes("private"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result.error, "stack"), false);
  });
});

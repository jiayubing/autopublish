const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  registerWorkspaceBootstrapIpc,
} = require("../desktop/ipc/workspace-bootstrap-ipc");

const emptyRequest = { schemaVersion: 1, payload: {} };
const tokenRequest = (token) => ({ schemaVersion: 1, payload: { token } });

function harness(service, showOpenDialog) {
  const handlers = new Map();
  registerWorkspaceBootstrapIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    workspaceBootstrapService: {
      getBootstrapState() {},
      chooseDirectory() {},
      confirmSelection() {},
      cancelSelection() {},
      getCurrent() {},
      openCurrent() {},
      requestSwitch() {},
      ...service,
    },
    showOpenDialog:
      showOpenDialog || (async () => ({ canceled: true, filePaths: [] })),
  });
  return handlers;
}

function assertEnvelope(result) {
  assert.equal(result.schemaVersion, 1);
  assert.equal(typeof result.ok, "boolean");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "stack"), false);
  if (result.ok)
    assert.equal(Object.prototype.hasOwnProperty.call(result, "error"), false);
  else
    assert.equal(Object.prototype.hasOwnProperty.call(result, "data"), false);
}

describe("workspace bootstrap IPC", function () {
  it("gives the workspace registrar sole ownership of auth and typed wire validation", function () {
    const main = fs.readFileSync(
      path.join(__dirname, "..", "desktop", "main.js"),
      "utf8",
    );
    const composition = main.match(
      /registerWorkspaceBootstrapIpc\(\{([\s\S]*?)\n\s*\}\);/,
    );
    assert.ok(composition);
    assert.match(composition[1], /ipcMain:\s*ipcMain/);
    assert.match(composition[1], /requireAuthenticated:/);
    assert.doesNotMatch(composition[1], /createAuthenticatedIpcMain/);
  });

  it("serves existing and selected workspaces through the authenticated production composition", async function () {
    const handlers = new Map();
    const ipcMain = {
      handle: (channel, handler) => handlers.set(channel, handler),
    };
    let bootstrapReads = 0;
    const selected = [];
    registerWorkspaceBootstrapIpc({
      ipcMain,
      requireAuthenticated: async () => {},
      workspaceBootstrapService: {
        getBootstrapState() {
          bootstrapReads += 1;
          return { state: "ready", workspacePath: "C:\\private-workspace" };
        },
        chooseDirectory(value) {
          selected.push(value);
          return {
            state: "confirmation_required",
            selection: {
              token: "production-token",
              kind: "existing_workspace",
              path: value,
            },
          };
        },
        confirmSelection() {},
        cancelSelection() {},
        getCurrent() {},
        openCurrent() {},
        requestSwitch() {},
      },
      showOpenDialog: async () => ({
        canceled: false,
        filePaths: ["D:\\selected-workspace"],
      }),
    });

    const bootstrap = await handlers.get("workspace:get-bootstrap-state")(
      {},
      emptyRequest,
    );
    const selection = await handlers.get("workspace:choose-directory")(
      {},
      emptyRequest,
    );

    assert.equal(bootstrap.ok, true);
    assert.equal(bootstrap.data.state, "ready");
    assert.equal(selection.ok, true);
    assert.equal(selection.data.state, "confirmation_required");
    assert.equal(bootstrapReads, 1);
    assert.deepEqual(selected, ["D:\\selected-workspace"]);
  });

  it("rejects workspace bootstrap before authentication without calling the service", async function () {
    const handlers = new Map();
    let serviceCalls = 0;
    registerWorkspaceBootstrapIpc({
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      requireAuthenticated: async () => {
        throw Object.assign(new Error("private auth failure"), {
          code: "AUTH_REQUIRED",
        });
      },
      workspaceBootstrapService: {
        getBootstrapState() {
          serviceCalls += 1;
        },
        chooseDirectory() {},
        confirmSelection() {},
        cancelSelection() {},
        getCurrent() {},
        openCurrent() {},
        requestSwitch() {},
      },
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    });

    const result = await handlers.get("workspace:get-bootstrap-state")(
      {},
      emptyRequest,
    );
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "AUTH_REQUIRED");
    assert.equal(result.error.category, "authentication");
    assert.equal(serviceCalls, 0);
    assert.doesNotMatch(JSON.stringify(result), /private|stack/i);
  });

  it("registers exactly the seven workspace bootstrap channels", function () {
    const handlers = harness();
    assert.deepEqual(
      Array.from(handlers.keys()).sort(),
      [
        "workspace:cancel-selection",
        "workspace:choose-directory",
        "workspace:confirm-selection",
        "workspace:get-bootstrap-state",
        "workspace:get-current",
        "workspace:open-current",
        "workspace:request-switch",
      ].sort(),
    );
  });

  it("uses the native picker internally and returns no directory data", async function () {
    const dialogCalls = [];
    const serviceCalls = [];
    const handlers = harness(
      {
        chooseDirectory(value) {
          serviceCalls.push(value);
          return {
            state: "confirmation_required",
            selection: {
              token: "opaque-token",
              kind: "nonempty_directory",
              path: value,
            },
          };
        },
      },
      async (options) => {
        dialogCalls.push(options);
        return { canceled: false, filePaths: ["C:\\selected"] };
      },
    );
    const result = await handlers.get("workspace:choose-directory")(
      {},
      emptyRequest,
    );
    assert.deepEqual(dialogCalls, [{ properties: ["openDirectory"] }]);
    assert.deepEqual(serviceCalls, ["C:\\selected"]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.selection, {
      token: "opaque-token",
      kind: "nonempty_directory",
      label: "非空目录",
    });
    assert.doesNotMatch(
      JSON.stringify(result),
      /[A-Z]:\\|workspacePath|filePath|\"path\"/i,
    );
  });

  it("accepts only versioned exact requests and passes only an opaque token", async function () {
    const confirmed = [];
    const handlers = harness({
      confirmSelection(input) {
        confirmed.push(input);
        return {
          state: "relaunching",
          workspacePath: "C:\\private",
          changed: true,
        };
      },
    });
    const result = await handlers.get("workspace:confirm-selection")(
      {},
      tokenRequest("token-1"),
    );
    assert.equal(result.ok, true);
    assert.deepEqual(confirmed, [{ token: "token-1" }]);
    assert.doesNotMatch(
      JSON.stringify(result),
      /[A-Z]:\\|workspacePath|filePath|\"path\"/i,
    );

    for (const input of [
      undefined,
      { token: "token-1" },
      { schemaVersion: 1, payload: { token: "token-1", path: "C:\\forged" } },
    ]) {
      const rejected = await handlers.get("workspace:confirm-selection")(
        {},
        input,
      );
      assert.equal(rejected.ok, false);
      assert.equal(rejected.error.code, "IPC_REQUEST_INVALID");
    }
    assert.equal(confirmed.length, 1);
  });

  it("maps picker cancellation and operational failures to closed safe errors", async function () {
    let cancelled = 0;
    const handlers = harness({
      cancelSelection() {
        cancelled += 1;
        throw Object.assign(new Error("C:\\private secret"), {
          code: "WORKSPACE_SELECTION_CANCELLED",
        });
      },
      openCurrent() {
        throw Object.assign(new Error("API key at C:\\private"), {
          code: "WORKSPACE_OPEN_FAILED",
        });
      },
    });
    const cancelledResult = await handlers.get("workspace:choose-directory")(
      {},
      emptyRequest,
    );
    const openResult = await handlers.get("workspace:open-current")(
      {},
      emptyRequest,
    );
    assert.equal(cancelled, 1);
    assert.equal(cancelledResult.error.code, "WORKSPACE_SELECTION_CANCELLED");
    assert.equal(openResult.error.code, "WORKSPACE_OPEN_FAILED");
    for (const result of [cancelledResult, openResult]) {
      assertEnvelope(result);
      assert.doesNotMatch(
        JSON.stringify(result),
        /secret|private|stack|[A-Z]:\\/i,
      );
    }
  });

  it("delegates open and switch commands after exact decoding", async function () {
    let opened = 0;
    const switched = [];
    const handlers = harness(
      {
        openCurrent() {
          opened += 1;
        },
        requestSwitch(value) {
          switched.push(value);
          return {
            state: "confirmation_required",
            selection: {
              token: "switch-token",
              kind: "existing_workspace",
              path: value,
            },
          };
        },
      },
      async () => ({ canceled: false, filePaths: ["D:\\switch"] }),
    );
    assert.deepEqual(
      await handlers.get("workspace:open-current")({}, emptyRequest),
      {
        schemaVersion: 1,
        ok: true,
        data: { opened: true },
      },
    );
    const result = await handlers.get("workspace:request-switch")(
      {},
      emptyRequest,
    );
    assert.equal(result.ok, true);
    assert.equal(opened, 1);
    assert.deepEqual(switched, ["D:\\switch"]);
    assert.doesNotMatch(
      JSON.stringify(result),
      /[A-Z]:\\|workspacePath|filePath|\"path\"/i,
    );
  });
});

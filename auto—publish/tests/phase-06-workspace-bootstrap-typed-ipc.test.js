const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { createContractRegistry } = require("../desktop/ipc/contracts/registry");
const { workspaceContracts } = require("../desktop/ipc/contracts/workspace-contracts");
const { registerWorkspaceBootstrapIpc } = require("../desktop/ipc/workspace-bootstrap-ipc");

const CHANNELS = [
  "workspace:cancel-selection",
  "workspace:choose-directory",
  "workspace:confirm-selection",
  "workspace:get-bootstrap-state",
  "workspace:get-current",
  "workspace:open-current",
  "workspace:request-switch",
];

test("workspace bootstrap exposes seven versioned path-free contracts", function() {
  const registry = createContractRegistry(workspaceContracts);
  assert.deepEqual(workspaceContracts.map((contract) => contract.channel).sort(), CHANNELS);
  assert.equal(workspaceContracts.every((contract) => contract.schemaVersion === 1), true);
  assert.doesNotMatch(JSON.stringify(workspaceContracts), /workspacePath|filePath|sidecarPath|database|cookie|secret|\bpath\b/i);

  const empty = registry.byChannel("workspace:get-current");
  assert.deepEqual(registry.encodeRequest(empty, {}), { schemaVersion: 1, payload: {} });
  assert.throws(
    () => registry.encodeRequest(empty, { path: "C:\\private" }),
    (error) => error && error.code === "IPC_UNKNOWN_FIELD",
  );

  const confirm = registry.byChannel("workspace:confirm-selection");
  assert.deepEqual(registry.encodeRequest(confirm, { token: "opaque-token" }), {
    schemaVersion: 1,
    payload: { token: "opaque-token" },
  });
  assert.throws(
    () => registry.encodeRequest(confirm, { token: "opaque-token", path: "C:\\forged" }),
    (error) => error && error.code === "IPC_UNKNOWN_FIELD",
  );
});

test("workspace bootstrap registrar returns a versioned path-free state", async function() {
  const handlers = new Map();
  registerWorkspaceBootstrapIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    workspaceBootstrapService: {
      getBootstrapState: () => ({
        state: "confirmation_required",
        workspacePath: "C:\\private\\current",
        envOverride: false,
        selection: {
          token: "opaque-token",
          path: "D:\\private\\candidate",
          kind: "nonempty_directory",
        },
      }),
      chooseDirectory() {}, confirmSelection() {}, cancelSelection() {},
      getCurrent() {}, openCurrent() {}, requestSwitch() {},
    },
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  });

  const result = await handlers.get("workspace:get-bootstrap-state")({}, {
    schemaVersion: 1,
    payload: {},
  });
  assert.deepEqual(result, {
    schemaVersion: 1,
    ok: true,
    data: {
      state: "confirmation_required",
      configured: true,
      environmentManaged: false,
      label: "工作区已配置",
      selection: {
        token: "opaque-token",
        kind: "nonempty_directory",
        label: "非空目录",
      },
      errorCode: null,
      changed: null,
    },
  });
  assert.doesNotMatch(JSON.stringify(result), /[A-Z]:\\|workspacePath|filePath|\"path\"/i);

  const legacy = await handlers.get("workspace:get-bootstrap-state")({}, undefined);
  assert.equal(legacy.schemaVersion, 1);
  assert.equal(legacy.ok, false);
  assert.equal(legacy.error.code, "IPC_REQUEST_INVALID");
});

test("workspace commands accept only typed input and close operational failures", async function() {
  const handlers = new Map();
  const confirmed = [];
  registerWorkspaceBootstrapIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    workspaceBootstrapService: {
      getBootstrapState() {}, chooseDirectory() {}, cancelSelection() {}, getCurrent() {}, requestSwitch() {},
      confirmSelection(input) {
        confirmed.push(input);
        return { state: "relaunching", workspacePath: "C:\\private", changed: true };
      },
      openCurrent() {
        const error = new Error("secret at C:\\private\\workspace");
        error.code = "WORKSPACE_OPEN_FAILED";
        throw error;
      },
    },
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  });

  const confirmedResult = await handlers.get("workspace:confirm-selection")({}, {
    schemaVersion: 1,
    payload: { token: "opaque-token" },
  });
  assert.deepEqual(confirmed, [{ token: "opaque-token" }]);
  assert.equal(confirmedResult.ok, true);
  assert.equal(confirmedResult.data.changed, true);
  assert.doesNotMatch(JSON.stringify(confirmedResult), /[A-Z]:\\|workspacePath|filePath|\"path\"/i);

  const forged = await handlers.get("workspace:confirm-selection")({}, {
    schemaVersion: 1,
    payload: { token: "opaque-token", path: "C:\\forged" },
  });
  assert.equal(forged.ok, false);
  assert.equal(forged.error.code, "IPC_REQUEST_INVALID");
  assert.equal(confirmed.length, 1);

  const failed = await handlers.get("workspace:open-current")({}, {
    schemaVersion: 1,
    payload: {},
  });
  assert.deepEqual(failed, {
    schemaVersion: 1,
    ok: false,
    error: {
      code: "WORKSPACE_OPEN_FAILED",
      category: "internal",
      retryability: "manual-check",
      userMessage: "无法打开当前工作区。",
    },
  });
  assert.doesNotMatch(JSON.stringify(failed), /secret|private|stack|[A-Z]:\\/i);
});

test("renderer workspace state and views are path-free", async function() {
  const sourceRoot = path.resolve(__dirname, "..", "media-workbench", "src");
  const types = fs.readFileSync(path.join(sourceRoot, "types.ts"), "utf8");
  const workspaceTypes = types.slice(
    types.indexOf("export type WorkspaceBootstrapStatus"),
    types.indexOf("export interface MediaResource"),
  );
  const source = [
    "bridge/workspace.ts",
    "workspace-ui-logic.js",
    "components/WorkspaceSelectionPanel.tsx",
    "components/SettingsView.tsx",
  ].map((file) => fs.readFileSync(path.join(sourceRoot, file), "utf8")).concat(workspaceTypes).join("\n");
  assert.doesNotMatch(source, /workspacePath|selection\.path|\.filePath\b/);

  const logic = await import(pathToFileURL(path.join(sourceRoot, "workspace-ui-logic.js")).href + "?path-free=1");
  const confirmation = {
    state: "confirmation_required",
    configured: false,
    environmentManaged: false,
    label: "尚未配置工作区",
    selection: { token: "opaque-token", kind: "nonempty_directory", label: "非空目录" },
    errorCode: null,
    changed: null,
  };
  assert.deepEqual(logic.getSelectionView(confirmation), {
    kind: "confirmation_required",
    label: "非空目录",
    category: "非空目录",
    warning: "这是非空目录。确认后将在其中创建 AutoPublish 工作区目录和必要文件，不会删除或覆盖现有文件。",
    errorMessage: "工作区操作失败，请重试。",
    text: "请选择一个工作区后继续使用应用。",
    chooseDisabled: false,
    confirmDisabled: false,
    cancelDisabled: false,
  });
  assert.deepEqual(logic.getSettingsCommandState({
    loading: false,
    switchBusy: false,
    current: { configured: true, environmentManaged: false },
    switchState: null,
  }), { openDisabled: false, switchDisabled: false });
});

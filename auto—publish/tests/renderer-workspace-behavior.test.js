const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const LOGIC_URL = pathToFileURL(path.resolve(
  __dirname,
  "..",
  "media-workbench",
  "src",
  "workspace-ui-logic.js",
)).href;

async function loadLogic() {
  return import(LOGIC_URL);
}

const selectionRequired = { state: "selection_required", workspacePath: null, envOverride: false };
const invalidSavedSelection = {
  state: "selection_required",
  workspacePath: null,
  envOverride: false,
  error: { code: "WORKSPACE_LOCATION_INVALID", message: "unsafe internal detail" },
};
const invalid = {
  state: "invalid",
  workspacePath: null,
  envOverride: false,
  error: { code: "WORKSPACE_PATH_FORBIDDEN", message: "unsafe internal detail" },
};
const confirmation = {
  state: "confirmation_required",
  selection: {
    token: "one-use-token",
    path: "D:\\Chosen\\Workspace",
    kind: "nonempty_directory",
  },
};

describe("executable renderer workspace behavior", function() {
  it("starts in checking, mounts App only for ready, and never calls business APIs", async function() {
    const { createBootstrapGateController, getBootstrapView } = await loadLogic();
    const calls = [];
    const controller = createBootstrapGateController({
      getBootstrapState: async () => {
        calls.push("getBootstrapState");
        return { state: "ready", workspacePath: "D:\\Workspace", envOverride: false };
      },
      businessApis: {
        scanArticles: () => calls.push("scanArticles"),
        getResourcePage: () => calls.push("getResourcePage"),
        getPlatformQueue: () => calls.push("getPlatformQueue"),
      },
    });

    assert.equal(controller.getState().state, "checking");
    assert.equal(getBootstrapView(controller.getState()).kind, "checking");
    assert.equal(getBootstrapView(controller.getState()).mountsApp, false);

    await controller.start();

    assert.deepEqual(calls, ["getBootstrapState"]);
    assert.equal(controller.getState().state, "ready");
    assert.equal(getBootstrapView(controller.getState()).kind, "app");
    assert.equal(getBootstrapView(controller.getState()).mountsApp, true);
  });

  it("keeps invalid and pending states in the welcome UI with safe controls", async function() {
    const { getBootstrapView, getSelectionView } = await loadLogic();

    assert.equal(getBootstrapView(invalid).kind, "welcome");
    assert.match(getBootstrapView(invalid).text, /安全原因/);
    assert.match(getSelectionView(invalid).errorMessage, /安全原因/);
    assert.equal(getSelectionView(invalid).confirmDisabled, true);

    const pendingView = getSelectionView(confirmation);
    assert.equal(pendingView.kind, "confirmation_required");
    assert.equal(pendingView.path, "D:\\Chosen\\Workspace");
    assert.match(pendingView.category, /非空目录/);
    assert.match(pendingView.warning, /AutoPublish/);
    assert.equal(pendingView.confirmDisabled, false);

    const missingSelectionView = getSelectionView({ state: "confirmation_required" });
    assert.equal(missingSelectionView.kind, "selection_required");
    assert.equal(missingSelectionView.chooseDisabled, false);
    assert.equal(missingSelectionView.confirmDisabled, true);
    assert.equal(missingSelectionView.cancelDisabled, true);

    const relaunchingView = getSelectionView({ state: "relaunching" });
    assert.match(relaunchingView.text, /重启/);
    assert.equal(relaunchingView.chooseDisabled, true);
    assert.equal(relaunchingView.confirmDisabled, true);
    assert.equal(relaunchingView.cancelDisabled, true);
  });

  it("shows a saved workspace configuration error while remaining in selection_required", async function() {
    const { getBootstrapView, getSelectionView, getWorkspaceErrorMessage } = await loadLogic();
    const expected = "\u5df2\u4fdd\u5b58\u7684\u5de5\u4f5c\u533a\u914d\u7f6e\u65e0\u6548\uff0c\u8bf7\u91cd\u65b0\u9009\u62e9";
    assert.equal(getWorkspaceErrorMessage(invalidSavedSelection.error), expected);
    assert.equal(getBootstrapView(invalidSavedSelection).kind, "welcome");
    assert.equal(getBootstrapView(invalidSavedSelection).text, expected);
    assert.equal(getSelectionView(invalidSavedSelection).errorMessage, expected);
  });

  it("keeps the welcome state after picker cancellation", async function() {
    const { createWorkspaceSelectionController } = await loadLogic();
    const calls = [];
    const controller = createWorkspaceSelectionController({
      initialState: selectionRequired,
      chooseDirectory: async () => {
        calls.push("chooseDirectory");
        const error = new Error("cancelled");
        error.code = "WORKSPACE_SELECTION_CANCELLED";
        throw error;
      },
      confirmSelection: async () => {
        calls.push("confirmSelection");
        return { state: "relaunching" };
      },
      cancelSelection: async () => {
        calls.push("cancelSelection");
        throw Object.assign(new Error("cancelled"), { code: "WORKSPACE_SELECTION_CANCELLED" });
      },
    });

    await assert.rejects(controller.chooseDirectory(), (error) => error.code === "WORKSPACE_SELECTION_CANCELLED");
    assert.deepEqual(controller.getState(), selectionRequired);
    assert.deepEqual(calls, ["chooseDirectory"]);
  });

  it("confirms with exactly the service-owned token and enters relaunching", async function() {
    const { createWorkspaceSelectionController } = await loadLogic();
    const inputs = [];
    const controller = createWorkspaceSelectionController({
      initialState: confirmation,
      chooseDirectory: async () => confirmation,
      confirmSelection: async (input) => {
        inputs.push(input);
        return { state: "relaunching" };
      },
      cancelSelection: async () => {
        throw Object.assign(new Error("cancelled"), { code: "WORKSPACE_SELECTION_CANCELLED" });
      },
    });

    await controller.confirmSelection();
    assert.deepEqual(inputs, [{ token: "one-use-token" }]);
    assert.equal(Object.prototype.hasOwnProperty.call(inputs[0], "path"), false);
    assert.equal(controller.getState().state, "relaunching");
  });

  it("maps all renderer-facing errors to fixed safe Chinese messages", async function() {
    const { getWorkspaceErrorMessage } = await loadLogic();

    assert.equal(
      getWorkspaceErrorMessage({ code: "WORKSPACE_PATH_INVALID", message: "API key=secret; stack trace" }),
      "所选目录无效，请重新选择。",
    );
    assert.equal(
      getWorkspaceErrorMessage({ code: "UNKNOWN", message: "C:\\private\\file-list" }),
      "工作区操作失败，请重试。",
    );
  });

  it("disables Settings workspace commands while relaunching", async function() {
    const { getSettingsCommandState } = await loadLogic();
    const commandState = getSettingsCommandState({
      loading: false,
      switchBusy: false,
      current: { workspacePath: "D:\\Workspace", envOverride: false },
      switchState: { state: "relaunching" },
    });

    assert.equal(commandState.openDisabled, true);
    assert.equal(commandState.switchDisabled, true);
  });
});

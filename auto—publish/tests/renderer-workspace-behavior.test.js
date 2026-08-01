const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const LOGIC_URL = pathToFileURL(
  path.resolve(
    __dirname,
    "..",
    "media-workbench",
    "src",
    "workspace-ui-logic.js",
  ),
).href;
const loadLogic = () => import(LOGIC_URL);

const selectionRequired = {
  state: "selection_required",
  configured: false,
  environmentManaged: false,
  label: "尚未配置工作区",
  selection: null,
  errorCode: null,
  changed: null,
};
const confirmation = {
  ...selectionRequired,
  state: "confirmation_required",
  selection: {
    token: "one-use-token",
    kind: "nonempty_directory",
    label: "非空目录",
  },
};

describe("executable renderer workspace behavior", function () {
  it("mounts App only for a ready safe state", async function () {
    const { getBootstrapView } = await loadLogic();
    assert.equal(getBootstrapView({ state: "checking" }).mountsApp, false);
    assert.deepEqual(
      getBootstrapView({ ...selectionRequired, state: "ready" }),
      { kind: "app", mountsApp: true, text: "" },
    );
  });

  it("uses fixed labels and safe error codes without directory data", async function () {
    const { getBootstrapView, getSelectionView, getWorkspaceErrorMessage } =
      await loadLogic();
    const invalid = {
      ...selectionRequired,
      state: "invalid",
      errorCode: "WORKSPACE_PATH_FORBIDDEN",
    };
    assert.match(getBootstrapView(invalid).text, /安全原因/);
    assert.match(getSelectionView(invalid).errorMessage, /安全原因/);
    const view = getSelectionView(confirmation);
    assert.equal(view.label, "非空目录");
    assert.equal(Object.prototype.hasOwnProperty.call(view, "path"), false);
    assert.match(view.warning, /AutoPublish/);
    assert.equal(
      getWorkspaceErrorMessage("WORKSPACE_LOCATION_INVALID"),
      "已保存的工作区配置无效，请重新选择",
    );
    assert.equal(
      getWorkspaceErrorMessage("WORKSPACE_SCHEMA_FUTURE"),
      "工作区由更新版本创建，请升级应用后再使用。",
    );
    assert.equal(
      getWorkspaceErrorMessage("WORKSPACE_SCHEMA_OLDER_UNSUPPORTED"),
      "工作区版本过旧，需要显式升级后才能使用。",
    );
  });

  it("derives Settings command state from configured and environment ownership", async function () {
    const { getSettingsCommandState } = await loadLogic();
    assert.deepEqual(
      getSettingsCommandState({
        loading: false,
        switchBusy: false,
        current: { configured: true, environmentManaged: false },
        switchState: selectionRequired,
      }),
      { openDisabled: false, switchDisabled: false },
    );
    assert.deepEqual(
      getSettingsCommandState({
        loading: false,
        switchBusy: false,
        current: { configured: true, environmentManaged: true },
        switchState: { ...selectionRequired, state: "relaunching" },
      }),
      { openDisabled: true, switchDisabled: true },
    );
  });
});

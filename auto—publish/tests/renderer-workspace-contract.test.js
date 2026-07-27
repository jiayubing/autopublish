const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const SRC = path.resolve(__dirname, "..", "media-workbench", "src");
const readSource = (file) => fs.readFileSync(path.join(SRC, file), "utf8");

describe("renderer workspace bootstrap contract", function () {
  it("mounts App only through WorkspaceBootstrapGate", function () {
    const main = readSource("main.tsx");
    const gate = readSource("components/WorkspaceBootstrapGate.tsx");
    const context = readSource(
      "features/workspace/workspace-feature-context.tsx",
    );
    assert.match(main, /WorkspaceBootstrapGate/);
    assert.match(main, /WorkspaceFeatureProvider/);
    assert.doesNotMatch(main, /<App\s*\/>/);
    assert.match(context, /createWorkspaceFeature/);
    assert.match(gate, /useWorkspaceFeature/);
    assert.doesNotMatch(
      gate,
      /getWorkspaceBootstrapState|createBootstrapGateController/,
    );
    assert.match(gate, /getBootstrapView/);
    assert.match(gate, /<App\s*\/>/);
  });

  it("keeps the welcome flow isolated from business APIs and default paths", function () {
    const welcome =
      readSource("components/WorkspaceWelcome.tsx") +
      readSource("components/WorkspaceSelectionPanel.tsx") +
      readSource("workspace-ui-logic.js");
    [
      "useWorkspaceFeature",
      "chooseDirectory",
      "confirmSelection",
      "cancelSelection",
      "nonempty_directory",
      "selection.label",
      "getWorkspaceErrorMessage",
    ].forEach((value) =>
      assert.match(
        welcome,
        new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      ),
    );
    assert.doesNotMatch(
      welcome,
      /createWorkspaceSelectionController|onChooseDirectory|onConfirmSelection|onCancelSelection/,
    );
    assert.doesNotMatch(welcome, /workspacePath|selection\.path/);
    assert.doesNotMatch(welcome, /Documents/);
    [
      "scanArticles",
      "getResourcePage",
      "getPlatformQueue",
      "listContentClients",
      "getDoubaoQueueState",
    ].forEach((api) => assert.equal(welcome.includes(api), false));
  });

  it("declares a token-only confirmation wrapper and exactly seven workspace methods", function () {
    const types = readSource("types.ts");
    const api = readSource("bridge/workspace.ts");
    assert.match(
      types,
      /interface WorkspaceSelectionToken\s*\{\s*token: string;/s,
    );
    assert.match(
      api,
      /confirmWorkspaceSelection\s*\(\s*input: WorkspaceSelectionToken\s*,?\s*\)/,
    );
    assert.doesNotMatch(api, /confirmWorkspaceSelection\([^)]*path/);
    [
      "getWorkspaceBootstrapState",
      "chooseWorkspaceDirectory",
      "confirmWorkspaceSelection",
      "cancelWorkspaceSelection",
      "getCurrentWorkspace",
      "openCurrentWorkspace",
      "requestWorkspaceSwitch",
    ].forEach((name) => assert.match(api, new RegExp(name)));
  });

  it("keeps key renderer files UTF-8 readable without known mojibake markers", function () {
    [
      "main.tsx",
      "types.ts",
      "bridge/workspace.ts",
      "workspace-ui-logic.js",
      "components/WorkspaceBootstrapGate.tsx",
      "components/WorkspaceSelectionPanel.tsx",
      "components/WorkspaceWelcome.tsx",
      "components/SettingsView.tsx",
    ].forEach((file) => {
      const source = readSource(file);
      assert.equal(source.includes("\uFFFD"), false, file);
    });
  });

  it("lets Settings show and operate on the current workspace", function () {
    const settings = readSource("components/SettingsView.tsx");
    [
      "useWorkspaceFeature",
      "openCurrent",
      "requestSwitch",
      "environmentManaged",
      "label",
      "AUTO_PUBLISH_WORKSPACE",
    ].forEach((value) =>
      assert.match(
        settings,
        new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      ),
    );
    const panel = readSource("components/WorkspaceSelectionPanel.tsx");
    assert.match(panel, /useConfirmation/);
    assert.match(panel, /confirm\(\{/);
    assert.doesNotMatch(
      settings,
      /getCurrentWorkspace|openCurrentWorkspace|requestWorkspaceSwitch/,
    );
    assert.doesNotMatch(settings, /workspacePath|selection\.path/);
    assert.doesNotMatch(settings, /window\.confirm/);
  });

  it("renders selection from the workspace feature without callback orchestration", function () {
    const panel = readSource("components/WorkspaceSelectionPanel.tsx");
    assert.match(panel, /useWorkspaceFeature/);
    assert.doesNotMatch(
      panel,
      /onBusyChange|activeRef|onStateChange|createWorkspaceSelectionController/,
    );
  });

  it("derives Settings busy state from named workspace command owners", function () {
    const settings = readSource("components/SettingsView.tsx");
    [
      "snapshot.commands.openCurrent.busy",
      "snapshot.commands.requestSwitch.busy",
      "commandState.openDisabled",
      "commandState.switchDisabled",
    ].forEach((value) =>
      assert.match(
        settings,
        new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      ),
    );
    assert.doesNotMatch(
      settings,
      /currentWorkspaceRequestRef|mountedRef|setSwitchBusy|onBusyChange/,
    );
  });
});

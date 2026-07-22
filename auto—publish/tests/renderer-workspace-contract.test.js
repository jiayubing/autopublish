const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const SRC = path.resolve(__dirname, "..", "media-workbench", "src");
const readSource = (file) => fs.readFileSync(path.join(SRC, file), "utf8");

describe("renderer workspace bootstrap contract", function() {
  it("mounts App only through WorkspaceBootstrapGate", function() {
    const main = readSource("main.tsx");
    const gate = readSource("components/WorkspaceBootstrapGate.tsx");
    assert.match(main, /WorkspaceBootstrapGate/);
    assert.doesNotMatch(main, /<App\s*\/>/);
    assert.match(gate, /getWorkspaceBootstrapState/);
    assert.match(gate, /createBootstrapGateController/);
    assert.match(gate, /getBootstrapView/);
    assert.match(gate, /<App\s*\/>/);
  });

  it("keeps the welcome flow isolated from business APIs and default paths", function() {
    const welcome = readSource("components/WorkspaceWelcome.tsx") + readSource("components/WorkspaceSelectionPanel.tsx") + readSource("workspace-ui-logic.js");
    ["chooseWorkspaceDirectory", "confirmWorkspaceSelection", "cancelWorkspaceSelection", "WORKSPACE_SELECTION_CANCELLED", "nonempty_directory", "selection.path", "token", "createWorkspaceSelectionController", "getWorkspaceErrorMessage"].forEach((value) => assert.match(welcome, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
    assert.doesNotMatch(welcome, /Documents/);
    ["scanArticles", "getResourcePage", "getPlatformQueue", "listContentClients", "getDoubaoQueueState"].forEach((api) => assert.equal(welcome.includes(api), false));
  });

  it("declares a token-only confirmation wrapper and exactly seven workspace methods", function() {
    const types = readSource("types.ts");
    const api = readSource("bridge/workspace.ts");
    assert.match(types, /interface WorkspaceSelectionToken\s*\{\s*token: string;/s);
    assert.match(api, /confirmWorkspaceSelection\s*\(\s*input: WorkspaceSelectionToken\s*,?\s*\)/);
    assert.doesNotMatch(api, /confirmWorkspaceSelection\([^)]*path/);
    ["getWorkspaceBootstrapState", "chooseWorkspaceDirectory", "confirmWorkspaceSelection", "cancelWorkspaceSelection", "getCurrentWorkspace", "openCurrentWorkspace", "requestWorkspaceSwitch"].forEach((name) => assert.match(api, new RegExp(name)));
  });

  it("keeps key renderer files UTF-8 readable without known mojibake markers", function() {
    ["main.tsx", "types.ts", "bridge/workspace.ts", "workspace-ui-logic.js", "components/WorkspaceBootstrapGate.tsx", "components/WorkspaceSelectionPanel.tsx", "components/WorkspaceWelcome.tsx", "components/SettingsView.tsx"].forEach((file) => {
      const source = readSource(file);
      assert.equal(source.includes("\uFFFD"), false, file);
    });
  });

  it("lets Settings show and operate on the current workspace", function() {
    const settings = readSource("components/SettingsView.tsx");
    ["getCurrentWorkspace", "openCurrentWorkspace", "requestWorkspaceSwitch", "workspacePath", "validation", "envOverride", "AUTO_PUBLISH_WORKSPACE", "useConfirmation", "confirm({"].forEach((value) => assert.match(settings, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
    assert.doesNotMatch(settings, /window\.confirm/);
  });

  it("guards selection awaits after unmount and exposes parent busy cleanup", function() {
    const panel = readSource("components/WorkspaceSelectionPanel.tsx");
    ["onBusyChange?:", "activeRef", "activeRef.current = false", "onBusyChange?.(false)", "if (!activeRef.current)", "setBusy(nextBusy)", "updateBusy(true)", "setError(null)", "onStateChange(nextState)"].forEach((value) => assert.match(panel, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  });

  it("deduplicates Settings bootstrap reads and blocks top-level commands while switching", function() {
    const settings = readSource("components/SettingsView.tsx");
    ["getSettingsCommandState", "useRef", "currentWorkspaceRequestRef", "mountedRef", "switchBusy", "onBusyChange={setSwitchBusy}", "commandState.openDisabled", "commandState.switchDisabled"].forEach((value) => assert.match(settings, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  });
});

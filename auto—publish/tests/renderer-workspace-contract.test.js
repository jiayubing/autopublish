const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SRC = path.resolve(__dirname, "..", "media-workbench", "src");

function readSource(file) {
  return fs.readFileSync(path.join(SRC, file), "utf8");
}

describe("renderer workspace bootstrap contract", function() {
  it("mounts the existing App only through WorkspaceBootstrapGate", function() {
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

    assert.match(welcome, /chooseWorkspaceDirectory/);
    assert.match(welcome, /confirmWorkspaceSelection/);
    assert.match(welcome, /cancelWorkspaceSelection/);
    assert.match(welcome, /WORKSPACE_SELECTION_CANCELLED/);
    assert.match(welcome, /nonempty_directory/);
    assert.match(welcome, /selection\.path/);
    assert.match(welcome, /token/);
    assert.match(welcome, /createWorkspaceSelectionController/);
    assert.match(welcome, /getWorkspaceErrorMessage/);
    assert.doesNotMatch(welcome, /Documents/);
    assert.doesNotMatch(welcome, /最近/);
    ["scanArticles", "getResourcePage", "getPlatformQueue", "listContentClients", "getDoubaoQueueState"].forEach(function(api) {
      assert.equal(welcome.includes(api), false, `welcome must not call ${api}`);
    });
  });

  it("declares a token-only confirmation wrapper", function() {
    const types = readSource("types.ts");
    const api = readSource("electron-api.ts");

    assert.match(types, /interface WorkspaceSelectionToken\s*\{\s*token: string;\s*\}/s);
    assert.match(api, /confirmSelection\(input: WorkspaceSelectionToken\)/);
    assert.match(api, /workspace\.confirmSelection\(input\)/);
    assert.doesNotMatch(api, /confirmSelection\([^)]*path/);
  });

  it("keeps exactly the seven workspace preload methods and existing namespaces", function() {
    const api = readSource("electron-api.ts");
    const workspaceInterface = api.match(/interface DesktopConsoleWorkspace\s*\{([\s\S]*?)\n\}/);
    assert.ok(workspaceInterface, "workspace preload interface must exist");
    const methods = [...workspaceInterface[1].matchAll(/^\s+([a-zA-Z]+)\(/gm)].map((match) => match[1]);
    assert.deepEqual(methods, [
      "getBootstrapState",
      "chooseDirectory",
      "confirmSelection",
      "cancelSelection",
      "getCurrent",
      "openCurrent",
      "requestSwitch",
    ]);
    ["workspace", "media", "orders", "platforms", "content"].forEach((namespace) => {
      assert.match(api, new RegExp(`\\b${namespace}:`), `${namespace} namespace must remain exposed`);
    });
  });

  it("keeps key React renderer files UTF-8 readable without mojibake", function() {
    [
      "main.tsx",
      "types.ts",
      "electron-api.ts",
      "workspace-ui-logic.js",
      "components/WorkspaceBootstrapGate.tsx",
      "components/WorkspaceSelectionPanel.tsx",
      "components/WorkspaceWelcome.tsx",
      "components/SettingsView.tsx",
    ].forEach((file) => {
      const source = readSource(file);
      assert.equal(source.includes("\uFFFD"), false, `${file} contains replacement characters`);
      assert.equal(source.includes("鈹"), false, `${file} contains mojibake box-drawing text`);
      assert.equal(source.includes("闁"), false, `${file} contains mojibake Chinese text`);
    });
  });

  it("lets Settings show and operate on the current workspace", function() {
    const settings = readSource("components/SettingsView.tsx");

    assert.match(settings, /getCurrentWorkspace/);
    assert.match(settings, /openCurrentWorkspace/);
    assert.match(settings, /requestWorkspaceSwitch/);
    assert.match(settings, /workspacePath/);
    assert.match(settings, /validation/);
    assert.match(settings, /envOverride/);
    assert.match(settings, /disabled=\{[^}]*envOverride/);
    assert.match(settings, /当前工作区由环境变量控制/);
    assert.match(settings, /window\.confirm/);
  });

  it("guards selection awaits after unmount and exposes parent busy cleanup", function() {
    const panel = readSource("components/WorkspaceSelectionPanel.tsx");

    assert.match(panel, /onBusyChange\?:/);
    assert.match(panel, /activeRef/);
    assert.match(panel, /activeRef\.current\s*=\s*false/);
    assert.match(panel, /onBusyChange\?\.\(false\)/);
    assert.match(panel, /if\s*\(!activeRef\.current\)/);
    assert.match(panel, /setBusy\(nextBusy\)/);
    assert.match(panel, /updateBusy\(true\)/);
    assert.match(panel, /setError\(null\)/);
    assert.match(panel, /onStateChange\(nextState\)/);
  });

  it("deduplicates Settings bootstrap reads and blocks top-level commands while switching", function() {
    const settings = readSource("components/SettingsView.tsx");

    assert.match(settings, /useRef/);
    assert.match(settings, /currentWorkspaceRequestRef/);
    assert.match(settings, /currentWorkspaceRequestRef\.current\s*\|\|/);
    assert.match(settings, /mountedRef/);
    assert.match(settings, /mountedRef\.current/);
    assert.match(settings, /switchBusy/);
    assert.match(settings, /onBusyChange=\{setSwitchBusy\}/);
    assert.match(settings, /disabled=\{[^}]*switchBusy/);
  });
});

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
    assert.match(gate, /state\s*===\s*["']ready["']/);
    assert.match(gate, /<App\s*\/>/);
  });

  it("keeps the welcome flow isolated from business APIs and default paths", function() {
    const welcome = readSource("components/WorkspaceWelcome.tsx") + readSource("components/WorkspaceSelectionPanel.tsx");

    assert.match(welcome, /chooseWorkspaceDirectory/);
    assert.match(welcome, /confirmWorkspaceSelection/);
    assert.match(welcome, /cancelWorkspaceSelection/);
    assert.match(welcome, /WORKSPACE_SELECTION_CANCELLED/);
    assert.match(welcome, /nonempty_directory/);
    assert.match(welcome, /selection\.path/);
    assert.match(welcome, /token/);
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
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

describe("renderer confirmation host", () => {
  it("implements a renderer-owned, focus-safe confirmation lifecycle", () => {
    const source = read("media-workbench/src/components/ConfirmationHost.tsx");
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /event\.key === 'Escape'/);
    assert.match(source, /event\.key !== 'Tab'/);
    assert.match(source, /requestAnimationFrame/);
    assert.match(source, /current\.resolve\(approved\)/);
    assert.match(source, /current\.resolve\(false\)/);
    assert.match(source, /pendingRef\.current/);
    assert.doesNotMatch(source, /window\.confirm|window\.focus|window\.restore/);
  });

  it("keeps the public confirmation API small and portal based", () => {
    const source = read("media-workbench/src/confirmation.tsx");
    assert.match(source, /confirm:\s*\(options: ConfirmationOptions\)\s*=> Promise<boolean>/);
    assert.match(source, /createPortal/);
    assert.match(source, /useConfirmation/);
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  });

  it("installs one host only after authentication and removes settings native confirms", () => {
    const gate = read("media-workbench/src/components/WorkspaceBootstrapGate.tsx");
    assert.match(gate, /<ConfirmationHost><App \/><\/ConfirmationHost>/);
    for (const file of [
      "media-workbench/src/components/settings/HepanProviderSettings.tsx",
      "media-workbench/src/components/settings/MediaProviderSettings.tsx",
      "media-workbench/src/components/AiProviderSettings.tsx",
      "media-workbench/src/components/settings/SettingsOverview.tsx",
      "media-workbench/src/components/SettingsView.tsx",
    ]) {
      assert.doesNotMatch(read(file), /window\.confirm|^\s*confirm\s*\(\s*['"`]/m);
    }
  });

  it("keeps media preflight owned by the workbench view", () => {
    const app = read("media-workbench/src/App.tsx");
    assert.match(app, /currentView === 'workbench'/);
    assert.match(app, /<PreflightModal isOpen=\{Boolean\(confirmation\)\}/);
    assert.doesNotMatch(app, /currentView === 'workbench' && Boolean\(confirmation\)/);
    assert.doesNotMatch(app, /function changeView|setConfirmation\(null\);\s*\}\s*\}, \[currentView\]\)/);
  });
});

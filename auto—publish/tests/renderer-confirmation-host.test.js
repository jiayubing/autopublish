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
    assert.match(source, /request\.resolve\(approved\)/);
    assert.match(source, /queueRef\.current/);
    assert.match(source, /cancelRequester/);
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

  it("installs one host only after authentication and removes business native confirms", () => {
    const main = read("media-workbench/src/main.tsx");
    const app = read("media-workbench/src/App.tsx");
    const content = read("media-workbench/src/components/ContentWorkbench.tsx");
    const gate = read("media-workbench/src/components/WorkspaceBootstrapGate.tsx");
    assert.equal((app.match(/<ConfirmationHost/g) || []).length, 1);
    assert.match(
      main,
      /<AuthGate>\s*<WorkspaceCoordinatorProvider>\s*<WorkspaceScopedConfirmationHost>\s*<WorkspaceFeatureProvider>/s,
    );
    assert.match(app, /useWorkspaceRuntimeIdentity/);
    assert.match(app, /scopeKey=\{workspaceRuntimeId \|\| "workspace-bootstrap"\}/);
    assert.match(content, /useConfirmationScope/);
    assert.doesNotMatch(gate, /ConfirmationHost/);
    for (const file of [
      "media-workbench/src/components/settings/HepanProviderSettings.tsx",
      "media-workbench/src/components/settings/MediaProviderSettings.tsx",
      "media-workbench/src/components/AiProviderSettings.tsx",
      "media-workbench/src/components/settings/SettingsOverview.tsx",
      "media-workbench/src/components/SettingsView.tsx",
      "media-workbench/src/components/content/QuestionCollectionView.tsx",
    ]) {
      assert.doesNotMatch(read(file), /\b(?:window\.)?confirm\s*\(\s*['"`]/);
    }
  });

  it("renders media preflight from the media feature snapshot", () => {
    const app = read("media-workbench/src/App.tsx");
    const feature = read("media-workbench/src/features/media/media-feature.js");
    assert.match(app, /currentView === 'workbench'/);
    assert.match(app, /<PreflightModal isOpen=\{Boolean\(mediaSnapshot\.preflight\.data\)\}/);
    assert.match(app, /mediaFeature\.submitPrepared/);
    assert.match(feature, /prepareSubmission/);
    assert.match(feature, /submitPrepared/);
    assert.doesNotMatch(app, /setConfirmation|setIsSubmitting|setSubmissionError/);
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

describe("renderer confirmation host", () => {
  it("installs one host only after authentication and removes business native confirms", () => {
    const main = read("media-workbench/src/main.tsx");
    const app = read("media-workbench/src/App.tsx");
    const content = read("media-workbench/src/components/ContentWorkbench.tsx");
    const gate = read(
      "media-workbench/src/components/WorkspaceBootstrapGate.tsx",
    );
    assert.equal((app.match(/<ConfirmationHost/g) || []).length, 1);
    assert.match(
      main,
      /<AuthGate>\s*<WorkspaceCoordinatorProvider>\s*<WorkspaceScopedConfirmationHost>\s*<WorkspaceFeatureProvider>/s,
    );
    assert.match(app, /useWorkspaceRuntimeIdentity/);
    assert.match(
      app,
      /scopeKey=\{workspaceRuntimeId \|\| "workspace-bootstrap"\}/,
    );
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

  it("removes the legacy media submit modal and renders paid execution controls", () => {
    const app = read("media-workbench/src/App.tsx");
    const feature = read("media-workbench/src/features/media/media-feature.js");
    const generatedArticles = read(
      "media-workbench/src/components/content/GeneratedArticlesView.tsx",
    );
    assert.doesNotMatch(app, /PreflightModal|mediaFeature\.submitPrepared/);
    assert.doesNotMatch(feature, /prepareSubmission|submitPrepared/);
    assert.match(generatedArticles, /付费媒体批次控制/);
    assert.match(generatedArticles, /startPaidMediaBatch/);
    assert.match(generatedArticles, /pausePaidMediaBatch/);
    assert.doesNotMatch(
      app,
      /setConfirmation|setIsSubmitting|setSubmissionError/,
    );
  });
});

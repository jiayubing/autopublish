const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, "media-workbench/src", file), "utf8");

describe("renderer platform cross-page progress contract", function() {
  it("mounts one platform provider and shares platform plus submission-center projections", function() {
    assert.match(read("App.tsx"), /PlatformFeatureProvider/);
    assert.match(read("components/PlatformWorkbench.tsx"), /usePlatformFeature/);
    assert.match(read("App.tsx"), /useSubmissionCenterFeature/);
    assert.match(read("App.tsx"), /submissionCenter=\{submissionCenter\}/);
    assert.doesNotMatch(read("App.tsx"), /PlatformTaskProvider|WorkspaceDataProvider/);
    assert.doesNotMatch(read("components/PlatformWorkbench.tsx"), /usePlatformTask|usePlatformQueue/);
    assert.doesNotMatch(read("components/Sidebar.tsx"), /usePlatformTask|usePlatformQueue/);
  });
});

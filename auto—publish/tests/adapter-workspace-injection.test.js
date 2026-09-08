const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createWorkspacePaths } = require("../src/infrastructure/workspace/workspace-paths");
const { createPlatformRuntimeContext } = require("../src/platforms/platform-runtime-context");
const { loadPlatforms } = require("../src/core/platforms");

it("platform loader constructs current adapters from explicit workspace and browser runtime dependencies", function() {
  const one = fs.mkdtempSync(path.join(os.tmpdir(), "platform-runtime-one-"));
  const two = fs.mkdtempSync(path.join(os.tmpdir(), "platform-runtime-two-"));
  try {
    const onePaths = createWorkspacePaths(one);
    const twoPaths = createWorkspacePaths(two);
    fs.mkdirSync(twoPaths.mediaInput, { recursive: true });
    fs.writeFileSync(path.join(twoPaths.mediaInput, "two.txt"), "two");

    const oneContext = createPlatformRuntimeContext({
      workspacePaths: onePaths,
      browserRuntime: { browserChannel: "chromium", profileDir: path.join(one, "profiles") },
    });
    const twoContext = createPlatformRuntimeContext({
      workspacePaths: twoPaths,
      browserRuntime: { browserChannel: "msedge", profileDir: path.join(two, "profiles") },
    });
    const oneAdapters = loadPlatforms({ platformIds: ["lieju", "hepan", "media"], runtimeContext: oneContext });
    const twoAdapters = loadPlatforms({ platformIds: ["lieju", "hepan", "media"], runtimeContext: twoContext });

    for (const platforms of [oneAdapters, twoAdapters]) {
      assert.equal(platforms.find((platform) => platform.definition.id === "hepan").legacyQueue, undefined);
      assert.equal(platforms.find((platform) => platform.definition.id === "media").legacyQueue, undefined);
      assert.equal(typeof platforms.find((platform) => platform.definition.id === "lieju").regularSubmission.preparePlatformSubmission, "function");
      assert.equal(typeof platforms.find((platform) => platform.definition.id === "lieju").accountInspection.inspect, "function");
    }
    assert.notEqual(
      oneAdapters.find((platform) => platform.definition.id === "lieju").loginSession,
      twoAdapters.find((platform) => platform.definition.id === "lieju").loginSession,
    );
    assert.equal(oneContext.browserRuntime.browserChannel, "chromium");
    assert.equal(oneContext.browserRuntime.profileDir, path.join(one, "profiles"));
    assert.equal(twoContext.browserRuntime.browserChannel, "msedge");
  } finally {
    fs.rmSync(one, { recursive: true, force: true });
    fs.rmSync(two, { recursive: true, force: true });
  }
});

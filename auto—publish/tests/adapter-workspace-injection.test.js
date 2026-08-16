const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createWorkspacePaths } = require("../src/infrastructure/workspace/workspace-paths");
const { createPlatformRuntimeContext } = require("../src/platforms/platform-runtime-context");
const { loadPlatforms } = require("../src/core/platforms");

it("media adapters scan only their injected workspace input without module reload", function() {
  const { createMediaAdapter } = require("../src/platforms/media/adapter");
  const one = fs.mkdtempSync(path.join(os.tmpdir(), "media-adapter-one-"));
  const two = fs.mkdtempSync(path.join(os.tmpdir(), "media-adapter-two-"));
  try {
    const oneInput = path.join(one, "input", "media");
    const twoInput = path.join(two, "input", "media");
    fs.mkdirSync(oneInput, { recursive: true }); fs.mkdirSync(twoInput, { recursive: true });
    fs.writeFileSync(path.join(oneInput, "one.txt"), "one"); fs.writeFileSync(path.join(twoInput, "two.txt"), "two");
    assert.deepStrictEqual(createMediaAdapter({ paths: { mediaInput: oneInput } }).scanArticles(), []);
    assert.deepStrictEqual(createMediaAdapter({ mainProcess: true, apiKey: "test", paths: { mediaInput: oneInput } }).scanArticles().map((x) => x.filename), ["one.txt"]);
    assert.deepStrictEqual(createMediaAdapter({ mainProcess: true, apiKey: "test", paths: { mediaInput: twoInput } }).scanArticles().map((x) => x.filename), ["two.txt"]);
  } finally { fs.rmSync(one, { recursive: true, force: true }); fs.rmSync(two, { recursive: true, force: true }); }
});

it("Hepan workspace config overrides inherited global configuration", function() {
  const { resolveHepanRuntime } = require("../src/platforms/hepan/adapter");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hepan-workspace-"));
  try {
    fs.mkdirSync(path.join(root, "config"));
    fs.writeFileSync(path.join(root, "config", "hepan.json"), JSON.stringify({ cookiePath: "workspace-cookie", pythonPath: "workspace-python" }));
    assert.deepStrictEqual(resolveHepanRuntime(root, { HEPAN_COOKIE_PATH: "global-cookie", HEPAN_PYTHON: "global-python" }), { cookiePath: "workspace-cookie", pythonPath: "workspace-python" });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it("platform loader constructs adapters from explicit workspace and browser runtime dependencies", function() {
  const one = fs.mkdtempSync(path.join(os.tmpdir(), "platform-runtime-one-"));
  const two = fs.mkdtempSync(path.join(os.tmpdir(), "platform-runtime-two-"));
  try {
    const onePaths = createWorkspacePaths(one);
    const twoPaths = createWorkspacePaths(two);
    fs.mkdirSync(onePaths.hepanInput, { recursive: true });
    fs.mkdirSync(onePaths.toutiaoInput, { recursive: true });
    fs.mkdirSync(twoPaths.toutiaoInput, { recursive: true });
    fs.mkdirSync(twoPaths.mediaInput, { recursive: true });
    fs.writeFileSync(path.join(onePaths.hepanInput, "one.txt"), "one");
    fs.writeFileSync(path.join(onePaths.toutiaoInput, "one.md"), "# one");
    fs.writeFileSync(path.join(twoPaths.toutiaoInput, "two.md"), "# two");
    fs.writeFileSync(path.join(twoPaths.mediaInput, "two.txt"), "two");

    const oneContext = createPlatformRuntimeContext({
      workspacePaths: onePaths,
      browserRuntime: { browserChannel: "chromium", profileDir: path.join(one, "profiles") },
    });
    const twoContext = createPlatformRuntimeContext({
      workspacePaths: twoPaths,
      browserRuntime: { browserChannel: "msedge", profileDir: path.join(two, "profiles") },
    });
    const oneAdapters = loadPlatforms({ platformIds: ["hepan", "toutiao", "media"], runtimeContext: oneContext });
    const twoAdapters = loadPlatforms({ platformIds: ["hepan", "toutiao", "media"], runtimeContext: twoContext });

    assert.deepStrictEqual(oneAdapters.find((platform) => platform.definition.id === "hepan").legacyQueue.scan().map((item) => item.filename), ["one.txt"]);
    assert.equal(oneAdapters.find((platform) => platform.definition.id === "media").legacyQueue, undefined);
    assert.deepStrictEqual(twoAdapters.find((platform) => platform.definition.id === "hepan").legacyQueue.scan(), []);
    assert.notEqual(oneAdapters.find((platform) => platform.definition.id === "hepan").legacyQueue, twoAdapters.find((platform) => platform.definition.id === "hepan").legacyQueue);
    assert.deepStrictEqual(oneAdapters.find((platform) => platform.definition.id === "toutiao").legacyQueue.scan().map((item) => item.filename), ["one.md"]);
    assert.deepStrictEqual(twoAdapters.find((platform) => platform.definition.id === "toutiao").legacyQueue.scan().map((item) => item.filename), ["two.md"]);
    assert.notEqual(oneAdapters.find((platform) => platform.definition.id === "toutiao").loginSession, twoAdapters.find((platform) => platform.definition.id === "toutiao").loginSession);
    assert.equal(oneContext.browserRuntime.browserChannel, "chromium");
    assert.equal(oneContext.browserRuntime.profileDir, path.join(one, "profiles"));
    assert.equal(twoContext.browserRuntime.browserChannel, "msedge");
  } finally {
    fs.rmSync(one, { recursive: true, force: true });
    fs.rmSync(two, { recursive: true, force: true });
  }
});

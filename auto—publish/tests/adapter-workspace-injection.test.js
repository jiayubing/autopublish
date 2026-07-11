const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

it("media adapters scan only their injected workspace input without module reload", function() {
  const { createMediaAdapter } = require("../src/platforms/media/adapter");
  const one = fs.mkdtempSync(path.join(os.tmpdir(), "media-adapter-one-"));
  const two = fs.mkdtempSync(path.join(os.tmpdir(), "media-adapter-two-"));
  try {
    const oneInput = path.join(one, "input", "media");
    const twoInput = path.join(two, "input", "media");
    fs.mkdirSync(oneInput, { recursive: true }); fs.mkdirSync(twoInput, { recursive: true });
    fs.writeFileSync(path.join(oneInput, "one.txt"), "one"); fs.writeFileSync(path.join(twoInput, "two.txt"), "two");
    assert.deepStrictEqual(createMediaAdapter({ apiKey: "test", paths: { mediaInput: oneInput } }).scanArticles().map((x) => x.filename), ["one.txt"]);
    assert.deepStrictEqual(createMediaAdapter({ apiKey: "test", paths: { mediaInput: twoInput } }).scanArticles().map((x) => x.filename), ["two.txt"]);
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

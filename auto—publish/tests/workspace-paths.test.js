const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createWorkspacePaths, ensureWorkspaceDirectories } = require("../desktop/workspace-paths");
const { configureRuntimeEnvironment } = require("../desktop/runtime-config");

describe("workspace paths", function() {
  it("creates every runtime directory below the supplied workspace root", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-workspace-"));
    try {
      const paths = createWorkspacePaths(root);
      ensureWorkspaceDirectories(paths);

      [
        "input", "mediaInput", "liejuInput", "toutiaoInput", "hepanInput",
        "data", "logs", "published", "failed", "tmp", "work",
        "clients", "research", "templates", "generated"
      ].forEach(function(key) {
        assert.ok(paths[key].startsWith(paths.root + path.sep), key + " escapes workspace");
        assert.ok(fs.statSync(paths[key]).isDirectory(), key + " was not created");
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("runtime configuration", function() {
  it("loads the workspace environment once and exposes workspace paths", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-runtime-"));
    const original = process.env.XQW_API_KEY;
    try {
      fs.writeFileSync(path.join(root, ".env"), "XQW_API_KEY=workspace-secret\n", "utf8");
      delete process.env.XQW_API_KEY;
      const runtime = configureRuntimeEnvironment({ appRoot: path.join(root, "app"), workspaceRoot: root });
      assert.equal(runtime.workspaceRoot, path.resolve(root));
      assert.equal(runtime.paths.data, path.join(root, "data"));
      assert.equal(process.env.XQW_API_KEY, "workspace-secret");
      assert.equal(process.env.AUTO_PUBLISH_ROOT_DIR, path.resolve(root));
    } finally {
      if (original === undefined) delete process.env.XQW_API_KEY;
      else process.env.XQW_API_KEY = original;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports stable secrets-free validation errors for missing startup configuration", function() {
    const { validateRuntimeConfiguration } = require("../desktop/runtime-config");
    const errors = validateRuntimeConfiguration({});
    assert.ok(errors.some(function(error) { return error.code === "AI_CONFIG_INVALID"; }));
    assert.ok(errors.some(function(error) { return error.code === "MEDIA_CONFIG_INVALID"; }));
    errors.forEach(function(error) {
      assert.equal(error.message.includes("secret"), false);
      assert.equal(error.message.includes("API_KEY"), false);
    });
  });
});

it("keeps media API key resolution free of dotenv loading side effects", function() {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "platforms", "media", "config.js"), "utf8");
  assert.equal(source.includes("dotenv.config"), false);
});

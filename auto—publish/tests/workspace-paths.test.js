const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createWorkspacePaths, ensureWorkspaceDirectories } = require("../desktop/workspace-paths");
const { configureRuntimeEnvironment } = require("../desktop/runtime-config");

const RUNTIME_ENV_KEYS = [
  "AUTO_PUBLISH_ROOT_DIR",
  "AUTO_PUBLISH_APP_ROOT",
  "AUTO_PUBLISH_WORKSPACE",
  "AI_API_KEY",
  "AI_BASE_URL",
  "AI_MODEL",
  "AI_TIMEOUT_MS",
  "XQW_API_KEY",
  "MARKITDOWN_CMD",
  "PLAYWRIGHT_CLI_JS",
  "HEPAN_PYTHON"
];

function saveRuntimeEnvironment() {
  return RUNTIME_ENV_KEYS.reduce(function(values, key) {
    values[key] = process.env[key];
    return values;
  }, {});
}

function restoreRuntimeEnvironment(values) {
  RUNTIME_ENV_KEYS.forEach(function(key) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  });
}

describe("workspace paths", function() {
  it("creates every runtime directory below the supplied workspace root", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-workspace-"));
    try {
      const paths = createWorkspacePaths(root);
      ensureWorkspaceDirectories(paths);

      [
        "input", "mediaInput", "liejuInput", "toutiaoInput", "hepanInput",
        "config",
        "data", "logs", "published", "failed", "tmp", "work",
        "clientMaterialCache",
        "clients", "research", "templates", "generated",
        "browser", "doubaoBrowser", "doubaoDiagnostics"
      ].forEach(function(key) {
        const relative = path.relative(paths.root, paths[key]);
        const firstSegment = relative.split(path.sep)[0];
        assert.ok(relative && relative !== ".." && !path.isAbsolute(relative) && firstSegment !== "..", key + " escapes workspace");
        assert.ok(fs.statSync(paths[key]).isDirectory(), key + " was not created");
      });
      assert.equal(paths.clientMaterialCache, path.join(paths.work, "client-material-cache"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("runtime configuration", function() {
  it("requires explicit appRoot and workspaceRoot at every runtime configuration entry point", function() {
    const runtimePaths = require("../desktop/runtime-paths");
    const original = saveRuntimeEnvironment();
    try {
      delete process.env.AUTO_PUBLISH_APP_ROOT;
      delete process.env.AUTO_PUBLISH_WORKSPACE;
      assert.throws(function() {
        configureRuntimeEnvironment({ appRoot: process.cwd() });
      }, /workspaceRoot is required/);
      assert.throws(function() {
        configureRuntimeEnvironment({ workspaceRoot: process.cwd() });
      }, /appRoot is required/);
      assert.throws(function() {
        runtimePaths.configureRuntimeEnvironment({ appRoot: process.cwd() });
      }, /workspaceRoot is required/);
      assert.throws(function() {
        runtimePaths.configureRuntimeEnvironment({ workspaceRoot: process.cwd() });
      }, /appRoot is required/);
    } finally {
      restoreRuntimeEnvironment(original);
    }
  });

  it("loads the workspace environment once and exposes workspace paths", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-runtime-"));
    const original = saveRuntimeEnvironment();
    try {
      fs.writeFileSync(path.join(root, ".env"), "XQW_API_KEY=workspace-secret\nAI_API_KEY=workspace-ai-secret\nAI_BASE_URL=https://workspace.example/v1\nAI_MODEL=workspace-model\nAI_TIMEOUT_MS=10\n", "utf8");
      delete process.env.XQW_API_KEY;
      const runtime = configureRuntimeEnvironment({ appRoot: path.join(root, "app"), workspaceRoot: root });
      assert.equal(runtime.workspaceRoot, path.resolve(root));
      assert.equal(runtime.paths.data, path.join(root, "data"));
      assert.equal(process.env.XQW_API_KEY, "workspace-secret");
      assert.equal(process.env.AI_API_KEY, undefined);
      assert.equal(process.env.AI_BASE_URL, undefined);
      assert.equal(process.env.AI_MODEL, undefined);
      assert.equal(process.env.AI_TIMEOUT_MS, undefined);
      assert.equal(process.env.AUTO_PUBLISH_ROOT_DIR, path.resolve(root));
    } finally {
      restoreRuntimeEnvironment(original);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports stable secrets-free validation errors for missing startup configuration", function() {
    const { validateRuntimeConfiguration } = require("../desktop/runtime-config");
    const errors = validateRuntimeConfiguration({});
    assert.equal(errors.some(function(error) { return error.code === "AI_CONFIG_INVALID"; }), false);
    assert.ok(errors.some(function(error) { return error.code === "MEDIA_CONFIG_INVALID"; }));
    errors.forEach(function(error) {
      assert.equal(error.message.includes("secret"), false);
      assert.equal(error.message.includes("API_KEY"), false);
    });
  });

  it("does not retain workspace secrets after switching to a workspace without them", function() {
    const first = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-runtime-first-"));
    const second = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-runtime-second-"));
    const original = saveRuntimeEnvironment();
    try {
      delete process.env.XQW_API_KEY;
      fs.writeFileSync(path.join(first, ".env"), "XQW_API_KEY=first-workspace-secret\n", "utf8");
      configureRuntimeEnvironment({ appRoot: first, workspaceRoot: first });
      assert.equal(process.env.XQW_API_KEY, "first-workspace-secret");

      const runtime = configureRuntimeEnvironment({ appRoot: second, workspaceRoot: second });
      assert.equal(process.env.XQW_API_KEY, undefined);
      assert.ok(runtime.configErrors.some(function(error) { return error.code === "MEDIA_CONFIG_INVALID"; }));
      assert.equal(JSON.stringify(runtime.configErrors).includes("first-workspace-secret"), false);
    } finally {
      restoreRuntimeEnvironment(original);
      fs.rmSync(first, { recursive: true, force: true });
      fs.rmSync(second, { recursive: true, force: true });
    }
  });
});

it("keeps media API key resolution free of dotenv loading side effects", function() {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "platforms", "media", "config.js"), "utf8");
  assert.equal(source.includes("dotenv.config"), false);
});

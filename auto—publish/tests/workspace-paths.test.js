const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");

const { createWorkspacePaths, ensureWorkspaceDirectories } = require("../desktop/workspace-paths");
const { configureRuntimeEnvironment } = require("../desktop/runtime-config");
const { createStoragePaths, ensureContentLibrary } = require("../desktop/storage-paths");

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
  it("keeps the selected content library limited to portable content paths", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-workspace-"));
    try {
      const paths = createWorkspacePaths(root);
      ensureWorkspaceDirectories(paths);

      [
        "clients", "generated", "templates", "autopublish", "research",
        "generationBatches", "queue", "submissionRecords"
      ].forEach(function(key) {
        assert.ok(fs.statSync(paths[key]).isDirectory(), key + " was not created");
      });
      assert.equal(paths.clients, path.join(root, "clients"));
      assert.equal(paths.generated, path.join(root, "generated"));
      assert.equal(paths.templates, path.join(root, "templates"));
      assert.equal(paths.autopublish, path.join(root, ".autopublish"));
      assert.equal(paths.generationBatches, path.join(paths.autopublish, "batches"));
      assert.equal(fs.existsSync(path.join(root, "logs")), false);
      assert.equal(fs.existsSync(path.join(root, "browser")), false);
      assert.equal(fs.existsSync(path.join(root, "tmp")), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("initializes a content library without creating local or installation state", function() {
    const installation = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-install-"));
    const roamingConfig = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-roaming-"));
    const localState = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-local-"));
    const contentLibrary = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-content-"));
    try {
      const storage = createStoragePaths({ installation, roamingConfig, localState, contentLibrary });
      ensureContentLibrary(storage);
      assert.ok(fs.existsSync(storage.marker));
      assert.equal(fs.existsSync(path.join(installation, "clients")), false);
      assert.equal(fs.existsSync(path.join(localState, "logs")), false);
      assert.equal(fs.existsSync(path.join(contentLibrary, "clients")), true);
    } finally {
      [installation, roamingConfig, localState, contentLibrary].forEach(function(root) {
        fs.rmSync(root, { recursive: true, force: true });
      });
    }
  });
});

describe("runtime configuration", function() {
  it("loads application tool configuration before config-dependent modules are evaluated", function() {
    const values = {
      appRoot: fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-config-app-")),
      workspaceRoot: fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-config-workspace-")),
      roamingConfigRoot: fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-config-roaming-")),
      localStateRoot: fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-config-local-"))
    };
    try {
      fs.mkdirSync(path.join(values.roamingConfigRoot, "runtime"), { recursive: true });
      fs.writeFileSync(path.join(values.roamingConfigRoot, "runtime", "runtime-tools.json"), JSON.stringify({
        markitdownCmd: "configured-markitdown",
        playwrightCliJs: "configured-playwright-cli"
      }), "utf8");
      const result = childProcess.spawnSync(process.execPath, ["-e", [
        "const input=JSON.parse(process.argv[1]);",
        "require('./desktop/runtime-config').configureRuntimeEnvironment(input);",
        "const config=require('./scripts/config');",
        "process.stdout.write(JSON.stringify({markitdown:config.MARKITDOWN_CMD,playwright:config.PLAYWRIGHT_CLI_JS}));"
      ].join(""), JSON.stringify(values)], {
        cwd: path.resolve(__dirname, ".."),
        env: Object.assign({}, process.env, { MARKITDOWN_CMD: "", PLAYWRIGHT_CLI_JS: "" }),
        encoding: "utf8"
      });

      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), {
        markitdown: "configured-markitdown",
        playwright: "configured-playwright-cli"
      });
    } finally {
      Object.keys(values).forEach(function(key) { fs.rmSync(values[key], { recursive: true, force: true }); });
    }
  });

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
      assert.throws(function() {
        configureRuntimeEnvironment({ appRoot: process.cwd(), workspaceRoot: process.cwd() });
      }, /roamingConfigRoot is required/);
    } finally {
      restoreRuntimeEnvironment(original);
    }
  });

  it("loads the workspace environment once and exposes workspace paths", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-runtime-"));
    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-runtime-app-"));
    const roamingConfigRoot = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-runtime-roaming-"));
    const localStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-runtime-local-"));
    const original = saveRuntimeEnvironment();
    try {
      fs.writeFileSync(path.join(root, ".env"), "XQW_API_KEY=workspace-secret\nAI_API_KEY=workspace-ai-secret\nAI_BASE_URL=https://workspace.example/v1\nAI_MODEL=workspace-model\nAI_TIMEOUT_MS=10\n", "utf8");
      delete process.env.XQW_API_KEY;
      const runtime = configureRuntimeEnvironment({
        appRoot: appRoot,
        workspaceRoot: root,
        roamingConfigRoot: roamingConfigRoot,
        localStateRoot: localStateRoot
      });
      assert.equal(runtime.workspaceRoot, path.resolve(root));
      assert.equal(runtime.paths.contentLibrary, path.resolve(root));
      assert.equal(runtime.paths.data, path.join(root, ".autopublish", "data"));
      assert.equal(runtime.paths.logs, path.join(localStateRoot, "logs"));
      assert.equal(process.env.XQW_API_KEY, "workspace-secret");
      assert.equal(process.env.AI_API_KEY, undefined);
      assert.equal(process.env.AI_BASE_URL, undefined);
      assert.equal(process.env.AI_MODEL, undefined);
      assert.equal(process.env.AI_TIMEOUT_MS, undefined);
      assert.equal(process.env.AUTO_PUBLISH_ROOT_DIR, path.resolve(root));
    } finally {
      restoreRuntimeEnvironment(original);
      [root, appRoot, roamingConfigRoot, localStateRoot].forEach(function(directory) {
        fs.rmSync(directory, { recursive: true, force: true });
      });
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
    const firstApp = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-runtime-first-app-"));
    const secondApp = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-runtime-second-app-"));
    const firstRoaming = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-runtime-first-roaming-"));
    const secondRoaming = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-runtime-second-roaming-"));
    const firstLocal = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-runtime-first-local-"));
    const secondLocal = fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-runtime-second-local-"));
    const original = saveRuntimeEnvironment();
    try {
      delete process.env.XQW_API_KEY;
      fs.writeFileSync(path.join(first, ".env"), "XQW_API_KEY=first-workspace-secret\n", "utf8");
      configureRuntimeEnvironment({
        appRoot: firstApp,
        workspaceRoot: first,
        roamingConfigRoot: firstRoaming,
        localStateRoot: firstLocal
      });
      assert.equal(process.env.XQW_API_KEY, "first-workspace-secret");

      const runtime = configureRuntimeEnvironment({
        appRoot: secondApp,
        workspaceRoot: second,
        roamingConfigRoot: secondRoaming,
        localStateRoot: secondLocal
      });
      assert.equal(process.env.XQW_API_KEY, undefined);
      assert.ok(runtime.configErrors.some(function(error) { return error.code === "MEDIA_CONFIG_INVALID"; }));
      assert.equal(JSON.stringify(runtime.configErrors).includes("first-workspace-secret"), false);
    } finally {
      restoreRuntimeEnvironment(original);
      fs.rmSync(first, { recursive: true, force: true });
      fs.rmSync(second, { recursive: true, force: true });
      [firstApp, secondApp, firstRoaming, secondRoaming, firstLocal, secondLocal].forEach(function(directory) {
        fs.rmSync(directory, { recursive: true, force: true });
      });
    }
  });
});

it("keeps media API key resolution free of dotenv loading side effects", function() {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "platforms", "media", "config.js"), "utf8");
  assert.equal(source.includes("dotenv.config"), false);
});

const path = require("node:path");
const fs = require("node:fs");
const dotenv = require("dotenv");
const { createStoragePaths } = require("./storage-paths");
const { createWorkspacePaths, ensureWorkspaceDirectories } = require("./workspace-paths");
const { createRuntimeConfigStore, SUPPORTED_RUNTIME_CONFIG_KEYS } = require("./runtime-config-store");
const { createRuntimeDiagnosticsService } = require("./services/runtime-diagnostics-service");

let loadedWorkspaceEnv;
let loadedWorkspaceValues = {};
let loadedApplicationValues = {};

function unloadValues(values) {
  Object.keys(values).forEach(function(key) {
    const loaded = values[key];
    if (process.env[key] !== loaded.value) return;
    if (loaded.previous === undefined) delete process.env[key];
    else process.env[key] = loaded.previous;
  });
}

function unloadWorkspaceEnvironment() {
  unloadValues(loadedWorkspaceValues);
  loadedWorkspaceValues = {};
  loadedWorkspaceEnv = undefined;
}

function loadApplicationEnvironment(configRoot, store) {
  unloadValues(loadedApplicationValues);
  loadedApplicationValues = {};
  let values = {};
  try { values = store.read(); } catch (_) { values = {}; }
  SUPPORTED_RUNTIME_CONFIG_KEYS.forEach(function(key) {
    if (process.env[key] !== undefined || values[key] === undefined) return;
    process.env[key] = values[key];
    loadedApplicationValues[key] = { previous: undefined, value: values[key] };
  });
  return values;
}

function loadWorkspaceEnvironment(workspaceRoot) {
  const envPath = path.join(workspaceRoot, ".env");
  if (loadedWorkspaceEnv === envPath) return;

  unloadWorkspaceEnvironment();
  loadedWorkspaceEnv = envPath;
  if (!fs.existsSync(envPath)) return;

  const values = dotenv.parse(fs.readFileSync(envPath, "utf8"));
  Object.keys(values).forEach(function(key) {
    // AI configuration is application-scoped and must never come from a content library.
    if (!SUPPORTED_RUNTIME_CONFIG_KEYS.includes(key) || key.startsWith("AI_")) return;
    if (process.env[key] !== undefined) return;
    process.env[key] = values[key];
    loadedWorkspaceValues[key] = { previous: undefined, value: values[key] };
  });
}

function validateRuntimeConfiguration(environment) {
  const env = environment || process.env;
  const errors = [];
  if (!env.XQW_API_KEY) errors.push({ code: "MEDIA_CONFIG_INVALID", message: "Media configuration is invalid" });
  // Playwright, MarkItDown, and Hepan are diagnosed as independent
  // capabilities. Built-in Playwright Node/CLI and the default browser
  // channel must not require ordinary users to edit runtime-tools.json.
  return errors;
}

function requiredRoot(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(name + " is required");
  return value;
}

function configureRuntimeEnvironment(options) {
  const values = options || {};
  const appRoot = path.resolve(requiredRoot(values.appRoot, "appRoot"));
  const contentLibrary = path.resolve(requiredRoot(values.contentLibraryRoot || values.workspaceRoot, "workspaceRoot"));
  const roamingConfig = path.resolve(requiredRoot(values.roamingConfigRoot || values.userDataPath, "roamingConfigRoot"));
  const localState = path.resolve(requiredRoot(values.localStateRoot || values.sessionDataPath, "localStateRoot"));
  const storage = createStoragePaths({
    installation: appRoot,
    roamingConfig: roamingConfig,
    localState: localState,
    contentLibrary: contentLibrary
  });
  const paths = createWorkspacePaths(contentLibrary, storage);

  process.env.AUTO_PUBLISH_ROOT_DIR = contentLibrary;
  process.env.AUTO_PUBLISH_APP_ROOT = appRoot;
  process.env.AUTO_PUBLISH_WORKSPACE = contentLibrary;
  process.env.AUTO_PUBLISH_LOCAL_STATE = localState;

  const runtimeConfigStore = createRuntimeConfigStore({ configRoot: roamingConfig });
  const applicationValues = loadApplicationEnvironment(roamingConfig, runtimeConfigStore);
  loadWorkspaceEnvironment(contentLibrary);
  ensureWorkspaceDirectories(paths);
  [paths.logs, paths.cache, paths.tmp, paths.work, paths.browser].forEach(function(directory) {
    fs.mkdirSync(directory, { recursive: true });
  });

  const diagnosticsService = createRuntimeDiagnosticsService({
    workspaceRoot: contentLibrary,
    appRoot: appRoot,
    paths: paths,
    applicationValues: applicationValues,
    packaged: process.env.AUTO_PUBLISH_PACKAGED === "1"
  });
  const diagnostics = diagnosticsService.diagnose();
  if (!process.env.MARKITDOWN_CMD && diagnostics.tools.markitdown.command) process.env.MARKITDOWN_CMD = diagnostics.tools.markitdown.command;
  if (!process.env.PLAYWRIGHT_CLI_JS && diagnostics.tools.playwrightCli.command) process.env.PLAYWRIGHT_CLI_JS = diagnostics.tools.playwrightCli.command;
  if (!process.env.AUTO_PUBLISH_NODE_EXEC_PATH && diagnostics.tools.playwrightNode.command) process.env.AUTO_PUBLISH_NODE_EXEC_PATH = diagnostics.tools.playwrightNode.command;
  if (!process.env.HEPAN_PYTHON && diagnostics.tools.hepanPython.command) process.env.HEPAN_PYTHON = diagnostics.tools.hepanPython.command;
  if (!process.env.BROWSER_CHANNEL && diagnostics.tools.browserChannel.channel) process.env.BROWSER_CHANNEL = diagnostics.tools.browserChannel.channel;
  paths.playwrightNodeExecPath = diagnostics.tools.playwrightNode.command;
  paths.playwrightCliJs = diagnostics.tools.playwrightCli.command;
  paths.browserChannel = diagnostics.tools.browserChannel.channel || "msedge";
  // src/core/files loads scripts/config.js at module evaluation time. Delay
  // that dependency until diagnostics has applied tool resolution so values
  // from runtime-tools.json are not frozen to development defaults.
  const { configureRuntimePaths } = require("../src/core/files");
  configureRuntimePaths(paths);
  const configErrors = validateRuntimeConfiguration().concat(diagnostics.errors);

  return {
    appRoot: appRoot,
    workspaceRoot: contentLibrary,
    contentLibrary: contentLibrary,
    storage: storage,
    paths: paths,
    runtimeConfigStore: runtimeConfigStore,
    configErrors: configErrors,
    diagnostics: diagnostics
  };
}

module.exports = {
  configureRuntimeEnvironment,
  loadWorkspaceEnvironment,
  unloadWorkspaceEnvironment,
  validateRuntimeConfiguration
};

const path = require("node:path");
const fs = require("node:fs");
const dotenv = require("dotenv");
const { createWorkspacePaths, ensureWorkspaceDirectories } = require("./workspace-paths");
const { createRuntimeDiagnosticsService } = require("./services/runtime-diagnostics-service");

let loadedWorkspaceEnv;
let loadedWorkspaceValues = {};

function unloadWorkspaceEnvironment() {
  Object.keys(loadedWorkspaceValues).forEach(function(key) {
    const loaded = loadedWorkspaceValues[key];
    if (process.env[key] !== loaded.value) return;
    if (loaded.previous === undefined) delete process.env[key];
    else process.env[key] = loaded.previous;
  });
  loadedWorkspaceValues = {};
}

function loadWorkspaceEnvironment(workspaceRoot) {
  const envPath = path.join(workspaceRoot, ".env");
  if (loadedWorkspaceEnv === envPath) return;

  unloadWorkspaceEnvironment();
  loadedWorkspaceEnv = envPath;
  if (!fs.existsSync(envPath)) return;

  const values = dotenv.parse(fs.readFileSync(envPath, "utf8"));
  Object.keys(values).forEach(function(key) {
    if (process.env[key] !== undefined) return;
    process.env[key] = values[key];
    loadedWorkspaceValues[key] = { previous: undefined, value: values[key] };
  });
}

function validateRuntimeConfiguration(environment) {
  const env = environment || process.env;
  const errors = [];
  if (!env.AI_API_KEY || !env.AI_BASE_URL || !env.AI_MODEL) {
    errors.push({ code: "AI_CONFIG_INVALID", message: "AI configuration is invalid" });
  }
  if (!env.XQW_API_KEY) {
    errors.push({ code: "MEDIA_CONFIG_INVALID", message: "Media configuration is invalid" });
  }
  if (!env.MARKITDOWN_CMD) {
    errors.push({ code: "MARKITDOWN_CONFIG_INVALID", message: "MarkItDown configuration is invalid" });
  }
  if (!env.PLAYWRIGHT_CLI_JS) {
    errors.push({ code: "PLAYWRIGHT_CONFIG_INVALID", message: "Playwright configuration is invalid" });
  }
  if (!env.BROWSER_CHANNEL) {
    errors.push({ code: "BROWSER_CONFIG_INVALID", message: "Browser configuration is invalid" });
  }
  if (!env.HEPAN_COOKIE_PATH || !env.HEPAN_PYTHON) {
    errors.push({ code: "HEPAN_CONFIG_INVALID", message: "Hepan configuration is invalid" });
  }
  return errors;
}

function configureRuntimeEnvironment(options) {
  const values = options || {};
  const appRoot = path.resolve(values.appRoot || process.env.AUTO_PUBLISH_APP_ROOT || process.cwd());
  const workspaceRoot = path.resolve(values.workspaceRoot || process.env.AUTO_PUBLISH_WORKSPACE || process.cwd());
  const paths = ensureWorkspaceDirectories(createWorkspacePaths(workspaceRoot));

  process.env.AUTO_PUBLISH_ROOT_DIR = workspaceRoot;
  process.env.AUTO_PUBLISH_APP_ROOT = appRoot;
  process.env.AUTO_PUBLISH_WORKSPACE = workspaceRoot;
  loadWorkspaceEnvironment(workspaceRoot);
  const diagnostics = createRuntimeDiagnosticsService({ workspaceRoot, appRoot }).diagnose();
  if (!process.env.MARKITDOWN_CMD && diagnostics.tools.markitdown.command) process.env.MARKITDOWN_CMD = diagnostics.tools.markitdown.command;
  if (!process.env.PLAYWRIGHT_CLI_JS && diagnostics.tools.playwright.command) process.env.PLAYWRIGHT_CLI_JS = diagnostics.tools.playwright.command;
  if (!process.env.HEPAN_PYTHON && diagnostics.tools.hepanPython.command) process.env.HEPAN_PYTHON = diagnostics.tools.hepanPython.command;
  const configErrors = validateRuntimeConfiguration().concat(diagnostics.errors);

  return { appRoot, workspaceRoot, paths, configErrors, diagnostics };
}

module.exports = { configureRuntimeEnvironment, loadWorkspaceEnvironment, validateRuntimeConfiguration };

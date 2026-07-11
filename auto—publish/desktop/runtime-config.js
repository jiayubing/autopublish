const path = require("node:path");
const dotenv = require("dotenv");
const { createWorkspacePaths, ensureWorkspaceDirectories } = require("./workspace-paths");

let loadedWorkspaceEnv;

function loadWorkspaceEnvironment(workspaceRoot) {
  const envPath = path.join(workspaceRoot, ".env");
  if (loadedWorkspaceEnv !== envPath) {
    dotenv.config({ path: envPath, quiet: true });
    loadedWorkspaceEnv = envPath;
  }
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
  const configErrors = validateRuntimeConfiguration();

  return { appRoot, workspaceRoot, paths, configErrors };
}

module.exports = { configureRuntimeEnvironment, loadWorkspaceEnvironment, validateRuntimeConfiguration };

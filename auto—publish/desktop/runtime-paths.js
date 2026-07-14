const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const runtimeConfig = require("./runtime-config");

/**
 * Return the directory that contains the application code.
 * Read-only in packaged mode.
 * In development this is the project root.
 * In a packaged app (asar:false) this is the resources/ directory.
 */
function appRoot() {
  if (app && app.isPackaged) {
    return process.resourcesPath || path.resolve(__dirname, "..");
  }
  return path.resolve(__dirname, "..");
}

/**
 * Return the writable workspace directory.
 *
 * Priority:
 * 1. AUTO_PUBLISH_WORKSPACE env variable (explicit override)
 * 2. %USERPROFILE%\Documents\AutoPublish (packaged mode, user-visible)
 * 3. process.cwd() (development mode)
 */
function workspaceRoot() {
  if (process.env.AUTO_PUBLISH_WORKSPACE) {
    return path.resolve(process.env.AUTO_PUBLISH_WORKSPACE);
  }
  if (app && app.isPackaged) {
    var homeDir = process.env.USERPROFILE || path.join("C:", "Users", process.env.USERNAME || "default");
    return path.join(homeDir, "Documents", "AutoPublish");
  }
  return process.cwd();
}

var RUNTIME_DIRS = [
  "input",
  "data",
  "logs",
  "published",
  "failed",
  "tmp",
  "work"
];

function ensureRuntimeDirs(root) {
  RUNTIME_DIRS.forEach(function(relativePath) {
    fs.mkdirSync(path.join(root, relativePath), { recursive: true });
  });
}

function configureRuntimeEnvironment(options) {
  var values = options || {};
  if (typeof values.workspaceRoot !== "string" || values.workspaceRoot.trim() === "") {
    throw new Error("workspaceRoot is required");
  }
  if (typeof values.appRoot !== "string" || values.appRoot.trim() === "") {
    throw new Error("appRoot is required");
  }
  return runtimeConfig.configureRuntimeEnvironment({
    appRoot: values.appRoot,
    workspaceRoot: values.workspaceRoot
  });
}

module.exports = {
  appRoot: appRoot,
  workspaceRoot: workspaceRoot,
  configureRuntimeEnvironment: configureRuntimeEnvironment
};

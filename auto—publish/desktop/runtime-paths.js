const path = require("path");
const fs = require("fs");
const { app } = require("electron");

/**
 * Return the directory that contains the application code/resources.
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
 * Return the runtime writable workspace directory.
 *
 * Priority:
 * 1. AUTO_PUBLISH_WORKSPACE env variable (explicit override)
 * 2. Electron userData / AutoPublish (packaged mode)
 * 3. process.cwd() (development mode)
 */
function runtimeRoot() {
  if (process.env.AUTO_PUBLISH_WORKSPACE) {
    return path.resolve(process.env.AUTO_PUBLISH_WORKSPACE);
  }
  if (app && app.isPackaged) {
    return path.join(app.getPath("userData"), "AutoPublish");
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

function configureRuntimeEnvironment() {
  var root = runtimeRoot();
  ensureRuntimeDirs(root);
  process.env.AUTO_PUBLISH_ROOT_DIR = root;
  return root;
}

module.exports = {
  appRoot: appRoot,
  runtimeRoot: runtimeRoot,
  configureRuntimeEnvironment: configureRuntimeEnvironment
};
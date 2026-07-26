const path = require("node:path");
let app = null;
try { app = require("electron").app; } catch (_) {}
const runtimeConfig = require("./runtime-config");

function appRoot() {
  if (app && app.isPackaged) return process.resourcesPath || path.resolve(__dirname, "..");
  return path.resolve(__dirname, "..");
}

function workspaceRoot(value) {
  const candidate = value || process.env.AUTO_PUBLISH_WORKSPACE;
  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new Error("workspaceRoot is required");
  }
  return path.resolve(candidate);
}

function configureRuntimeEnvironment(options) {
  const values = options || {};
  if (typeof values.workspaceRoot !== "string" || values.workspaceRoot.trim() === "") throw new Error("workspaceRoot is required");
  if (typeof values.appRoot !== "string" || values.appRoot.trim() === "") throw new Error("appRoot is required");
  if (typeof (values.roamingConfigRoot || values.userDataPath) !== "string" || !(values.roamingConfigRoot || values.userDataPath).trim()) {
    throw new Error("roamingConfigRoot is required");
  }
  if (typeof (values.localStateRoot || values.sessionDataPath) !== "string" || !(values.localStateRoot || values.sessionDataPath).trim()) {
    throw new Error("localStateRoot is required");
  }
  return runtimeConfig.configureRuntimeEnvironment({
    appRoot: values.appRoot,
    resourcesPath: values.resourcesPath,
    workspaceRoot: values.workspaceRoot,
    roamingConfigRoot: values.roamingConfigRoot || values.userDataPath,
    localStateRoot: values.localStateRoot || values.sessionDataPath
  });
}

module.exports = { appRoot, workspaceRoot, configureRuntimeEnvironment };

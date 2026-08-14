"use strict";

const path = require("node:path");

function browserRuntime(value) {
  if (value === undefined || value === null) return Object.freeze({});
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("browserRuntime must be an object");
  }
  const allowed = [
    "browserChannel",
    "playwrightCliJs",
    "nodeExecPath",
    "profileDir",
    "profileRoot",
    "daemonDir",
    "daemonRoot",
    "stateFile",
    "stateDir",
    "downloadDir",
    "tempDir",
  ];
  const result = {};
  allowed.forEach(function (key) {
    if (value[key] !== undefined) result[key] = value[key];
  });
  return Object.freeze(result);
}

function createPlatformRuntimeContext(options) {
  const values = options || {};
  if (
    !values.workspacePaths ||
    typeof values.workspacePaths !== "object" ||
    Array.isArray(values.workspacePaths)
  ) {
    throw new Error("workspacePaths are required");
  }
  return Object.freeze({
    workspacePaths: Object.freeze(Object.assign({}, values.workspacePaths)),
    browserRuntime: browserRuntime(values.browserRuntime),
  });
}

function createPlatformRuntimeContextFromWorkspacePaths(workspacePaths) {
  const paths = workspacePaths || {};
  const profileRoot =
    typeof paths.browser === "string" && paths.browser.trim()
      ? paths.browser
      : undefined;
  return createPlatformRuntimeContext({
    workspacePaths: paths,
    browserRuntime: {
      browserChannel: paths.browserChannel,
      playwrightCliJs: paths.playwrightCliJs,
      nodeExecPath: paths.playwrightNodeExecPath,
      profileRoot,
      daemonRoot: profileRoot
        ? path.join(profileRoot, "sessions")
        : undefined,
      stateDir: profileRoot ? path.join(profileRoot, "state") : undefined,
      tempDir: paths.tmp,
    },
  });
}

module.exports = {
  createPlatformRuntimeContext,
  createPlatformRuntimeContextFromWorkspacePaths,
};

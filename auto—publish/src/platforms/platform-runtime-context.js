"use strict";

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

module.exports = { createPlatformRuntimeContext };

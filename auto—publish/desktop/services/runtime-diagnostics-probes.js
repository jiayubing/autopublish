"use strict";

const fs = require("node:fs");
const path = require("node:path");

function existing(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function probeBundledMammoth(appRoot, override) {
  if (override !== undefined)
    return {
      available: override === true,
      observation: "override",
    };
  try {
    require.resolve("mammoth", { paths: [appRoot] });
    return { available: true, observation: "module" };
  } catch (_) {
    return { available: false, observation: "unavailable" };
  }
}

function hasBundledMammoth(appRoot, override) {
  return probeBundledMammoth(appRoot, override).available;
}

function readJsonObject(filename) {
  try {
    const value = JSON.parse(fs.readFileSync(filename, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? { value, observation: "complete" }
      : { value: {}, observation: "invalid" };
  } catch (_) {
    return { value: {}, observation: "unavailable" };
  }
}

function readBuildInfo(appRoot, environment) {
  const env = environment || process.env;
  let source = "fallback";
  let observation = "fallback";
  let value = {};
  const configured = readJsonObject(
    path.join(appRoot, "config", "build-info.json"),
  );
  if (configured.observation === "complete") {
    value = configured.value;
    source = "config";
    observation = "complete";
  } else {
    const root = readJsonObject(path.join(appRoot, "build-info.json"));
    if (root.observation === "complete") {
      value = root.value;
      source = "root";
      observation = "fallback";
    }
  }
  let version = existing(value.version);
  if (!version) {
    const packageInfo = readJsonObject(path.join(appRoot, "package.json"));
    if (packageInfo.observation === "complete") {
      version = existing(packageInfo.value.version);
      if (version) {
        if (source === "fallback") source = "package";
        observation = "partial";
      }
    }
  }
  return {
    version: version || "unknown",
    commit:
      existing(value.commit) ||
      existing(env.AUTO_PUBLISH_COMMIT_SHA) ||
      "unknown",
    dirty: value.dirty === true || env.AUTO_PUBLISH_DIRTY === "1",
    source,
    observation,
  };
}

function capability(state, source, errorCode, lastCheckedAt) {
  return {
    state,
    source: source || null,
    errorCode: errorCode || null,
    lastCheckedAt: lastCheckedAt || null,
  };
}

function diagnosticErrors(tools, capabilities) {
  const errors = [];
  if (!tools.playwrightNode.command)
    errors.push({
      code: "PLAYWRIGHT_NODE_UNAVAILABLE",
      message: "Bundled Playwright Node is unavailable",
    });
  if (!tools.playwrightCli.command)
    errors.push({
      code: "PLAYWRIGHT_CLI_UNAVAILABLE",
      message: "Bundled Playwright CLI is unavailable",
    });
  if (!tools.browserChannel.configured)
    errors.push({
      code: tools.browserChannel.errorCode || "BROWSER_CHANNEL_INVALID",
      message: "Browser channel configuration is invalid",
    });
  if (capabilities.browserChannel.state === "unavailable")
    errors.push({
      code:
        capabilities.browserChannel.errorCode || "BROWSER_CHANNEL_UNAVAILABLE",
      message: "Browser channel is unavailable",
    });
  if (capabilities.docx.state === "unavailable")
    errors.push({
      code: "DOCX_RUNTIME_UNAVAILABLE",
      message: "Built-in DOCX parsing is unavailable",
    });
  return errors;
}

function diagnosticWarnings(tools, capabilities) {
  const warnings = [];
  if (capabilities.browserChannel.state === "not_checked")
    warnings.push({
      code: "BROWSER_CHANNEL_NOT_CHECKED",
      message: "Browser channel has not been checked in this process",
    });
  if (!tools.hepanPython.command)
    warnings.push({
      code: "HEPAN_PYTHON_UNAVAILABLE",
      message: "Hepan is not configured; only Hepan publishing is affected",
    });
  return warnings;
}

function safeProbeError(code) {
  const messages = {
    PLAYWRIGHT_NODE_UNAVAILABLE: "Bundled Playwright Node is unavailable",
    PLAYWRIGHT_CLI_UNAVAILABLE: "Bundled Playwright CLI is unavailable",
    BROWSER_CHANNEL_UNAVAILABLE:
      "Browser channel is unavailable; check Edge or Chrome",
    PLAYWRIGHT_TIMEOUT: "Browser self-check timed out",
    PLAYWRIGHT_EXEC_FAILED: "Browser self-check failed",
  };
  const error = new Error(messages[code] || messages.PLAYWRIGHT_EXEC_FAILED);
  error.code = code;
  return error;
}

function execFileAsync(executor, file, args, options) {
  return new Promise(function (resolve, reject) {
    executor(file, args, options, function (error, stdout, stderr) {
      if (error) {
        reject({
          error,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
        });
        return;
      }
      resolve({ stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

module.exports = {
  existing,
  probeBundledMammoth,
  hasBundledMammoth,
  readJsonObject,
  readBuildInfo,
  capability,
  diagnosticErrors,
  diagnosticWarnings,
  safeProbeError,
  execFileAsync,
};

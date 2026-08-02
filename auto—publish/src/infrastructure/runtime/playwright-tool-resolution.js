"use strict";

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

function existing(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readApplicationTools(appRoot, options) {
  const opts = options || {};
  const paths = opts.paths || {};
  const filename =
    opts.applicationToolsPath ||
    (paths.config && path.join(paths.config, "runtime-tools.json")) ||
    path.join(appRoot, "config", "runtime-tools.json");
  try {
    const value = JSON.parse(fs.readFileSync(filename, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch (_) {
    return {};
  }
}

function regularFile(filename) {
  if (!filename || typeof filename !== "string") return false;
  try {
    const stat = fs.lstatSync(filename);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (_) {
    return false;
  }
}

function defaultPathLookup(command) {
  try {
    const lookup = process.platform === "win32" ? "where.exe" : "which";
    return (
      childProcess
        .execFileSync(lookup, [command], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        })
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)[0] || null
    );
  } catch (_) {
    return null;
  }
}

function configuredValue(config, applicationValues, name, envName) {
  return (
    existing(config[name]) ||
    existing(applicationValues && applicationValues[envName]) ||
    null
  );
}

function resolveExecutable(options) {
  const opts = options || {};
  const configured = configuredValue(
    opts.config || {},
    opts.applicationValues || {},
    opts.configName,
    opts.envName,
  );
  if (configured && regularFile(configured))
    return { command: configured, source: "application-config" };
  const environment = existing((opts.env || process.env)[opts.envName]);
  if (environment && regularFile(environment))
    return { command: environment, source: "environment" };
  const bundled = (opts.bundled || []).find(regularFile);
  if (bundled) return { command: bundled, source: "bundled" };
  if (!opts.packaged && opts.pathCommand) {
    const fromPath = existing(
      (opts.pathLookup || defaultPathLookup)(opts.pathCommand),
    );
    if (fromPath && regularFile(fromPath))
      return { command: fromPath, source: "PATH" };
  }
  return { command: null, source: null };
}

function resolveBrowserChannel(options) {
  const opts = options || {};
  const config = opts.config || {};
  const env = opts.env || process.env;
  const configured = configuredValue(
    config,
    opts.applicationValues || {},
    "browserChannel",
    "BROWSER_CHANNEL",
  );
  const channel = configured || existing(env.BROWSER_CHANNEL) || "msedge";
  if (!/^[A-Za-z0-9._-]+$/.test(channel))
    return {
      channel: null,
      source: null,
      configured: false,
      errorCode: "BROWSER_CHANNEL_INVALID",
    };
  return {
    channel,
    source: configured
      ? "application-config"
      : existing(env.BROWSER_CHANNEL)
        ? "environment"
        : "default",
    configured: true,
  };
}

module.exports = {
  existing,
  readApplicationTools,
  regularFile,
  defaultPathLookup,
  configuredValue,
  resolveExecutable,
  resolveBrowserChannel,
};

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const SAFE_ENV_KEYS = [
  "SystemRoot",
  "SYSTEMROOT",
  "WINDIR",
  "TEMP",
  "TMP",
  "ComSpec",
  "COMSPEC",
];

function smokeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeEnvironment(tempRoot, options) {
  const environment = {};
  SAFE_ENV_KEYS.forEach(function (key) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  });
  environment.PATH =
    options && options.pathEnvironment !== undefined
      ? options.pathEnvironment
      : "";
  environment.TEMP = path.join(tempRoot, "temp");
  environment.TMP = path.join(tempRoot, "temp");
  environment.AUTO_PUBLISH_PACKAGED = "1";
  environment.AUTO_PUBLISH_OFFLINE_SELF_TEST = "1";
  environment.PLAYWRIGHT_DAEMON_SESSION_DIR = path.join(
    tempRoot,
    "playwright-daemon",
  );
  environment.PYTHONDONTWRITEBYTECODE = "1";
  return environment;
}

function runCommand(file, args, options, runner) {
  let result;
  try {
    result = runner
      ? runner(file, args, options)
      : execFileSync(
          file,
          args,
          Object.assign(
            {
              cwd: options.cwd,
              env: options.env,
              encoding: "utf8",
              timeout: options.timeout || 30000,
              windowsHide: true,
              stdio: ["ignore", "pipe", "pipe"],
            },
            options,
          ),
        );
  } catch (_) {
    throw smokeError(
      "OFFLINE_COMMAND_FAILED",
      "Offline packaged command failed",
    );
  }
  if (result && typeof result.status === "number" && result.status !== 0)
    throw smokeError(
      "OFFLINE_COMMAND_FAILED",
      "Offline packaged command returned a non-zero exit code",
    );
  return {
    status: result && typeof result.status === "number" ? result.status : 0,
    stdout:
      result && result.stdout !== undefined
        ? String(result.stdout)
        : String(result || ""),
  };
}

function lastJson(value) {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch (_) {}
  }
  return null;
}

function artifact(verification, name) {
  const value = verification.artifacts.find((item) => item.name === name);
  if (!value)
    throw smokeError(
      "OFFLINE_ARTIFACT_MISSING",
      "Offline smoke artifact is missing",
    );
  return value;
}

function extractAsarFile(verification, relative, destination, asarApi) {
  const api =
    asarApi ||
    (() => {
      try {
        return require("@electron/asar");
      } catch (_) {
        return null;
      }
    })();
  if (!api || typeof api.extractFile !== "function")
    throw smokeError(
      "OFFLINE_ASAR_UNAVAILABLE",
      "Offline smoke ASAR reader is unavailable",
    );
  let bytes;
  try {
    bytes = api.extractFile(verification.archivePath, path.normalize(relative));
  } catch (_) {
    throw smokeError(
      "OFFLINE_ARCHIVE_ENTRY_UNAVAILABLE",
      "Offline smoke archive entry is unavailable",
    );
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes, { mode: 0o600 });
  return destination;
}

module.exports = {
  fs,
  path,
  smokeError,
  safeEnvironment,
  runCommand,
  lastJson,
  artifact,
  extractAsarFile,
};

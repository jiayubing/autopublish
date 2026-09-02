"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  readWorkspaceSchemaMarker,
} = require("../desktop/workspace-schema-gate");
const {
  createStoragePaths,
} = require("../src/infrastructure/workspace/storage-paths");
const { smokeError, runCommand, lastJson } = require("./offline-smoke-runtime");

function verifyStorageBoundaries(tempRoot) {
  const roots = {
    installation: path.join(tempRoot, "installation"),
    roamingConfig: path.join(tempRoot, "roaming-config"),
    localState: path.join(tempRoot, "local-state"),
    contentLibrary: path.join(tempRoot, "content-library"),
  };
  Object.values(roots).forEach((root) =>
    fs.mkdirSync(root, { recursive: true }),
  );
  const paths = createStoragePaths(roots);
  const rootNames = [
    "installation",
    "roamingConfig",
    "localState",
    "contentLibrary",
  ];
  for (let first = 0; first < rootNames.length; first += 1) {
    for (let second = first + 1; second < rootNames.length; second += 1) {
      if (paths[rootNames[first]] === paths[rootNames[second]])
        throw smokeError(
          "OFFLINE_STORAGE_BOUNDARY_FAILED",
          "Offline storage roots overlap",
        );
    }
  }
  fs.writeFileSync(
    path.join(paths.localState, "sentinel.tmp"),
    "local\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(paths.contentLibrary, "sentinel.md"),
    "content\n",
    "utf8",
  );
  if (
    !fs.existsSync(path.join(paths.localState, "sentinel.tmp")) ||
    !fs.existsSync(path.join(paths.contentLibrary, "sentinel.md"))
  )
    throw smokeError(
      "OFFLINE_STORAGE_BOUNDARY_FAILED",
      "Offline storage boundary fixture was not isolated",
    );
  fs.mkdirSync(paths.tmp, { recursive: true });
  fs.mkdirSync(paths.work, { recursive: true });
  if (!fs.existsSync(path.join(paths.contentLibrary, "sentinel.md")))
    throw smokeError(
      "OFFLINE_STORAGE_CLEANUP_FAILED",
      "Offline storage boundary fixture was not preserved",
    );
  return {
    status: "passed",
    roots: rootNames,
    cleanup: {
      status: "passed",
      removed: 0,
    },
  };
}

function verifySchemaGate(tempRoot) {
  const workspace = path.join(tempRoot, "schema-workspace");
  fs.mkdirSync(workspace, { recursive: true });
  const markerPath = path.join(workspace, ".autopublish-workspace.json");
  const supported = {
    version: CURRENT_WORKSPACE_SCHEMA_VERSION,
    createdAt: "2026-08-01T00:00:00.000Z",
  };
  fs.writeFileSync(markerPath, JSON.stringify(supported) + "\n", "utf8");
  const accepted = readWorkspaceSchemaMarker(markerPath);
  if (!accepted.allowed || accepted.status !== "supported")
    throw smokeError(
      "OFFLINE_SCHEMA_GATE_FAILED",
      "Supported workspace schema was rejected",
    );
  const before = fs.readFileSync(markerPath, "utf8");
  fs.writeFileSync(
    markerPath,
    JSON.stringify({
      version: CURRENT_WORKSPACE_SCHEMA_VERSION + 1,
      createdAt: supported.createdAt,
    }) + "\n",
    "utf8",
  );
  const rejected = readWorkspaceSchemaMarker(markerPath);
  const after = fs.readFileSync(markerPath, "utf8");
  if (
    rejected.allowed ||
    rejected.code !== "WORKSPACE_SCHEMA_FUTURE" ||
    before === after
  )
    throw smokeError(
      "OFFLINE_SCHEMA_GATE_FAILED",
      "Future workspace schema was not rejected",
    );
  return {
    status: "passed",
    supportedVersion: CURRENT_WORKSPACE_SCHEMA_VERSION,
    futureRejected: true,
  };
}

function verifyPackagedElectronApplication(
  options,
  verification,
  temporaryRoot,
  environment,
  commandRunner,
) {
  const applicationPath = options && options.applicationPath;
  if (!applicationPath) {
    if (options && options.requireApplication)
      throw smokeError(
        "OFFLINE_ELECTRON_APPLICATION_UNAVAILABLE",
        "Offline packaged Electron application path was not supplied",
      );
    return { status: "not-run" };
  }
  const absolute = path.resolve(applicationPath);
  const packageRoot = path.dirname(verification.resourcesPath);
  if (
    path.dirname(absolute) !== packageRoot ||
    path.extname(absolute).toLowerCase() !== ".exe"
  )
    throw smokeError(
      "OFFLINE_ELECTRON_APPLICATION_INVALID",
      "Offline packaged Electron application path is invalid",
    );
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch (_) {
    throw smokeError(
      "OFFLINE_ELECTRON_APPLICATION_UNAVAILABLE",
      "Offline packaged Electron application is unavailable",
    );
  }
  if (!stat.isFile() || stat.isSymbolicLink())
    throw smokeError(
      "OFFLINE_ELECTRON_APPLICATION_INVALID",
      "Offline packaged Electron application is not a regular file",
    );
  const userData = path.join(temporaryRoot, "electron-user-data");
  fs.mkdirSync(userData, { recursive: true });
  const result = runCommand(
    absolute,
    [
      "--offline-packaging-smoke",
      "--disable-gpu",
      "--user-data-dir=" + userData,
    ],
    {
      cwd: packageRoot,
      env: Object.assign({}, environment, {
        AUTO_PUBLISH_OFFLINE_SELF_TEST: "1",
      }),
      timeout:
        Number.isSafeInteger(options.applicationTimeout) &&
        options.applicationTimeout > 0
          ? options.applicationTimeout
          : 60000,
    },
    commandRunner,
  );
  const report = lastJson(result.stdout);
  if (
    !report ||
    report.ok !== true ||
    !report.checks ||
    report.checks.main !== true ||
    report.checks.preload !== true ||
    report.checks.renderer !== true
  )
    throw smokeError(
      "OFFLINE_ELECTRON_SMOKE_FAILED",
      "Packaged Electron application smoke failed",
    );
  return {
    status: result.status,
    path: path.basename(absolute),
    main: true,
    preload: true,
    renderer: true,
  };
}

module.exports = {
  verifyStorageBoundaries,
  verifySchemaGate,
  verifyPackagedElectronApplication,
};

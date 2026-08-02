"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  cleanupExpiredHepanPayloads,
} = require("../src/platforms/hepan/adapter");
const {
  cleanupExpiredHepanTemporaryFiles,
} = require("../desktop/services/platform-settings/hepan-settings-adapter");
const asar = require("@electron/asar");

const {
  verifyArtifactPackage,
} = require("../desktop/packaging/artifact-verifier");
const {
  createPackagedRuntimeResolver,
} = require("../src/infrastructure/runtime/packaged-runtime-resolver");
const {
  resolveMigrationCliPath,
} = require("../desktop/packaging/migration-runtime-paths");
const {
  resolvePlaywrightRuntimePaths,
} = require("../src/infrastructure/runtime/playwright-runtime-paths");
const {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  readWorkspaceSchemaMarker,
} = require("../desktop/workspace-schema-gate");
const {
  createStoragePaths,
} = require("../src/infrastructure/workspace/storage-paths");

const SAFE_ENV_KEYS = [
  "SystemRoot",
  "SYSTEMROOT",
  "WINDIR",
  "TEMP",
  "TMP",
  "ComSpec",
  "COMSPEC",
];
const HEPAN_PAYLOAD = JSON.stringify({
  title: "offline packaging smoke",
  contentHtml: "<p>offline packaging smoke</p>",
  sourceStem: "offline-packaging-smoke",
});

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
  } catch (error) {
    throw smokeError(
      "OFFLINE_COMMAND_FAILED",
      "Offline packaged command failed",
    );
  }
  if (result && typeof result.status === "number" && result.status !== 0) {
    throw smokeError(
      "OFFLINE_COMMAND_FAILED",
      "Offline packaged command returned a non-zero exit code",
    );
  }
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

function extractAsarFile(verification, relative, destination) {
  let bytes;
  try {
    bytes = asar.extractFile(
      verification.archivePath,
      path.normalize(relative),
    );
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
      if (paths[rootNames[first]] === paths[rootNames[second]]) {
        throw smokeError(
          "OFFLINE_STORAGE_BOUNDARY_FAILED",
          "Offline storage roots overlap",
        );
      }
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
  ) {
    throw smokeError(
      "OFFLINE_STORAGE_BOUNDARY_FAILED",
      "Offline storage boundary fixture was not isolated",
    );
  }
  fs.mkdirSync(paths.tmp, { recursive: true });
  fs.mkdirSync(paths.work, { recursive: true });
  const staleCookie = path.join(
    paths.tmp,
    ".hepan-cookie-00000000-0000-0000-0000-000000000000.tmp",
  );
  const stalePayload = path.join(
    paths.work,
    ".hepan-payload-00000000-0000-0000-0000-000000000000.json",
  );
  fs.writeFileSync(staleCookie, "offline\n", "utf8");
  fs.writeFileSync(stalePayload, "{}\n", "utf8");
  const cleanupNow = () => Date.now() + 1;
  const temporaryCleanup = cleanupExpiredHepanTemporaryFiles({
    tmpRoot: paths.tmp,
    maxAgeMs: 0,
    now: cleanupNow,
  });
  const payloadCleanup = cleanupExpiredHepanPayloads({
    tempDir: paths.work,
    maxAgeMs: 0,
    now: cleanupNow,
  });
  if (
    !temporaryCleanup.removed.includes(path.basename(staleCookie)) ||
    !payloadCleanup.removed.includes(path.basename(stalePayload)) ||
    fs.existsSync(staleCookie) ||
    fs.existsSync(stalePayload) ||
    !fs.existsSync(path.join(paths.contentLibrary, "sentinel.md"))
  ) {
    throw smokeError(
      "OFFLINE_STORAGE_CLEANUP_FAILED",
      "Offline cleanup crossed a storage boundary",
    );
  }
  return {
    status: "passed",
    roots: rootNames,
    cleanup: {
      status: "passed",
      removed: temporaryCleanup.removed.length + payloadCleanup.removed.length,
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
  ) {
    throw smokeError(
      "OFFLINE_SCHEMA_GATE_FAILED",
      "Future workspace schema was not rejected",
    );
  }
  return {
    status: "passed",
    supportedVersion: CURRENT_WORKSPACE_SCHEMA_VERSION,
    futureRejected: true,
  };
}

function verifyHepan(
  options,
  verification,
  tempRoot,
  environment,
  commandRunner,
) {
  const pythonPath = options && options.pythonPath;
  if (!pythonPath) {
    if (options && options.requirePython)
      throw smokeError(
        "OFFLINE_PYTHON_UNAVAILABLE",
        "Offline Hepan Python path was not supplied",
      );
    return {
      status: "SKIPPED_OPTIONAL",
      reason: "optional-python-not-supplied",
    };
  }
  const resolver = createPackagedRuntimeResolver({
    packaged: true,
    resourcesPath: verification.resourcesPath,
    env: environment,
  });
  const python = resolver.tryResolve({
    explicit: pythonPath,
    allowExplicitPackaged: true,
    executable: true,
    errorCode: "OFFLINE_PYTHON_UNAVAILABLE",
  });
  if (!python.ok)
    throw smokeError(
      "OFFLINE_PYTHON_UNAVAILABLE",
      "Offline Hepan Python path is unavailable",
    );
  const script = path.join(
    verification.unpackedPath,
    "src",
    "platforms",
    "hepan",
    "hepan_publish.py",
  );
  const vendor = path.join(
    verification.unpackedPath,
    "resources",
    "hepan",
    "vendor-pure",
  );
  const payload = path.join(tempRoot, "hepan-payload.json");
  fs.writeFileSync(payload, HEPAN_PAYLOAD, { encoding: "utf8", mode: 0o600 });
  try {
    const env = Object.assign({}, environment, {
      PYTHONPATH: vendor,
      HEPAN_VENDOR_DIR: vendor,
    });
    const result = runCommand(
      python.value.path,
      [script, "--validate-payload", payload],
      { cwd: tempRoot, env, timeout: 30000 },
      commandRunner,
    );
    const output = lastJson(result.stdout);
    if (!output || output.ok !== true)
      throw smokeError(
        "OFFLINE_HEPAN_SMOKE_FAILED",
        "Offline Hepan payload smoke failed",
      );
    return {
      status: "passed",
      script: "app.asar.unpacked/src/platforms/hepan/hepan_publish.py",
    };
  } finally {
    try {
      fs.unlinkSync(payload);
    } catch (_) {}
  }
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
  ) {
    throw smokeError(
      "OFFLINE_ELECTRON_APPLICATION_INVALID",
      "Offline packaged Electron application path is invalid",
    );
  }
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
  ) {
    throw smokeError(
      "OFFLINE_ELECTRON_SMOKE_FAILED",
      "Packaged Electron application smoke failed",
    );
  }
  return {
    status: result.status,
    path: path.basename(absolute),
    main: true,
    preload: true,
    renderer: true,
  };
}

function runOfflineSelfTest(resourcesPath, options) {
  const opts = options || {};
  const verification = verifyArtifactPackage(resourcesPath, opts);
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "autopublish-offline-self-test-"),
  );
  const environment = safeEnvironment(temporaryRoot, opts);
  const commandRunner = opts.commandRunner;
  try {
    artifact(verification, "playwright-node");
    artifact(verification, "playwright-cli");
    artifact(verification, "migration-cli");
    const appRoot = path.join(verification.resourcesPath, "app.asar");
    const playwrightPaths = resolvePlaywrightRuntimePaths({
      appRoot,
      resourcesPath: verification.resourcesPath,
      packaged: true,
      env: environment,
    });
    if (
      !playwrightPaths.playwrightNode.command ||
      !playwrightPaths.playwrightCli.command
    ) {
      throw smokeError(
        "OFFLINE_RUNTIME_PATH_UNAVAILABLE",
        "Offline packaged runtime path is unavailable",
      );
    }
    const migration = resolveMigrationCliPath({
      appRoot,
      resourcesPath: verification.resourcesPath,
      packaged: true,
      env: environment,
    });
    if (!migration.path)
      throw smokeError(
        "OFFLINE_MIGRATION_CLI_UNAVAILABLE",
        "Offline migration CLI path is unavailable",
      );
    const nodePath = playwrightPaths.playwrightNode.command;
    const cliPath = playwrightPaths.playwrightCli.command;
    const migrationPath = migration.path;
    const checks = {};

    const sourceRoot = extractAsarFile(
      verification,
      "desktop/main.js",
      path.join(temporaryRoot, "archive", "desktop-main.js"),
    );
    const preloadRoot = extractAsarFile(
      verification,
      "build/preload/preload.cjs",
      path.join(temporaryRoot, "archive", "preload.cjs"),
    );
    const mainCheck = runCommand(
      nodePath,
      ["--check", sourceRoot],
      { cwd: temporaryRoot, env: environment, timeout: 30000 },
      commandRunner,
    );
    const preloadCheck = runCommand(
      nodePath,
      ["--check", preloadRoot],
      { cwd: temporaryRoot, env: environment, timeout: 30000 },
      commandRunner,
    );
    checks.electronMain = {
      status: mainCheck.status,
      path: "app.asar/desktop/main.js",
    };
    checks.preload = {
      status: preloadCheck.status,
      path: "app.asar/build/preload/preload.cjs",
    };
    const renderer = extractAsarFile(
      verification,
      "media-workbench/dist/index.html",
      path.join(temporaryRoot, "archive", "index.html"),
    );
    const rendererText = fs.readFileSync(renderer, "utf8");
    if (
      !/<html[\s>]/i.test(rendererText) ||
      !/<script[\s>]/i.test(rendererText)
    )
      throw smokeError(
        "OFFLINE_RENDERER_INVALID",
        "Packaged renderer entry is invalid",
      );
    checks.renderer = {
      status: 0,
      path: "app.asar/media-workbench/dist/index.html",
    };
    checks.electronApplication = verifyPackagedElectronApplication(
      opts,
      verification,
      temporaryRoot,
      environment,
      commandRunner,
    );

    const nodeVersion = runCommand(
      nodePath,
      ["--version"],
      { cwd: temporaryRoot, env: environment, timeout: 10000 },
      commandRunner,
    ).stdout.trim();
    if (
      nodeVersion &&
      nodeVersion !== String(artifact(verification, "playwright-node").version)
    )
      throw smokeError(
        "OFFLINE_NODE_VERSION_MISMATCH",
        "Packaged Node version does not match the artifact manifest",
      );
    runCommand(
      nodePath,
      [cliPath, "--help"],
      { cwd: temporaryRoot, env: environment, timeout: 30000 },
      commandRunner,
    );
    runCommand(
      nodePath,
      [cliPath, "-s=offline-self-test", "list"],
      { cwd: temporaryRoot, env: environment, timeout: 30000 },
      commandRunner,
    );
    checks.playwright = {
      status: 0,
      node: "tools/node/node.exe",
      cli: "app.asar.unpacked/node_modules/@playwright/cli/playwright-cli.js",
    };

    const migrationRoot = path.join(temporaryRoot, "migration");
    const migrationSource = path.join(migrationRoot, "source");
    const migrationContent = path.join(migrationRoot, "content");
    const migrationLocal = path.join(migrationRoot, "local-state");
    const migrationConfig = path.join(
      migrationRoot,
      "app-config",
      "runtime.json",
    );
    [
      migrationSource,
      migrationContent,
      migrationLocal,
      path.dirname(migrationConfig),
    ].forEach((directory) => fs.mkdirSync(directory, { recursive: true }));
    runCommand(
      nodePath,
      [
        migrationPath,
        "--source",
        migrationSource,
        "--content-library",
        migrationContent,
        "--local-state",
        migrationLocal,
        "--app-config",
        migrationConfig,
        "--dry-run",
      ],
      { cwd: temporaryRoot, env: environment, timeout: 30000 },
      commandRunner,
    );
    checks.migrationCli = {
      status: 0,
      path: "migration/migrate-content-library-v2.js",
    };

    checks.hepan = verifyHepan(
      opts,
      verification,
      temporaryRoot,
      environment,
      commandRunner,
    );
    checks.workspaceSchema = verifySchemaGate(temporaryRoot);
    checks.storageBoundaries = verifyStorageBoundaries(temporaryRoot);
    return {
      ok: true,
      packageVersion: verification.packageVersion,
      workspaceSchemaVersion: verification.workspaceSchemaVersion,
      artifacts: verification.artifacts.map((item) => ({
        name: item.name,
        path: item.relativePath,
        sha256: item.sha256,
        version: item.version,
      })),
      checks,
    };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function parseArguments(argv) {
  const args = Array.from(argv || []);
  const options = {};
  let resourcesPath = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!resourcesPath && !arg.startsWith("--")) {
      resourcesPath = arg;
    } else if (["--python", "--manifest", "--application"].includes(arg)) {
      if (!args[index + 1] || args[index + 1].startsWith("--"))
        throw smokeError("OFFLINE_ARGUMENT_INVALID", arg + " requires a value");
      const key =
        arg === "--python"
          ? "pythonPath"
          : arg === "--manifest"
            ? "manifestPath"
            : "applicationPath";
      options[key] = path.resolve(args[++index]);
    } else if (arg === "--require-python") options.requirePython = true;
    else if (arg === "--static-only") options.staticOnly = true;
    else
      throw smokeError(
        "OFFLINE_ARGUMENT_INVALID",
        "Unknown offline self-test argument",
      );
  }
  if (!resourcesPath)
    throw smokeError(
      "OFFLINE_ARGUMENT_INVALID",
      "Resources directory is required",
    );
  return { resourcesPath: path.resolve(resourcesPath), options };
}

if (require.main === module) {
  try {
    const parsed = parseArguments(process.argv.slice(2));
    const result = parsed.options.staticOnly
      ? {
          ok: true,
          packageVersion: verifyArtifactPackage(
            parsed.resourcesPath,
            parsed.options,
          ).packageVersion,
        }
      : runOfflineSelfTest(parsed.resourcesPath, parsed.options);
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    process.stderr.write(
      (error.code || "OFFLINE_SELF_TEST_FAILED") +
        ":" +
        (error.message || "Offline self-test failed") +
        "\n",
    );
    process.exitCode = 1;
  }
}

module.exports = {
  runOfflineSelfTest,
  parseArguments,
  verifyStorageBoundaries,
  verifySchemaGate,
};

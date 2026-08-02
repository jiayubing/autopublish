"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  verifyArtifactPackage,
} = require("../desktop/packaging/artifact-verifier");
const {
  resolveMigrationCliPath,
} = require("../desktop/packaging/migration-runtime-paths");
const {
  resolvePlaywrightRuntimePaths,
} = require("../src/infrastructure/runtime/playwright-runtime-paths");
const {
  runCommand,
  safeEnvironment,
  artifact,
  extractAsarFile,
} = require("./offline-smoke-runtime");
const {
  verifyHepan,
  verifySchemaGate,
  verifyStorageBoundaries,
  verifyPackagedElectronApplication,
} = require("./offline-smoke-checks");

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
    )
      throw Object.assign(
        new Error("Offline packaged runtime path is unavailable"),
        { code: "OFFLINE_RUNTIME_PATH_UNAVAILABLE" },
      );
    const migration = resolveMigrationCliPath({
      appRoot,
      resourcesPath: verification.resourcesPath,
      packaged: true,
      env: environment,
    });
    if (!migration.path)
      throw Object.assign(
        new Error("Offline migration CLI path is unavailable"),
        { code: "OFFLINE_MIGRATION_CLI_UNAVAILABLE" },
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
    runCommand(
      nodePath,
      ["--check", sourceRoot],
      { cwd: temporaryRoot, env: environment, timeout: 30000 },
      commandRunner,
    );
    runCommand(
      nodePath,
      ["--check", preloadRoot],
      { cwd: temporaryRoot, env: environment, timeout: 30000 },
      commandRunner,
    );
    checks.electronMain = { status: 0, path: "app.asar/desktop/main.js" };
    checks.preload = { status: 0, path: "app.asar/build/preload/preload.cjs" };
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
      throw Object.assign(new Error("Packaged renderer entry is invalid"), {
        code: "OFFLINE_RENDERER_INVALID",
      });
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
      throw Object.assign(
        new Error("Packaged Node version does not match the artifact manifest"),
        { code: "OFFLINE_NODE_VERSION_MISMATCH" },
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

module.exports = { runOfflineSelfTest };

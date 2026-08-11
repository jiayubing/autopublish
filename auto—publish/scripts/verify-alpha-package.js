// Verify a final Electron resources directory. Application code belongs in
// app.asar; child-process runtimes belong in app.asar.unpacked.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const asar = require("@electron/asar");

const ARCHIVE_FILES = [
  "package.json",
  "desktop/main.js",
  "desktop/preload.js",
  "desktop/device-identity-store.js",
  "desktop/ipc/auth-ipc.js",
  "desktop/ipc/media-ipc.js",
  "desktop/ipc/platform-ipc.js",
  "desktop/services/auth-service.js",
  "desktop/services/platform-task-state-store.js",
  "desktop/services/runtime-diagnostics-service.js",
  "desktop/services/ai-provider-service.js",
  "desktop/services/content-generation-batch-service.js",
  "desktop/ai-provider-config-store.js",
  "desktop/ipc/content-generation-batch-ipc.js",
  "desktop/ipc/publication-ipc.js",
  "desktop/ipc/runtime-diagnostics-ipc.js",
  "desktop/services/publication-submission-orchestrator.js",
  "desktop/services/platform-workbench/command-preparer.js",
  "desktop/services/platform-workbench/queue-reader.js",
  "src/application/publication-workflow/errors.js",
  "src/application/publication-workflow/execution.js",
  "src/application/publication-workflow/post-processing.js",
  "src/application/publication-workflow/recovery.js",
  "src/diagnostics/diagnostic-schema.js",
  "src/diagnostics/diagnostic-producer.js",
  "src/diagnostics/diagnostic-memory-sink.js",
  "src/diagnostics/diagnostic-file-sink.js",
  "src/diagnostics/diagnostic-directory-policy.js",
  "src/diagnostics/diagnostic-projection.js",
  "src/core/docx-text-extractor.js",
  "src/content/client-material-store.js",
  "src/content/generation-batch-store.js",
  "src/content/generation-batch-runner.js",
  "scripts/config.js",
  "config/platforms.json",
  "config/build-info.json",
  "resources/hepan/requirements.txt",
  "media-workbench/dist/index.html",
  "build/preload/preload.cjs",
  "node_modules/mammoth/LICENSE",
];

const UNPACKED_FILES = [
  "src/platforms/hepan/hepan_publish.py",
  "resources/hepan/vendor-pure/requests/__init__.py",
  "resources/hepan/vendor-pure/bs4/__init__.py",
  "resources/hepan/vendor-pure/certifi/cacert.pem",
  "node_modules/@playwright/cli/playwright-cli.js",
  "node_modules/@playwright/cli/package.json",
  "node_modules/@playwright/cli/LICENSE",
  "node_modules/playwright/LICENSE",
  "node_modules/playwright-core/LICENSE",
];
const RESOURCE_FILES = [
  "tools/node/node.exe",
  "tools/node/LICENSE",
  "tools/node/runtime-tools-manifest.json",
];

const PRIVATE_NAMES = new Set([
  ".env",
  "questions.json",
  "ai-provider.json",
  "media-provider.json",
  "hepan-provider.json",
  "platform-settings-migration.json",
  "provider-test-status.json",
  "auth.json",
  "auth.db",
  "auth.sqlite",
  "auth.sqlite3",
  "auth-session.json",
  "device-identity.json",
  "workspace-location.json",
  ".autopublish-workspace.json",
]);
const PRIVATE_SEGMENTS = new Set([
  "input",
  "data",
  "logs",
  "published",
  "failed",
  "tmp",
  "work",
  "research",
  "clients",
  "generated",
  "browser",
  ".playwright-cli",
  "client-material-cache",
  "content-generation-batches",
  ".autopublish",
  "submission-records",
  "publications",
  "doubao-diagnostics",
]);

function cleanupFailure(code) {
  const error = new Error("Alpha package cleanup could not be verified");
  error.code = code;
  return error;
}

function packageVerificationError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (Array.isArray(details)) error.details = details;
  return error;
}

function removeTemporaryRoot(root, code) {
  try {
    fs.rmSync(root, { recursive: true, force: true });
    return null;
  } catch (_) {
    return cleanupFailure(code);
  }
}

function regularFile(filename) {
  try {
    const stat = fs.lstatSync(filename);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (_) {
    return false;
  }
}

function normalizedEntries(archive) {
  return asar.listPackage(archive).map((entry) =>
    entry
      .replace(/^[/\\]+/, "")
      .split("\\")
      .join("/"),
  );
}

function privateEntry(relative) {
  const parts = relative.toLowerCase().split("/");
  const name = parts[parts.length - 1];
  if (parts.includes("node_modules")) return false;
  return (
    PRIVATE_NAMES.has(name) ||
    name.endsWith(".sqlite") ||
    name.endsWith(".sqlite3") ||
    name.endsWith(".db-wal") ||
    name.endsWith(".db-shm") ||
    (name.includes("hepan-cookie") && name.endsWith(".tmp")) ||
    (name.includes("hepan-images") && name.endsWith(".tmp")) ||
    parts.some((part) => PRIVATE_SEGMENTS.has(part)) ||
    (parts.includes("tests") && parts.includes("fixtures"))
  );
}

function findPrivateEntries(root) {
  const found = [];
  function visit(current) {
    fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
      const filename = path.join(current, entry.name);
      const relative = path.relative(root, filename).split(path.sep).join("/");
      if (privateEntry(relative)) found.push(relative);
      if (entry.isDirectory() && entry.name !== "node_modules") visit(filename);
    });
  }
  if (fs.existsSync(root)) visit(root);
  return found;
}

function verifyPackage(resourcesDir) {
  if (!resourcesDir)
    throw new Error(
      "Usage: node scripts/verify-alpha-package.js <win-unpacked/resources>",
    );
  const resources = path.resolve(resourcesDir);
  const archive = path.join(resources, "app.asar");
  const unpacked = path.join(resources, "app.asar.unpacked");
  const failures = [];
  if (!regularFile(archive)) failures.push("ARCHIVE_MISSING: app.asar");
  if (!fs.existsSync(unpacked))
    failures.push("UNPACKED_MISSING: app.asar.unpacked");
  if (failures.length) {
    // Compatibility diagnostic for direct helper tests; package verification
    // itself always receives the final resources directory above.
    const privateFiles = findPrivateEntries(resources);
    if (privateFiles.length)
      throw packageVerificationError(
        "ALPHA_PACKAGE_PRIVATE_CONTENT",
        "Alpha package contains private content",
        privateFiles.map((entry) => "SHOULD_NOT_EXIST: " + entry),
      );
    throw packageVerificationError(
      "ALPHA_PACKAGE_CONTENT_INVALID",
      "Alpha package contents are incomplete",
      failures,
    );
  }

  const archiveEntries = new Set(normalizedEntries(archive));
  ARCHIVE_FILES.forEach((file) => {
    if (!archiveEntries.has(file))
      failures.push("ARCHIVE_FILE_MISSING: " + file);
  });
  UNPACKED_FILES.forEach((file) => {
    if (!regularFile(path.join(unpacked, file)))
      failures.push("UNPACKED_FILE_MISSING: " + file);
  });
  RESOURCE_FILES.forEach((file) => {
    if (!regularFile(path.join(resources, file)))
      failures.push("RESOURCE_FILE_MISSING: " + file);
  });
  const hepan = path.join(
    unpacked,
    "src",
    "platforms",
    "hepan",
    "hepan_publish.py",
  );
  if (!regularFile(hepan))
    failures.push(
      "HEPAN_SCRIPT_NOT_REGULAR: src/platforms/hepan/hepan_publish.py",
    );
  normalizedEntries(archive)
    .filter(privateEntry)
    .forEach((entry) => failures.push("PRIVATE_ARCHIVE: " + entry));
  findPrivateEntries(unpacked).forEach((entry) =>
    failures.push("PRIVATE_UNPACKED: " + entry),
  );
  if (failures.length)
    throw packageVerificationError(
      "ALPHA_PACKAGE_CONTENT_INVALID",
      "Alpha package contents are invalid",
      failures,
    );
  return {
    resources,
    archive,
    unpacked,
    node: path.join(resources, "tools", "node", "node.exe"),
  };
}

function verifyHepanSmoke(unpacked) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "autopublish-packaged-hepan-"),
  );
  let primaryError = null;
  try {
    const payload = path.join(root, "payload.json");
    fs.writeFileSync(
      payload,
      JSON.stringify({
        title: "safe smoke",
        contentHtml: "<p>safe</p>",
        sourceStem: "safe",
      }),
    );
    const output = execFileSync(
      "python",
      [
        path.join(unpacked, "src", "platforms", "hepan", "hepan_publish.py"),
        "--validate-payload",
        payload,
      ],
      {
        env: Object.assign({}, process.env, {
          HEPAN_VENDOR_DIR: path.join(
            unpacked,
            "resources",
            "hepan",
            "vendor-pure",
          ),
        }),
        encoding: "utf8",
        windowsHide: true,
        timeout: 30000,
      },
    );
    const result = JSON.parse(String(output).trim());
    if (!result || result.ok !== true)
      throw new Error("Packaged Hepan smoke failed");
  } catch (error) {
    primaryError = error;
  }
  const cleanup = removeTemporaryRoot(root, "ALPHA_HEPAN_SMOKE_CLEANUP_FAILED");
  if (primaryError) {
    if (cleanup) primaryError.cleanupCode = cleanup.code;
    throw primaryError;
  }
  if (cleanup) throw cleanup;
}

function verifyPackagedPlaywright(resources) {
  const verified = verifyPackage(resources);
  return require("./verify-packaged-playwright-runtime").verifyPackagedRuntime(
    verified.unpacked,
    { staticOnly: false, node: verified.node },
  );
}

function verifyRuntimeSmoke(appDir, resourcesPath) {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "auto-publish-alpha-smoke-"),
  );
  let extractedRoot = null;
  let primaryError = null;
  try {
    let moduleRoot = appDir;
    let runtimeAppRoot = appDir;
    if (resourcesPath) {
      extractedRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "auto-publish-alpha-asar-"),
      );
      const archive = path.join(resourcesPath, "app.asar");
      require("@electron/asar").extractAll(archive, extractedRoot);
      moduleRoot = extractedRoot;
      runtimeAppRoot = archive;
    }
    const paths = require(
      path.join(
        moduleRoot,
        "src",
        "infrastructure",
        "workspace",
        "workspace-paths",
      ),
    );
    const runtime = require(
      path.join(
        moduleRoot,
        "desktop",
        "services",
        "runtime-diagnostics-service",
      ),
    );
    const workspacePaths = paths.ensureWorkspaceDirectories(
      paths.createWorkspacePaths(workspace),
    );
    [
      workspacePaths.mediaInput,
      workspacePaths.liejuInput,
      workspacePaths.toutiaoInput,
      workspacePaths.hepanInput,
    ].forEach((dir) => {
      if (!fs.existsSync(dir))
        throw new Error("Runtime workspace initialization failed");
    });
    const diagnostics = runtime
      .createRuntimeDiagnosticsService({
        workspaceRoot: workspace,
        appRoot: runtimeAppRoot,
        resourcesPath: resourcesPath,
        packaged: Boolean(resourcesPath),
        env: {},
        applicationTools: {},
        pathLookup: () => null,
      })
      .diagnose();
    if (!diagnostics || !Array.isArray(diagnostics.errors))
      throw new Error("Runtime diagnostics did not return actionable results");
    const playwrightErrors = diagnostics.errors.filter(
      (error) =>
        error &&
        (error.code === "PLAYWRIGHT_NODE_UNAVAILABLE" ||
          error.code === "PLAYWRIGHT_CLI_UNAVAILABLE"),
    );
    if (playwrightErrors.length) {
      const error = new Error("Packaged Playwright runtime is unavailable");
      error.code = "ALPHA_PLAYWRIGHT_RUNTIME_UNAVAILABLE";
      throw error;
    }
  } catch (error) {
    primaryError = error;
  }
  const workspaceCleanup = removeTemporaryRoot(
    workspace,
    "ALPHA_RUNTIME_SMOKE_CLEANUP_FAILED",
  );
  const extractedCleanup = extractedRoot
    ? removeTemporaryRoot(extractedRoot, "ALPHA_RUNTIME_ASAR_CLEANUP_FAILED")
    : null;
  const cleanup = workspaceCleanup || extractedCleanup;
  if (primaryError) {
    if (cleanup) primaryError.cleanupCode = cleanup.code;
    throw primaryError;
  }
  if (cleanup) throw cleanup;
}

if (require.main === module) {
  try {
    const verified = verifyPackage(process.argv[2]);
    verifyHepanSmoke(verified.unpacked);
    require("./verify-packaged-playwright-runtime").verifyPackagedRuntime(
      verified.unpacked,
      { staticOnly: false, node: verified.node },
    );
    verifyRuntimeSmoke(verified.unpacked, verified.resources);
    console.log("Alpha package contents OK");
  } catch (error) {
    const code =
      error &&
      typeof error.code === "string" &&
      /^(?:ALPHA|PACKAGED)_[A-Z0-9_]{1,72}$/.test(error.code)
        ? error.code
        : "ALPHA_PACKAGE_VERIFY_FAILED";
    const details = Array.isArray(error && error.details)
      ? error.details.filter(
          (value) =>
            typeof value === "string" &&
            /^[A-Za-z0-9._/ :-]+$/.test(value) &&
            !value.includes(".."),
        )
      : [];
    console.error([code, ...details].join("\n"));
    process.exitCode = 1;
  }
}

module.exports = {
  verifyPackage,
  verifyHepanSmoke,
  verifyPackagedPlaywright,
  verifyRuntimeSmoke,
  findPrivateEntries,
};

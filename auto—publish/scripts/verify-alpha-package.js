// scripts/verify-alpha-package.js
// Quick check that a packaged/unpacked alpha app directory includes the
// files required for startup. Run against win-unpacked/resources/app or
// an installed resources/app directory.

const fs = require("fs");
const path = require("path");

const REQUIRED_FILES = [
  "package.json",
  "desktop/main.js",
  "desktop/preload.js",
  "desktop/runtime-paths.js",
  "desktop/ipc/media-ipc.js",
  "desktop/ipc/platform-ipc.js",
  "desktop/services/runtime-diagnostics-service.js",
  "desktop/services/ai-provider-service.js",
  "desktop/services/content-generation-batch-service.js",
  "desktop/ai-provider-config-store.js",
  "desktop/ipc/content-generation-batch-ipc.js",
  "src/core/logger.js",
  "src/content/client-material-store.js",
  "src/core/docx-text-extractor.js",
  "src/content/generation-batch-store.js",
  "src/content/generation-batch-runner.js",
  "src/content/article-review-service.js",
  "scripts/config.js",
  "config/platforms.json",
  "media-workbench/dist/index.html",
  "tools/node/node.exe",
  "tools/node/LICENSE",
  "tools/node/runtime-tools-manifest.json",
  "node_modules/@playwright/cli/playwright-cli.js",
  "node_modules/@playwright/cli/LICENSE",
  "node_modules/playwright/LICENSE",
  "node_modules/playwright-core/LICENSE",
  "node_modules/mammoth/LICENSE",
];

const REQUIRED_DIRS = [
  "desktop",
  "desktop/ipc",
  "desktop/services",
  "desktop/worker",
  "src",
  "src/core",
  "src/platforms",
  "scripts",
  "media-workbench/dist",
  "node_modules",
];

function relativePath(appDir, filename) {
  return path.relative(appDir, filename).split(path.sep).join("/");
}

function findPrivateEntries(appDir) {
  var found = [];

  function visit(current) {
    fs.readdirSync(current, { withFileTypes: true }).forEach(function(entry) {
      var entryPath = path.join(current, entry.name);
      var relative = relativePath(appDir, entryPath);
      var segments = relative.split("/");
      var lowerSegments = segments.map(function(segment) { return segment.toLowerCase(); });
      var lowerName = entry.name.toLowerCase();

      // These two files are always workspace state, even if a dependency
      // happens to contain a file with the same name.
      if (lowerName === "workspace-location.json" || lowerName === ".autopublish-workspace.json") {
        found.push(relative);
      }

      // Production dependencies can contain legitimate fixtures and data-like
      // filenames. They are already required by the package and are not app
      // workspace content, so do not inspect any other node_modules subtree.
      if (entry.isDirectory() && lowerName === "node_modules") return;

      if (lowerName === ".env" || lowerName === "questions.json" || lowerName === "ai-provider.json") {
        found.push(relative);
      } else if (lowerName.endsWith(".json") && lowerSegments.slice(0, -1).includes("research")) {
        found.push(relative);
      } else if (lowerSegments.length >= 2 && lowerSegments[lowerSegments.length - 2] === "browser" &&
                 lowerName === "doubao") {
        found.push(relative);
      } else if (entry.isDirectory() && lowerSegments.slice(-4).join("/") === "work/playwright-cli/profiles/doubao") {
        found.push(relative);
      } else if (lowerName === "doubao-diagnostics") {
        found.push(relative);
      } else if (lowerName === "content-generation-batches" || lowerName === "client-material-cache" ||
                 lowerName === "generated") {
        found.push(relative);
      } else if (lowerSegments.length >= 2 && lowerSegments[lowerSegments.length - 2] === "tests" &&
                 lowerName === "fixtures") {
        found.push(relative);
      }

      if (entry.isDirectory()) visit(entryPath);
    });
  }

  visit(appDir);
  return found;
}

function verifyPackage(appDir) {
  if (!appDir) {
    console.error("Usage: node scripts/verify-alpha-package.js <app-dir>");
    console.error("Example: node scripts/verify-alpha-package.js release-alpha/win-unpacked/resources/app");
    process.exit(2);
  }

  if (!fs.existsSync(appDir)) {
    console.error("ERROR: Directory not found: " + appDir);
    process.exit(1);
  }

  var missing = [];

  for (var i = 0; i < REQUIRED_FILES.length; i++) {
    var filePath = path.join(appDir, REQUIRED_FILES[i]);
    if (!fs.existsSync(filePath)) {
      missing.push("FILE: " + REQUIRED_FILES[i]);
    }
  }

  for (var j = 0; j < REQUIRED_DIRS.length; j++) {
    var dirPath = path.join(appDir, REQUIRED_DIRS[j]);
    if (!fs.existsSync(dirPath)) {
      missing.push("DIR: " + REQUIRED_DIRS[j]);
    }
  }

  // Also check that private data is NOT bundled
  var shouldNotExist = [
    "input/media",
    "data/media-resources.json",
    "data/media-drafts.json",
    "logs",
  ];

  for (var k = 0; k < shouldNotExist.length; k++) {
    var checkPath = path.join(appDir, shouldNotExist[k]);
    if (fs.existsSync(checkPath)) {
      missing.push("SHOULD_NOT_EXIST: " + shouldNotExist[k]);
    }
  }

  findPrivateEntries(appDir).forEach(function(entry) {
    missing.push("SHOULD_NOT_EXIST: " + entry);
  });

  if (missing.length > 0) {
    console.error("FAILED: " + appDir);
    missing.forEach(function(m) { console.error("  " + m); });
    process.exit(1);
  }

  console.log("Alpha package contents OK: " + appDir);
}

function verifyRuntimeSmoke(appDir) {
  appDir = path.resolve(appDir);
  var workspace = fs.mkdtempSync(path.join(require("os").tmpdir(), "auto-publish-alpha-smoke-"));
  try {
    var paths = require(path.join(appDir, "desktop", "workspace-paths"));
    var runtime = require(path.join(appDir, "desktop", "services", "runtime-diagnostics-service"));
    var workspacePaths = paths.ensureWorkspaceDirectories(paths.createWorkspacePaths(workspace));
    [workspacePaths.mediaInput, workspacePaths.liejuInput, workspacePaths.toutiaoInput, workspacePaths.hepanInput].forEach(function(dir) {
      if (!fs.existsSync(dir)) throw new Error("Runtime workspace initialization failed");
    });
    var diagnostics = runtime.createRuntimeDiagnosticsService({ workspaceRoot: workspace, appRoot: appDir, pathLookup: function() { return null; } }).diagnose();
    if (!diagnostics || !Array.isArray(diagnostics.errors)) throw new Error("Runtime diagnostics did not return actionable results");
    ["mammoth", "form-data", "dotenv"].forEach(function(name) {
      try { require(path.join(appDir, "node_modules", name)); } catch (_) { throw new Error("Packaged production dependency missing: " + name); }
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

function verifyPackagedPlaywright(appDir) {
  return require("./verify-packaged-playwright-runtime").verifyPackagedRuntime(appDir, { staticOnly: false });
}

if (require.main === module) {
  verifyPackage(process.argv[2]);
  verifyRuntimeSmoke(process.argv[2]);
  verifyPackagedPlaywright(process.argv[2]);
}

module.exports = { verifyPackage, verifyRuntimeSmoke, verifyPackagedPlaywright, findPrivateEntries };

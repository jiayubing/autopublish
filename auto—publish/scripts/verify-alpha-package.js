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
  "src/core/logger.js",
  "scripts/config.js",
  "config/platforms.json",
  "media-workbench/dist/index.html",
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
    ".env",
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
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

if (require.main === module) {
  verifyPackage(process.argv[2]);
  verifyRuntimeSmoke(process.argv[2]);
}

module.exports = { verifyPackage, verifyRuntimeSmoke };

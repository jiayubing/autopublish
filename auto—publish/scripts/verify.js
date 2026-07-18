const { execFileSync } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const fs = require("fs");

const focusedGenerationTests = [
  "tests/template-generation-contract.test.js",
  "tests/renderer-content-refresh-lifecycle.test.js",
  "tests/hepan-settings-patch-contract.test.js",
  "tests/submission-batch-worker-integration.test.js",
  "tests/renderer-history-editor-flow.test.js"
].filter((relativePath) => fs.existsSync(path.join(rootDir, relativePath)));

const focusedPlanTests = [
  "tests/article-trash-submission-lifecycle.test.js",
  "tests/hepan-article-source.test.js",
  "tests/hepan-publish-contract.test.js",
  "tests/hepan-publish-interval.test.js"
].filter((relativePath) => fs.existsSync(path.join(rootDir, relativePath)));

function runNpm(args) {
  if (process.platform === "win32") {
    execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", [npm].concat(args).join(" ")], {
      cwd: rootDir,
      stdio: "inherit"
    });
    return;
  }
  execFileSync(npm, args, {
    cwd: rootDir,
    stdio: "inherit"
  });
}

if (focusedGenerationTests.length > 0) {
  execFileSync(process.execPath, ["--test", ...focusedGenerationTests], {
    cwd: rootDir,
    stdio: "inherit"
  });
}

if (focusedPlanTests.length > 0) {
  execFileSync(process.execPath, ["--test", ...focusedPlanTests], {
    cwd: rootDir,
    stdio: "inherit"
  });
}

runNpm(["test"]);
runNpm(["--prefix", "media-workbench", "run", "lint"]);
runNpm(["run", "build:renderer"]);

const unpackedAppDir = process.argv[2];
if (unpackedAppDir) {
  execFileSync(process.execPath, [path.join(__dirname, "verify-alpha-package.js"), unpackedAppDir], {
    cwd: rootDir,
    stdio: "inherit"
  });
  execFileSync(process.execPath, [path.join(__dirname, "verify-packaged-docx-runtime.js"), unpackedAppDir], {
    cwd: rootDir,
    stdio: "inherit"
  });
}

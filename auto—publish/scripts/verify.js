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
  "tests/renderer-question-editor-session.test.js",
  "tests/article-submission-eligibility.test.js",
  "tests/generation-submission-handoff.test.js",
  "tests/renderer-generation-submission-handoff.test.js",
  "tests/content-submission-batch.test.js",
  "tests/submission-attempt-rebind.test.js",
  "tests/article-removal-recovery-regression.test.js",
  "tests/article-trash-submission-lifecycle.test.js",
  "tests/hepan-article-source.test.js",
  "tests/hepan-python-payload-runtime.test.js",
  "tests/hepan-publish-contract.test.js",
  "tests/hepan-publish-interval.test.js",
  "tests/hepan-provider-settings.test.js",
  "tests/renderer-residue-cleanup-flow.test.js",
  "tests/submission-pair-state.test.js",
  "tests/article-attention-query.test.js",
  "tests/article-attention-resolver.test.js",
  "tests/workspace-data-invalidation.test.js",
  "tests/architecture-seams.test.js",
  "tests/renderer-platform-queue-refresh.test.js",
  "tests/renderer-platform-queue-refresh-lifecycle.test.js",
  "tests/article-workflow.test.js",
  "tests/renderer-article-management-flow.test.js",
  "tests/published-article-trash.test.js",
  "tests/article-management-filter-model.test.js",
  "tests/renderer-article-management-filters.test.js",
  "tests/renderer-published-trash-flow.test.js",
  "tests/article-attention-policy.test.js",
  "tests/article-attention-invalidation.test.js",
  "tests/renderer-article-attention-actions.test.js"
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

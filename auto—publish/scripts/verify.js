const { execFileSync } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const focusedGenerationTests = [
  "tests/template-generation-contract.test.js",
  "tests/hepan-settings-patch-contract.test.js",
  "tests/renderer-history-editor-flow.test.js"
];

const focusedPlanTests = [
  "tests/renderer-question-editor-session.test.js",
  "tests/article-submission-eligibility.test.js",
  "tests/hepan-provider-settings.test.js",
  "tests/renderer-residue-cleanup-flow.test.js",
  "tests/article-attention-query.test.js",
  "tests/architecture-seams.test.js",
  "tests/renderer-platform-queue-refresh-lifecycle.test.js",
  "tests/renderer-article-management-flow.test.js",
  "tests/article-management-filter-model.test.js",
  "tests/renderer-article-management-filters.test.js",
  "tests/renderer-published-trash-flow.test.js",
  "tests/article-attention-policy.test.js",
  "tests/renderer-article-attention-actions.test.js"
];

const focusedAuthTests = [
  "tests/renderer-platform-task-store.test.js",
  "tests/renderer-platform-cross-page-progress.test.js",
  "tests/auth-service.test.js",
  "tests/auth-ipc-boundary.test.js",
  "tests/auth-gate.test.js",
  "tests/auth-protected-ipc.test.js",
  "tests/device-identity-store.test.js",
  "tests/auth-local-data-boundary.test.js",
  "tests/j4125-auth-contract.test.js",
  "auth-server/tests/auth-api.test.js",
  "auth-server/tests/multi-user-auth.test.js",
  "auth-server/tests/device-limit.test.js",
  "auth-server/tests/session-family.test.js",
  "auth-server/tests/admin-cli.test.js",
  "auth-server/tests/sqlite-repository.test.js",
  "auth-server/tests/concurrent-login.test.js"
];

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

if (focusedAuthTests.length > 0) {
  execFileSync(process.execPath, ["--test", ...focusedAuthTests], {
    cwd: rootDir,
    stdio: "inherit"
  });
}

runNpm(["test"]);
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

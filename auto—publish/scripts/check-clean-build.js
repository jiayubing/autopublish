const { execFileSync } = require("node:child_process");

const allowDirty = process.argv.includes("--allow-dirty");
const status = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8", cwd: require("node:path").resolve(__dirname, "..") }).trim();
if (status && !allowDirty) {
  const error = new Error("Formal packaging requires a clean Git commit; use --allow-dirty only for a local diagnostic package");
  error.code = "BUILD_WORKTREE_DIRTY";
  process.stderr.write(error.code + ":" + error.message + "\n");
  process.exitCode = 1;
} else {
  process.stdout.write(JSON.stringify({ clean: !status, allowDirty: allowDirty, commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: require("node:path").resolve(__dirname, "..") }).trim() }) + "\n");
}

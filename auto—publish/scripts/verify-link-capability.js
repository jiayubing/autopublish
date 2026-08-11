const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const LINK_PERMISSION_CODES = new Set([
  "EPERM",
  "EACCES",
  "ENOTSUP",
  "EINVAL",
  "UNKNOWN",
]);
let cached;

function probeLinkCapability() {
  if (cached) return cached;
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "auto-publish-link-capability-"),
  );
  const targetFile = path.join(root, "target.txt");
  const fileLink = path.join(root, "file-link.txt");
  const targetDirectory = path.join(root, "target-directory");
  const directoryLink = path.join(root, "directory-link");
  fs.writeFileSync(targetFile, "link probe\n", "utf8");
  fs.mkdirSync(targetDirectory);
  let fileSymlink = false;
  let directoryJunction = false;
  let errorCode = null;
  let cleanupCode = null;
  try {
    fs.symlinkSync(targetFile, fileLink, "file");
    fileSymlink = true;
  } catch (error) {
    errorCode = (error && error.code) || "UNKNOWN";
  }
  try {
    fs.symlinkSync(targetDirectory, directoryLink, "junction");
    directoryJunction = true;
  } catch (error) {
    errorCode = errorCode || (error && error.code) || "UNKNOWN";
  }
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch (_) {
    cleanupCode = "LINK_CAPABILITY_CLEANUP_FAILED";
  }
  const safeErrorCode =
    errorCode && LINK_PERMISSION_CODES.has(errorCode) ? errorCode : "UNKNOWN";
  cached = Object.freeze({
    supported: !cleanupCode && (fileSymlink || directoryJunction),
    fileSymlink,
    directoryJunction,
    errorCode: cleanupCode || (errorCode ? safeErrorCode : null),
    cleanupStatus: cleanupCode ? "failed" : "passed",
  });
  return cached;
}

if (require.main === module) {
  const capability = probeLinkCapability();
  process.stdout.write(
    `link capability: file-symlink=${capability.fileSymlink ? "yes" : "no"}, directory-junction=${capability.directoryJunction ? "yes" : "no"}${capability.errorCode ? ` (${capability.errorCode})` : ""}\n`,
  );
  if (
    process.argv.includes("--strict") &&
    (!capability.fileSymlink || capability.cleanupStatus !== "passed")
  ) {
    process.stderr.write(
      "Link security tests require real file symlink capability; enable Windows Developer Mode or run with symlink permission.\n",
    );
    process.exitCode = 1;
  }
}

module.exports = { LINK_PERMISSION_CODES, probeLinkCapability };

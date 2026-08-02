"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function inside(root, filename) {
  if (!root || !filename) return true;
  const relative = path.relative(path.resolve(root), path.resolve(filename));
  return (
    relative !== ".." &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative)
  );
}
function state(filename) {
  if (!filename || !fs.existsSync(filename))
    return { exists: false, unsafe: false };
  try {
    const entry = fs.lstatSync(filename);
    return { exists: true, unsafe: !entry.isFile() || entry.isSymbolicLink() };
  } catch (_) {
    return { exists: true, unsafe: true };
  }
}
function inspectSubmissionPair(item, batch, suppliedSidecar, options) {
  const value = item || {};
  const opts = options || {};
  const file = state(value.filePath);
  const sidecarFile = state(value.sidecarPath);
  const unsafePath =
    !inside(opts.rootDir, value.filePath) ||
    !inside(opts.rootDir, value.sidecarPath) ||
    file.unsafe ||
    sidecarFile.unsafe;
  let sidecar = suppliedSidecar;
  if (sidecar === undefined && sidecarFile.exists && !sidecarFile.unsafe) {
    try {
      sidecar = JSON.parse(fs.readFileSync(value.sidecarPath, "utf8"));
    } catch (_) {
      sidecar = null;
    }
  }
  let contentMatched = null;
  if (file.exists && !file.unsafe && typeof value.contentHash === "string") {
    try {
      contentMatched =
        crypto
          .createHash("sha256")
          .update(fs.readFileSync(value.filePath))
          .digest("hex") === value.contentHash;
    } catch (_) {
      contentMatched = false;
    }
  }
  const hasBatch = !!(batch && batch.id !== undefined);
  const identityMatched =
    !file.exists && !sidecarFile.exists
      ? !!(
          item &&
          batch &&
          item.articleId !== undefined &&
          item.targetPlatformId !== undefined
        )
      : !!(
          sidecar &&
          typeof sidecar === "object" &&
          (!hasBatch || sidecar.submissionBatchId === batch.id) &&
          (!batch || !batch.clientId || sidecar.clientId === batch.clientId) &&
          (sidecar.generatedArticleId === value.articleId ||
            sidecar.articleId === value.articleId) &&
          (sidecar.targetPlatformId === value.targetPlatformId ||
            sidecar.targetPlatform === value.targetPlatformId) &&
          (value.contentHash === undefined ||
            sidecar.contentHash === value.contentHash)
        );
  const pairState = unsafePath
    ? "unsafe_path"
    : !file.exists && !sidecarFile.exists
      ? "both_absent"
      : sidecarFile.exists && !identityMatched
        ? "identity_conflict"
        : !file.exists
          ? "main_absent"
          : !sidecarFile.exists
            ? "sidecar_absent"
            : contentMatched !== true
              ? "content_changed"
              : "intact";
  return {
    pairState,
    identityMatched,
    contentMatched,
    mainExists: file.exists,
    sidecarExists: sidecarFile.exists,
    unsafePath,
    sidecar: sidecar || null,
  };
}

module.exports = { inspectSubmissionPair };

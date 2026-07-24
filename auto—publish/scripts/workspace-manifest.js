"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MANIFEST_VERSION = 1;
const CATEGORIES = ["publication", "batch", "sidecar", "order"];

function normalizeRelativePath(value) {
  return value.split(path.sep).join("/");
}

function isWithin(relativePath, directory) {
  return relativePath === directory || relativePath.startsWith(`${directory}/`);
}

function classify(relativePath) {
  const filename = path.posix.basename(relativePath);
  if (filename.endsWith(".submission.json")) return "sidecar";
  if (isWithin(relativePath, ".autopublish/submission-records/publications"))
    return "publication";
  if (
    isWithin(relativePath, ".autopublish/batches") ||
    isWithin(relativePath, ".autopublish/submission-batches") ||
    isWithin(relativePath, "data/content-generation-batches")
  )
    return "batch";
  if (filename === "submission-orders.jsonl") return "order";
  return null;
}

function sha256File(filename) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filename))
    .digest("hex");
}

function manifestError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function buildWorkspaceManifest(workspaceRoot) {
  if (typeof workspaceRoot !== "string" || workspaceRoot.trim() === "") {
    throw manifestError(
      "WORKSPACE_MANIFEST_ROOT_REQUIRED",
      "Workspace root is required",
    );
  }

  const root = path.resolve(workspaceRoot);
  let rootStat;
  try {
    rootStat = fs.lstatSync(root);
  } catch (_) {
    throw manifestError(
      "WORKSPACE_MANIFEST_ROOT_INVALID",
      "Workspace root is not a directory",
    );
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw manifestError(
      "WORKSPACE_MANIFEST_ROOT_INVALID",
      "Workspace root is not a directory",
    );
  }

  const entries = [];
  const diagnostics = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = normalizeRelativePath(
        path.relative(root, absolutePath),
      );
      if (entry.isSymbolicLink()) {
        diagnostics.push({ code: "SYMLINK_SKIPPED", relativePath });
        continue;
      }
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const category = classify(relativePath);
      if (!category) continue;
      const stat = fs.statSync(absolutePath);
      entries.push({
        category,
        relativePath,
        bytes: stat.size,
        sha256: sha256File(absolutePath),
      });
    }
  }

  visit(root);
  entries.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
  diagnostics.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );

  const categories = Object.fromEntries(
    CATEGORIES.map((category) => [category, { count: 0, bytes: 0 }]),
  );
  entries.forEach((entry) => {
    categories[entry.category].count += 1;
    categories[entry.category].bytes += entry.bytes;
  });

  return {
    manifestVersion: MANIFEST_VERSION,
    categories,
    entries,
    diagnostics,
  };
}

function main(args) {
  if (!args || args.length !== 1 || args[0] === "--help") {
    process.stderr.write(
      "Usage: node scripts/workspace-manifest.js <synthetic-or-authorized-workspace>\n",
    );
    return args && args[0] === "--help" ? 0 : 1;
  }
  try {
    process.stdout.write(
      `${JSON.stringify(buildWorkspaceManifest(args[0]), null, 2)}\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      `${error.code || "WORKSPACE_MANIFEST_FAILED"}:${error.message || "Manifest generation failed"}\n`,
    );
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { buildWorkspaceManifest, classify, main, sha256File };

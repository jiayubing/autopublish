"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_ROOTS = ["desktop", "src", path.join("media-workbench", "src")];
const LEGACY_PATHS = [
  "src/core/jobs.js",
  "src/infrastructure/publishers/legacy-adapter-publisher.js",
  "src/infrastructure/publishers/publisher-router.js",
  "scripts/cleanup-source-runtime.js",
  "desktop/services/submission/action.js",
  "desktop/services/submission/preparation.js",
  "desktop/services/submission/query.js",
  "desktop/services/submission/read-snapshot.js",
  "desktop/services/submission/submission-action.js",
  "desktop/services/submission/submission-preparation.js",
  "desktop/services/submission/submission-query.js",
  "desktop/services/submission/submission-read-snapshot.js",
  "src/platforms/media/preflight.js",
];

function absenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function sourceFilesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(target);
    return /\.(?:js|mjs|cjs|ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

function scanSourceTree(root) {
  const matches = [];
  const legacyPaths = LEGACY_PATHS.filter((relative) =>
    fs.existsSync(path.join(root, relative)),
  );
  for (const relativeRoot of SOURCE_ROOTS) {
    for (const filename of sourceFilesUnder(path.join(root, relativeRoot))) {
      const source = fs.readFileSync(filename, "utf8");
      if (source.includes("publish-log"))
        matches.push(path.relative(root, filename).replaceAll("\\", "/"));
    }
  }
  return [...new Set([...legacyPaths, ...matches])].sort();
}

function archiveEntries(resourcesPath) {
  const archive = path.join(path.resolve(resourcesPath), "app.asar");
  let entries;
  try {
    entries = asar
      .listPackage(archive)
      .map((entry) => entry.replace(/^[/\\]+/, "").replaceAll("\\", "/"));
  } catch (_) {
    throw absenceError(
      "LEGACY_ARCHIVE_UNAVAILABLE",
      "packaged archive is unavailable",
    );
  }
  return entries;
}

function scanArchive(resourcesPath) {
  const entries = archiveEntries(resourcesPath);
  return {
    checkedEntries: entries.length,
    matches: entries.filter(
      (entry) => entry.includes("publish-log") || LEGACY_PATHS.includes(entry),
    ),
    sha256: crypto
      .createHash("sha256")
      .update(entries.join("\n"))
      .digest("hex"),
  };
}

function parseArguments(argv) {
  const args = Array.from(argv || []);
  const options = {};
  while (args.length) {
    const arg = args.shift();
    if (arg === "--resources") {
      const value = args.shift();
      if (!value || value.startsWith("--"))
        throw absenceError("LEGACY_ARGUMENT_INVALID", "resources is required");
      options.resourcesPath = path.resolve(value);
    } else if (arg === "--output") {
      const value = args.shift();
      if (!value || value.startsWith("--"))
        throw absenceError("LEGACY_ARGUMENT_INVALID", "output is required");
      options.output = path.resolve(value);
    } else {
      throw absenceError("LEGACY_ARGUMENT_INVALID", "unknown option");
    }
  }
  return options;
}

function verifyLegacyAbsence(options) {
  const opts = options || {};
  const sourceMatches = scanSourceTree(ROOT);
  const archive = opts.resourcesPath
    ? scanArchive(opts.resourcesPath)
    : { checkedEntries: 0, matches: [], sha256: null };
  const status =
    sourceMatches.length === 0 && archive.matches.length === 0
      ? "PASSED"
      : "FAILED";
  const report = {
    status,
    operation: "legacy-publish-log-absence",
    sourceMatches: sourceMatches.length,
    archiveMatches: archive.matches.length,
    archiveEntries: archive.checkedEntries,
    archiveSha256: archive.sha256,
    archiveStatus: opts.resourcesPath ? status : "NOT_APPLICABLE",
  };
  const output = path.resolve(
    opts.output ||
      path.join(ROOT, "build", "evidence", "legacy-publish-log.json"),
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  if (status !== "PASSED")
    throw absenceError(
      "LEGACY_PATH_PRESENT",
      "legacy production path is present",
    );
  return report;
}

if (require.main === module) {
  try {
    process.stdout.write(
      JSON.stringify(
        verifyLegacyAbsence(parseArguments(process.argv.slice(2))),
      ) + "\n",
    );
  } catch (error) {
    process.stderr.write(
      (error.code || "LEGACY_ABSENCE_FAILED") +
        ":legacy absence verification failed\n",
    );
    process.exitCode = 1;
  }
}

module.exports = {
  LEGACY_PATHS,
  scanSourceTree,
  scanArchive,
  verifyLegacyAbsence,
  parseArguments,
};

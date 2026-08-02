"use strict";

const path = require("node:path");
const {
  verifyArtifactPackage,
} = require("../desktop/packaging/artifact-verifier");
const { runOfflineSelfTest } = require("./offline-smoke-runner");
const { smokeError } = require("./offline-smoke-runtime");
const {
  verifyStorageBoundaries,
  verifySchemaGate,
} = require("./offline-smoke-checks");

function parseArguments(argv) {
  const args = Array.from(argv || []);
  const options = {};
  let resourcesPath = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!resourcesPath && !arg.startsWith("--")) resourcesPath = arg;
    else if (["--python", "--manifest", "--application"].includes(arg)) {
      if (!args[index + 1] || args[index + 1].startsWith("--"))
        throw smokeError("OFFLINE_ARGUMENT_INVALID", arg + " requires a value");
      const key =
        arg === "--python"
          ? "pythonPath"
          : arg === "--manifest"
            ? "manifestPath"
            : "applicationPath";
      options[key] = path.resolve(args[++index]);
    } else if (arg === "--require-python") options.requirePython = true;
    else if (arg === "--static-only") options.staticOnly = true;
    else
      throw smokeError(
        "OFFLINE_ARGUMENT_INVALID",
        "Unknown offline self-test argument",
      );
  }
  if (!resourcesPath)
    throw smokeError(
      "OFFLINE_ARGUMENT_INVALID",
      "Resources directory is required",
    );
  return { resourcesPath: path.resolve(resourcesPath), options };
}

if (require.main === module) {
  try {
    const parsed = parseArguments(process.argv.slice(2));
    const result = parsed.options.staticOnly
      ? {
          ok: true,
          packageVersion: verifyArtifactPackage(
            parsed.resourcesPath,
            parsed.options,
          ).packageVersion,
        }
      : runOfflineSelfTest(parsed.resourcesPath, parsed.options);
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    process.stderr.write(
      (error.code || "OFFLINE_SELF_TEST_FAILED") +
        ":" +
        (error.message || "Offline self-test failed") +
        "\n",
    );
    process.exitCode = 1;
  }
}

module.exports = {
  runOfflineSelfTest,
  parseArguments,
  verifyStorageBoundaries,
  verifySchemaGate,
};

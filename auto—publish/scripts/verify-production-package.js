"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { runOfflineSelfTest } = require("./offline-self-test");
const {
  verifyArtifactPackage,
} = require("../desktop/packaging/artifact-verifier");

function findPackagedApplication(resourcesPath) {
  const packageRoot = path.dirname(path.resolve(resourcesPath));
  let names;
  try {
    names = fs.readdirSync(packageRoot);
  } catch (_) {
    throw Object.assign(
      new Error("Packaged application directory is unavailable"),
      { code: "PRODUCTION_PACKAGE_APPLICATION_UNAVAILABLE" },
    );
  }
  const candidates = names
    .filter((name) => path.extname(name).toLowerCase() === ".exe")
    .map((name) => path.join(packageRoot, name))
    .filter((filename) => {
      try {
        const stat = fs.lstatSync(filename);
        return stat.isFile() && !stat.isSymbolicLink();
      } catch (_) {
        return false;
      }
    });
  if (candidates.length !== 1) {
    throw Object.assign(
      new Error("Packaged application executable inventory is invalid"),
      { code: "PRODUCTION_PACKAGE_APPLICATION_INVALID" },
    );
  }
  return candidates[0];
}

function parseArguments(argv) {
  const args = Array.from(argv || []);
  const options = {};
  const resourcesPath = args.shift();
  if (!resourcesPath)
    throw Object.assign(
      new Error("Production resources directory is required"),
      { code: "PRODUCTION_PACKAGE_ARGUMENT_INVALID" },
    );
  while (args.length) {
    const arg = args.shift();
    if (arg === "--python") {
      const value = args.shift();
      if (!value || value.startsWith("--"))
        throw Object.assign(new Error("--python requires a value"), {
          code: "PRODUCTION_PACKAGE_ARGUMENT_INVALID",
        });
      options.pythonPath = path.resolve(value);
    } else if (arg === "--application") {
      const value = args.shift();
      if (!value || value.startsWith("--"))
        throw Object.assign(new Error("--application requires a value"), {
          code: "PRODUCTION_PACKAGE_ARGUMENT_INVALID",
        });
      options.applicationPath = path.resolve(value);
    } else if (arg === "--require-python") {
      options.requirePython = true;
    } else if (arg === "--static-only") {
      options.staticOnly = true;
    } else {
      throw Object.assign(new Error("Unknown production package argument"), {
        code: "PRODUCTION_PACKAGE_ARGUMENT_INVALID",
      });
    }
  }
  return { resourcesPath: path.resolve(resourcesPath), options };
}

function verifyProductionPackage(resourcesPath, options) {
  const opts = Object.assign({}, options || {});
  const verification = verifyArtifactPackage(resourcesPath, opts);
  if (opts.staticOnly) {
    return {
      ok: true,
      packageVersion: verification.packageVersion,
      workspaceSchemaVersion: verification.workspaceSchemaVersion,
      artifactCount: verification.artifacts.length,
      offline: "not_run",
    };
  }
  const offline = runOfflineSelfTest(
    resourcesPath,
    Object.assign({}, opts, {
      applicationPath:
        opts.applicationPath || findPackagedApplication(resourcesPath),
      requireApplication: true,
    }),
  );
  return {
    ok: true,
    packageVersion: verification.packageVersion,
    workspaceSchemaVersion: verification.workspaceSchemaVersion,
    artifactCount: verification.artifacts.length,
    offline: offline.checks,
  };
}

if (require.main === module) {
  try {
    const parsed = parseArguments(process.argv.slice(2));
    process.stdout.write(
      JSON.stringify(
        verifyProductionPackage(parsed.resourcesPath, parsed.options),
      ) + "\n",
    );
  } catch (error) {
    process.stderr.write(
      (error.code || "PRODUCTION_PACKAGE_VERIFY_FAILED") +
        ":Production package verification failed\n",
    );
    process.exitCode = 1;
  }
}

module.exports = {
  findPackagedApplication,
  parseArguments,
  verifyProductionPackage,
};

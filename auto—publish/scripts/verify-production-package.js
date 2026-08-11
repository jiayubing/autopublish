"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { runOfflineSelfTest } = require("./offline-self-test");
const {
  verifyRendererContractAbsence,
} = require("./verify-renderer-contract-absence");
const {
  verifyArtifactPackage,
} = require("../desktop/packaging/artifact-verifier");
const {
  packageEvidenceError,
  summarizeChecks,
  writeEvidenceReport,
} = require("./production-smoke-evidence");

const ROOT = path.resolve(__dirname, "..");

function evidenceCommand(args) {
  const values = Array.from(args || []).map((arg) => {
    const value = String(arg);
    const absolute = path.isAbsolute(value) || path.win32.isAbsolute(value);
    if (absolute) {
      const relative = path.relative(ROOT, path.resolve(value));
      if (
        relative &&
        !relative.startsWith("..") &&
        !path.isAbsolute(relative) &&
        !path.win32.isAbsolute(relative)
      )
        return relative.replaceAll("\\", "/");
      return "<absolute-path>";
    }
    if (
      /^[A-Za-z0-9_./=-]+$/.test(value) &&
      value.length <= 512 &&
      !value.split(/[\\/]/).includes("..")
    )
      return value.replaceAll("\\", "/");
    return JSON.stringify(value.replace(/[\x00-\x1f\x7f]/g, ""));
  });
  return ["node", "scripts/verify-production-package.js", ...values].join(" ");
}

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
  if (candidates.length !== 1)
    throw Object.assign(
      new Error("Packaged application executable inventory is invalid"),
      { code: "PRODUCTION_PACKAGE_APPLICATION_INVALID" },
    );
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
    if (["--python", "--application", "--output"].includes(arg)) {
      const value = args.shift();
      if (!value || value.startsWith("--"))
        throw packageEvidenceError(
          "PRODUCTION_PACKAGE_ARGUMENT_INVALID",
          arg + " requires a value",
        );
      options[
        arg === "--python"
          ? "pythonPath"
          : arg === "--application"
            ? "applicationPath"
            : "output"
      ] = path.resolve(value);
    } else if (arg === "--require-python") options.requirePython = true;
    else if (arg === "--static-only") options.staticOnly = true;
    else
      throw Object.assign(new Error("Unknown production package argument"), {
        code: "PRODUCTION_PACKAGE_ARGUMENT_INVALID",
      });
  }
  return { resourcesPath: path.resolve(resourcesPath), options };
}

function runPackagedPreloadSandbox(resourcesPath) {
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      path.join(
        __dirname,
        "..",
        "tests",
        "production-preload-sandbox.electron.test.js",
      ),
    ],
    {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        PACKAGED_RESOURCES: path.resolve(resourcesPath),
      },
      stdio: "inherit",
      windowsHide: true,
      timeout: 420000,
    },
  );
  if (result.error || result.status !== 0)
    throw Object.assign(
      new Error("Packaged preload sandbox verification failed"),
      { code: "PRODUCTION_PACKAGED_PRELOAD_FAILED", cause: result.error },
    );
  return { status: result.status, resourcesPath: path.resolve(resourcesPath) };
}

function verifyProductionPackage(resourcesPath, options) {
  const opts = Object.assign({}, options || {});
  const evidenceProvenance = opts.evidenceProvenance;
  delete opts.evidenceProvenance;
  const verification = verifyArtifactPackage(resourcesPath, opts);
  let contractAbsence;
  try {
    contractAbsence = verifyRendererContractAbsence({
      root: path.resolve(__dirname, ".."),
      resourcesPath,
    });
  } catch (error) {
    if (opts.output && error.report)
      writeEvidenceReport(
        opts.output,
        {
          ok: false,
          packageVersion: verification.packageVersion,
          workspaceSchemaVersion: verification.workspaceSchemaVersion,
          artifactCount: verification.artifacts.length,
          offline: {
            rendererContractAbsence: error.report,
            runtime: "not_run",
          },
        },
        evidenceProvenance,
      );
    throw error;
  }
  if (opts.staticOnly)
    return {
      ok: true,
      packageVersion: verification.packageVersion,
      workspaceSchemaVersion: verification.workspaceSchemaVersion,
      artifactCount: verification.artifacts.length,
      offline: {
        rendererContractAbsence: contractAbsence,
        runtime: "not_run",
      },
    };
  const offline = runOfflineSelfTest(
    resourcesPath,
    Object.assign({}, opts, {
      applicationPath:
        opts.applicationPath || findPackagedApplication(resourcesPath),
      requireApplication: true,
    }),
  );
  const packagedPreload = runPackagedPreloadSandbox(resourcesPath);
  return {
    ok: true,
    packageVersion: verification.packageVersion,
    workspaceSchemaVersion: verification.workspaceSchemaVersion,
    artifactCount: verification.artifacts.length,
    offline: {
      ...offline.checks,
      rendererContractAbsence: contractAbsence,
      packagedPreloadSandbox: packagedPreload,
    },
  };
}

if (require.main === module) {
  const startedAt = Date.now();
  const rawArguments = process.argv.slice(2);
  try {
    const parsed = parseArguments(rawArguments);
    parsed.options.evidenceProvenance = {
      root: ROOT,
      command: evidenceCommand(rawArguments),
      startedAt,
    };
    const result = verifyProductionPackage(
      parsed.resourcesPath,
      parsed.options,
    );
    if (
      parsed.options.output &&
      writeEvidenceReport(
        parsed.options.output,
        result,
        parsed.options.evidenceProvenance,
      ).status !== "PASSED"
    )
      throw packageEvidenceError(
        "PRODUCTION_PACKAGE_SMOKE_FAILED",
        "Production smoke evidence contains failed checks",
      );
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    const code =
      error &&
      typeof error.code === "string" &&
      /^PRODUCTION_PACKAGE_[A-Z0-9_]{1,72}$/.test(error.code)
        ? error.code
        : "PRODUCTION_PACKAGE_VERIFY_FAILED";
    process.stderr.write(code + ":Production package verification failed\n");
    process.exitCode = 1;
  }
}

module.exports = {
  findPackagedApplication,
  evidenceCommand,
  parseArguments,
  runPackagedPreloadSandbox,
  summarizeChecks,
  verifyProductionPackage,
  writeEvidenceReport,
};

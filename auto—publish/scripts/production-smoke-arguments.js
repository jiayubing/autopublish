"use strict";

const path = require("node:path");
const { packageEvidenceError } = require("./production-smoke-evidence");

const EVIDENCE_ROOT = path.resolve(__dirname, "..", "build", "evidence");

function resolveEvidenceOutput(candidate) {
  const output = path.resolve(candidate);
  const relative = path.relative(EVIDENCE_ROOT, output);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative)
  )
    throw packageEvidenceError(
      "PRODUCTION_PACKAGE_OUTPUT_PATH_INVALID",
      "Production package evidence output must stay within build/evidence",
    );
  return output;
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
      const key =
        arg === "--python"
          ? "pythonPath"
          : arg === "--application"
            ? "applicationPath"
            : "output";
      options[key] =
        key === "output" ? resolveEvidenceOutput(value) : path.resolve(value);
    } else if (arg === "--require-python") options.requirePython = true;
    else if (arg === "--static-only") options.staticOnly = true;
    else
      throw Object.assign(new Error("Unknown production package argument"), {
        code: "PRODUCTION_PACKAGE_ARGUMENT_INVALID",
      });
  }
  return { resourcesPath: path.resolve(resourcesPath), options };
}

module.exports = { parseArguments };

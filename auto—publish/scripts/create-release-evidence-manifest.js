"use strict";

const path = require("node:path");
const {
  REQUIRED_CHECKS,
  MANUAL_GATES,
  EVIDENCE_FIELDS,
} = require("./release-evidence-contract");
const { createReleaseEvidenceManifest } = require("./release-evidence-writer");
const {
  evidenceError,
  summarizeArtifactManifest,
  summarizeRollbackReport,
  summarizeReport,
} = require("./release-evidence-inputs");

function parseArguments(argv) {
  const args = Array.from(argv || []);
  const options = { checks: {}, manualGates: {} };
  const valueFor = (arg, name) => {
    const value = arg === name ? args.shift() : arg.slice(name.length + 1);
    if (!value)
      throw evidenceError(
        "RELEASE_EVIDENCE_ARGUMENT_INVALID",
        name + " requires a value",
      );
    return value;
  };
  while (args.length) {
    const arg = args.shift();
    const valueOption = (name) => arg === name || arg.startsWith(name + "=");
    if (valueOption("--output"))
      options.output = path.resolve(valueFor(arg, "--output"));
    else if (valueOption("--artifact-manifest"))
      options.artifactManifest = path.resolve(
        valueFor(arg, "--artifact-manifest"),
      );
    else if (valueOption("--migration-report"))
      options.migrationReport = path.resolve(
        valueFor(arg, "--migration-report"),
      );
    else if (valueOption("--auth-migration-report"))
      options.authMigrationReport = path.resolve(
        valueFor(arg, "--auth-migration-report"),
      );
    else if (valueOption("--backup-report"))
      options.backupReport = path.resolve(valueFor(arg, "--backup-report"));
    else if (valueOption("--capacity-report"))
      options.capacityReport = path.resolve(valueFor(arg, "--capacity-report"));
    else if (valueOption("--discovery-report"))
      options.discoveryReport = path.resolve(
        valueFor(arg, "--discovery-report"),
      );
    else if (valueOption("--auth-report"))
      options.authReport = path.resolve(valueFor(arg, "--auth-report"));
    else if (valueOption("--container-report"))
      options.containerReport = path.resolve(
        valueFor(arg, "--container-report"),
      );
    else if (valueOption("--offline-report"))
      options.offlineReport = path.resolve(valueFor(arg, "--offline-report"));
    else if (valueOption("--legacy-report"))
      options.legacyReport = path.resolve(valueFor(arg, "--legacy-report"));
    else if (valueOption("--rollback-package"))
      options.rollbackPackage = valueFor(arg, "--rollback-package");
    else if (valueOption("--rollback-report"))
      options.rollbackReport = path.resolve(valueFor(arg, "--rollback-report"));
    else if (valueOption("--commit"))
      options.commit = valueFor(arg, "--commit");
    else if (valueOption("--auth-schema-version"))
      options.authSchemaVersion = Number(
        valueFor(arg, "--auth-schema-version"),
      );
    else if (valueOption("--workspace-schema-version"))
      options.workspaceSchemaVersion = Number(
        valueFor(arg, "--workspace-schema-version"),
      );
    else if (valueOption("--check")) {
      const value = valueFor(arg, "--check");
      const separator = value.indexOf("=");
      if (separator < 1 || !REQUIRED_CHECKS.includes(value.slice(0, separator)))
        throw evidenceError(
          "RELEASE_EVIDENCE_ARGUMENT_INVALID",
          "Unknown required check",
        );
      options.checks[value.slice(0, separator)] = value.slice(separator + 1);
    } else if (valueOption("--manual")) {
      const value = valueFor(arg, "--manual");
      const separator = value.indexOf("=");
      if (separator < 1 || !MANUAL_GATES.includes(value.slice(0, separator)))
        throw evidenceError(
          "RELEASE_EVIDENCE_ARGUMENT_INVALID",
          "Unknown manual gate",
        );
      options.manualGates[value.slice(0, separator)] = value.slice(
        separator + 1,
      );
    } else
      throw evidenceError(
        "RELEASE_EVIDENCE_ARGUMENT_INVALID",
        "unknown release evidence option",
      );
  }
  return options;
}

if (require.main === module) {
  try {
    process.stdout.write(
      JSON.stringify(
        createReleaseEvidenceManifest(parseArguments(process.argv.slice(2))),
      ) + "\n",
    );
  } catch (error) {
    process.stderr.write(
      (error.code || "RELEASE_EVIDENCE_FAILED") +
        ":release evidence manifest failed\n",
    );
    process.exitCode = 1;
  }
}

module.exports = {
  REQUIRED_CHECKS,
  MANUAL_GATES,
  EVIDENCE_FIELDS,
  createReleaseEvidenceManifest,
  parseArguments,
  summarizeArtifactManifest,
  summarizeRollbackReport,
  summarizeReport,
};

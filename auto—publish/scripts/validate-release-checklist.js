"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  REQUIRED_CHECKS,
  MANUAL_GATES,
} = require("./create-release-evidence-manifest");

function checklistError(message) {
  const error = new Error(message);
  error.code = "RELEASE_CHECKLIST_INVALID";
  return error;
}

function validateReleaseChecklist(value, options) {
  const opts = options || {};
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.manifestVersion !== 1
  )
    throw checklistError("Release evidence manifest is invalid");
  if (
    typeof value.commit !== "string" ||
    !/^[a-f0-9]{7,64}$/i.test(value.commit)
  )
    throw checklistError("Release commit evidence is invalid");
  if (
    !value.sourceState ||
    typeof value.sourceState !== "object" ||
    Array.isArray(value.sourceState) ||
    !["CLEAN", "DIRTY", "UNKNOWN"].includes(value.sourceState.status) ||
    !/^[a-f0-9]{64}$/i.test(value.sourceState.diffSha256 || "")
  )
    throw checklistError("Release source state evidence is invalid");
  if (!value.requiredChecks || typeof value.requiredChecks !== "object")
    throw checklistError("Required checks are missing");
  REQUIRED_CHECKS.forEach((name) => {
    if (
      !value.requiredChecks[name] ||
      value.requiredChecks[name].status !== "PASSED"
    )
      throw checklistError("Required check is not passed");
  });
  if (!value.manualGates || typeof value.manualGates !== "object")
    throw checklistError("Manual release gates are missing");
  MANUAL_GATES.forEach((name) => {
    if (
      !["PASSED", "PENDING_HUMAN", "BLOCKED_RELEASE"].includes(
        value.manualGates[name],
      )
    )
      throw checklistError("Manual release gate has an invalid state");
  });
  if (
    value.releaseState !== "READY_FOR_HUMAN_RELEASE" ||
    value.sourceState.status !== "CLEAN"
  ) {
    if (!opts.allowBlocked)
      throw checklistError("Release remains blocked by a required gate");
    return { ok: true, status: "BLOCKED_RELEASE", commit: value.commit };
  }
  return { ok: true, status: "READY_FOR_HUMAN_RELEASE", commit: value.commit };
}

function validateReleaseChecklistFile(filename, options) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(path.resolve(filename), "utf8"));
  } catch (_) {
    throw checklistError("Release evidence manifest is unavailable");
  }
  return validateReleaseChecklist(value, options);
}

if (require.main === module) {
  try {
    const filename = process.argv[2];
    if (!filename)
      throw checklistError("Release evidence manifest path is required");
    process.stdout.write(
      JSON.stringify(
        validateReleaseChecklistFile(filename, {
          allowBlocked: process.argv.includes("--allow-blocked"),
        }),
      ) + "\n",
    );
  } catch (error) {
    process.stderr.write(
      (error.code || "RELEASE_CHECKLIST_INVALID") +
        ":Release checklist validation failed\n",
    );
    process.exitCode = 1;
  }
}

module.exports = { validateReleaseChecklist, validateReleaseChecklistFile };

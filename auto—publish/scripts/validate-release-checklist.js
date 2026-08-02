"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  EVIDENCE_FIELDS,
  MANUAL_GATES,
  REQUIRED_CHECKS,
  STATUSES,
} = require("./release-evidence-contract");

const ALLOWED_STATES = STATUSES;

function checklistError(message) {
  const error = new Error(message);
  error.code = "RELEASE_CHECKLIST_INVALID";
  return error;
}

function exactKeys(value, names, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw checklistError(label + " are missing");
  const actual = Object.keys(value).sort();
  const expected = [...names].sort();
  if (
    actual.length !== expected.length ||
    actual.some((name, index) => name !== expected[index])
  )
    throw checklistError(label + " names are not stable");
}

function statusOf(value, label) {
  if (typeof value === "string") {
    if (!ALLOWED_STATES.has(value))
      throw checklistError(label + " has an invalid state");
    return value;
  }
  if (!value || typeof value !== "object" || !ALLOWED_STATES.has(value.status))
    throw checklistError(label + " has an invalid state");
  return value.status;
}

function validateChecklistEntries(value, manifest, rollbackStatus) {
  if (!Array.isArray(value))
    throw checklistError("Checklist entries are invalid");
  const expected = new Map();
  REQUIRED_CHECKS.forEach((name) => {
    const status = statusOf(manifest.requiredChecks[name], name);
    expected.set(name, {
      kind: "AUTOMATED",
      status,
      state: status === "PASSED" ? "AUTOMATED_PASS" : status,
    });
  });
  EVIDENCE_FIELDS.forEach((name) => {
    const status = statusOf(manifest[name], "Evidence " + name);
    expected.set("evidence/" + name, {
      kind: "EVIDENCE",
      status,
      state: status,
    });
  });
  MANUAL_GATES.forEach((name) => {
    const status = statusOf(manifest.manualGates[name], name);
    expected.set("manual/" + name, {
      kind: "MANUAL",
      status,
      state: status,
    });
  });
  expected.set("manual/rollback-evidence", {
    kind: "MANUAL",
    status: rollbackStatus,
    state: rollbackStatus,
  });
  if (value.length !== expected.size)
    throw checklistError("Checklist entries are incomplete");
  const ids = new Set();
  value.forEach((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.id !== "string" ||
      !/^[A-Za-z0-9_./-]{1,120}$/.test(entry.id) ||
      ids.has(entry.id) ||
      typeof entry.kind !== "string" ||
      !["AUTOMATED", "EVIDENCE", "MANUAL"].includes(entry.kind) ||
      !["AUTOMATED_PASS", ...ALLOWED_STATES].includes(entry.state)
    )
      throw checklistError("Checklist entry is invalid");
    const expectedEntry = expected.get(entry.id);
    if (
      !expectedEntry ||
      expectedEntry.kind !== entry.kind ||
      expectedEntry.status !== statusOf(entry.status, "Checklist entry") ||
      expectedEntry.state !== entry.state
    )
      throw checklistError("Checklist entry disagrees with release evidence");
    ids.add(entry.id);
  });
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
  if (!value.applicationVersion || typeof value.applicationVersion !== "string")
    throw checklistError("Application version evidence is missing");
  if (
    !Number.isSafeInteger(value.authSchemaVersion) ||
    value.authSchemaVersion < 1
  )
    throw checklistError("Auth schema evidence is invalid");
  if (
    !Number.isSafeInteger(value.workspaceSchemaVersion) ||
    value.workspaceSchemaVersion < 1
  )
    throw checklistError("Workspace schema evidence is invalid");
  if (
    !value.sourceState ||
    typeof value.sourceState !== "object" ||
    Array.isArray(value.sourceState) ||
    !["CLEAN", "DIRTY", "UNKNOWN"].includes(value.sourceState.status) ||
    !/^[a-f0-9]{64}$/i.test(value.sourceState.diffSha256 || "")
  )
    throw checklistError("Release source state evidence is invalid");

  exactKeys(value.requiredChecks, REQUIRED_CHECKS, "Required check");
  const blockingChecks = REQUIRED_CHECKS.filter((name) => {
    const status = statusOf(value.requiredChecks[name], name);
    return status !== "PASSED";
  });

  exactKeys(value.manualGates, MANUAL_GATES, "Manual release gate");
  const blockingManualGates = MANUAL_GATES.filter(
    (name) => statusOf(value.manualGates[name], name) !== "PASSED",
  );

  const blockingEvidence = [];
  EVIDENCE_FIELDS.forEach((name) => {
    const status = statusOf(value[name], "Evidence " + name);
    if (status !== "PASSED") blockingEvidence.push(name);
  });

  const rollback = value.rollback || { status: "PENDING_HUMAN" };
  const rollbackStatus = statusOf(rollback, "Rollback evidence");
  const blockingRollback = rollbackStatus !== "PASSED";
  if (
    rollbackStatus === "PASSED" &&
    (!rollback ||
      typeof rollback.package !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(rollback.package) ||
      !/^[a-f0-9]{64}$/i.test(rollback.sha256 || "") ||
      typeof rollback.plan !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(rollback.plan))
  )
    throw checklistError("Passed rollback evidence is incomplete");
  validateChecklistEntries(value.checklist, value, rollbackStatus);

  if (
    !value.releaseState ||
    !["READY_FOR_HUMAN_RELEASE", "BLOCKED_RELEASE"].includes(value.releaseState)
  )
    throw checklistError("Release state is invalid");
  const blocked =
    value.releaseState !== "READY_FOR_HUMAN_RELEASE" ||
    value.sourceState.status !== "CLEAN" ||
    blockingChecks.length > 0 ||
    blockingManualGates.length > 0 ||
    blockingEvidence.length > 0 ||
    blockingRollback;
  if (
    !blocked &&
    Array.isArray(value.releaseBlockers) &&
    value.releaseBlockers.length !== 0
  )
    throw checklistError("Release blockers contradict a ready state");
  if (blocked) {
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
        ":release checklist validation failed\n",
    );
    process.exitCode = 1;
  }
}

module.exports = { validateReleaseChecklist, validateReleaseChecklistFile };

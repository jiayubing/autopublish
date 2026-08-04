"use strict";

const REQUIRED_CHECKS = Object.freeze([
  "required/root-tests",
  "required/auth-tests",
  "required/migration-roundtrip",
  "required/backup-restore-fixture",
  "required/rate-limit-capacity",
  "required/diagnostics-static",
  "required/production-directory-smoke",
  "required/test-discovery",
  "required/auth-container",
  "required/auth-migration-roundtrip",
  "required/health-semantics",
  "required/media-transport",
  "required/legacy-publish-log-absence",
  "required/toolchain",
  "required/packaging-contracts",
  "required/link-security",
  "required/phase-08-gates",
]);

const MANUAL_GATES = Object.freeze([
  "phase4-platform-account-binding",
  "phase4-hepan-reconciliation",
  "phase4-media-http-risk",
  "phase4-signed-browser-login",
  "platform-endpoints-tls",
  "proxy-source-headers",
  "signing-certificate",
  "installer-acl-upgrade-rollback",
  "external-e2e-owner",
  "auth-rpo-rto",
  "auth-backup-policy",
  "auth-recovery-drill",
]);

const EVIDENCE_FIELDS = Object.freeze([
  "migration",
  "backupRestore",
  "artifact",
  "desktopTestDiscovery",
  "authTests",
  "containerTests",
  "offlineSelfTest",
  "legacyAbsence",
]);

const STATUSES = new Set([
  "PASSED",
  "FAILED",
  "PENDING_HUMAN",
  "BLOCKED_RELEASE",
  "NOT_APPLICABLE",
  "SKIPPED",
  "SKIPPED_OPTIONAL",
]);
const VERSION_PATTERN = /^(?:v?\d+\.){2}\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const ROLLBACK_PLAN =
  "previous-signed-artifact-and-reversible-upgrade-procedure-required";

module.exports = {
  REQUIRED_CHECKS,
  MANUAL_GATES,
  EVIDENCE_FIELDS,
  STATUSES,
  VERSION_PATTERN,
  ROLLBACK_PLAN,
};

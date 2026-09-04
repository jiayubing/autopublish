"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  REQUIRED_CHECKS,
} = require("../scripts/create-release-evidence-manifest");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const workflowPath = path.join(
  repositoryRoot,
  ".github",
  "workflows",
  "ci.yml",
);

function job(source, name) {
  const lines = source.split(/\r?\n/);
  const start = lines.indexOf("  " + name + ":");
  assert.ok(start >= 0, "missing " + name + " job");
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z][A-Za-z0-9_-]*:$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function assertPushOnly(source, name) {
  assert.ok(
    source.includes("if: github.event_name == 'push'"),
    name + " must remain release-only",
  );
}

test("CI keeps product regression checks on PRs and heavy artifact checks on master", () => {
  assert.equal(fs.existsSync(workflowPath), true);
  const workflow = fs.readFileSync(workflowPath, "utf8");

  const desktop = job(workflow, "desktop");
  for (const step of [
    "required/test-discovery",
    "required/root-tests",
    "required/migration-roundtrip",
    "required/toolchain",
    "required/packaging-contracts",
  ])
    assert.ok(desktop.includes("- name: " + step), step);
  assert.ok(desktop.includes("npm run test:desktop-core"));
  assert.ok(desktop.includes("npm run pack:production:smoke"));
  assert.ok(
    desktop.includes(
      "- name: required/production-directory-smoke\n        if: github.event_name == 'push'",
    ),
  );

  const security = job(workflow, "desktop-security");
  for (const command of [
    "npm run test:media-transport",
    "npm run test:diagnostics",
    "npm run test:production-ipc-matrix",
  ])
    assert.ok(security.includes(command), command);

  for (const name of [
    "desktop-capacity",
    "desktop-artifact",
    "auth-container",
    "dependency-audit",
    "release-evidence",
  ])
    assertPushOnly(job(workflow, name), name);

  const artifact = job(workflow, "desktop-artifact");
  assert.ok(artifact.includes("npm run pack:alpha:dirty"));
  assert.ok(
    artifact.includes(
      "node scripts/verify-alpha-package.js release-alpha/win-unpacked/resources",
    ),
  );

  const evidence = job(workflow, "release-evidence");
  for (const check of REQUIRED_CHECKS)
    assert.ok(evidence.includes("--check " + check + "=PASSED"), check);

  assert.equal(workflow.includes("verify-phase-08-gates"), false);
  assert.equal(workflow.includes("verify-legacy-absence"), false);
  assert.equal(workflow.includes("legacy-publish-log-absence"), false);
  assert.equal(workflow.includes("${{ secrets."), false);
});

test("Auth compose clean-machine storage and health are readiness-safe", () => {
  const applicationRoot = path.resolve(__dirname, "..");
  const compose = fs.readFileSync(
    path.join(applicationRoot, "auth-server", "docker-compose.yml"),
    "utf8",
  );
  const dockerfile = fs.readFileSync(
    path.join(applicationRoot, "auth-server", "Dockerfile"),
    "utf8",
  );
  assert.match(compose, /autopublish-auth-data:\/data/);
  assert.doesNotMatch(compose, /\.\/data:\/data/);
  assert.match(compose, /\nvolumes:\s*\n\s+autopublish-auth-data:/);
  assert.match(dockerfile, /\/healthz\/ready/);
});

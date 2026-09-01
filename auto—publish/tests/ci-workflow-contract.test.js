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

function assertStep(source, name) {
  assert.ok(source.includes("- name: " + name), name);
}

test("root CI workflow fixes required checks, isolation, and command ownership", () => {
  assert.equal(fs.existsSync(workflowPath), true);
  assert.equal(
    fs.existsSync(
      path.join(
        repositoryRoot,
        "auto—publish",
        ".github",
        "workflows",
        "ci.yml",
      ),
    ),
    false,
  );
  const workflow = fs.readFileSync(workflowPath, "utf8");
  assert.ok(workflow.startsWith("name: CI"));
  assert.ok(workflow.includes("\njobs:"));

  const desktop = job(workflow, "desktop");
  assert.ok(desktop.includes("name: required/desktop-node24"));
  assert.ok(desktop.includes("node-version: 24"));
  assert.ok(
    desktop.includes("npm ci\n        working-directory: auto—publish"),
  );
  assert.ok(
    desktop.includes(
      "npm ci\n        working-directory: auto—publish/media-workbench",
    ),
  );
  for (const check of [
    "required/test-discovery",
    "required/root-tests",
    "required/migration-roundtrip",
    "required/toolchain",
    "required/packaging-contracts",
    "required/production-directory-smoke",
    "required/phase-08-gates",
    "required/legacy-publish-log-absence",
  ])
    assertStep(desktop, check);
  for (const command of [
    "npm run test:discover",
    "npm run test:desktop-core",
    "node scripts/create-test-suite-evidence.js",
    "desktop-migration-roundtrip.json",
    "tests/content-library-migration.test.js",
    "npm run lint",
    "npm run typecheck:renderer",
    "npm run typecheck:bridge",
    "npm run typecheck:main",
    "npm run format:check",
    "npm run build:renderer",
    "npm run build:preload",
    "npm run test:packaging",
    "npm run pack:production:smoke",
    "npm run test:phase-08:gates",
    "node scripts/verify-phase-08-gates.js --resources release-production-smoke/win-unpacked/resources --output build/evidence/phase-08-gates.json",
    "node scripts/verify-legacy-absence.js --resources release-production-smoke/win-unpacked/resources --output build/evidence/legacy-publish-log.json",
  ])
    assert.ok(desktop.includes(command), command);
  assert.equal(
    desktop.includes("- name: required/root-tests\n        run: npm test"),
    false,
  );
  assert.ok(desktop.includes("npm audit --omit=dev --audit-level=high"));
  assert.ok(desktop.includes("continue-on-error: true"));

  const auth = job(workflow, "auth");
  assert.ok(auth.includes("name: required/auth-node22"));
  assert.ok(auth.includes("node-version: 22"));
  assert.ok(
    auth.includes(
      "npm ci\n        working-directory: auto—publish/auth-server",
    ),
  );
  assert.ok(
    auth.includes(
      "run: npm test\n        working-directory: auto—publish/auth-server",
    ),
  );
  assertStep(auth, "required/auth-tests");
  assert.ok(auth.includes("create-test-summary-evidence.js --status PASSED"));

  const container = job(workflow, "auth-container");
  assert.ok(container.includes("name: required/auth-container-node22"));
  assert.ok(
    container.includes(
      "docker build --file auto—publish/auth-server/Dockerfile",
    ),
  );
  assertStep(container, "required/auth-container");
  assert.ok(container.includes("docker run --rm --network=none"));
  assert.ok(container.includes("CI_SYNTHETIC_ONLY=1"));

  const verification = job(workflow, "auth-verification");
  assert.ok(verification.includes("node-version: 22"));
  for (const check of [
    "required/auth-migration-roundtrip",
    "required/backup-restore-fixture",
    "required/health-semantics",
    "required/rate-limit-capacity",
  ])
    assertStep(verification, check);
  assert.ok(verification.includes("migration-roundtrip-evidence.js"));
  assert.ok(verification.includes("backup-restore-evidence.js"));
  assert.ok(verification.includes("run: npm run test:health"));
  assert.ok(verification.includes("run: npm run test:rate-limit"));
  assert.equal(verification.includes("test:health-rate-limit"), false);

  const security = job(workflow, "desktop-security");
  assert.ok(security.includes("name: required/desktop-security-node24"));
  assertStep(security, "required/media-transport");
  assertStep(security, "required/diagnostics-static");
  assert.ok(security.includes("npm run test:media-transport"));
  assert.ok(security.includes("npm run test:diagnostics"));
  assert.ok(security.includes("npm run test:production-ipc-matrix"));

  const capacity = job(workflow, "desktop-capacity");
  assert.ok(capacity.includes("name: required/desktop-capacity-node24"));
  assert.ok(capacity.includes("build/evidence/capacity.json"));
  assert.ok(capacity.includes("tests/phase-02-runtime-capacity.test.js"));
  assert.equal(capacity.includes("tests/phase-05-handoff-capacity.test.js"), false);

  const artifact = job(workflow, "desktop-artifact");
  assert.ok(artifact.includes("name: required/desktop-artifact-node24"));
  assertStep(artifact, "required/alpha-artifact-gates");
  assert.ok(
    artifact
      .replace(/\s+/g, " ")
      .includes(
        "node scripts/verify-legacy-absence.js --resources release-alpha/win-unpacked/resources --output build/evidence/alpha-legacy-absence.json",
      ),
  );
  assert.ok(artifact.includes("npm run pack:alpha:dirty"));

  const links = job(workflow, "link-security");
  assert.ok(links.includes("name: required/link-security"));
  assert.ok(links.includes("node-version: 24"));
  assert.ok(links.includes("run: npm run test:links"));

  const evidence = job(workflow, "release-evidence");
  assert.ok(evidence.includes("name: required/release-evidence"));
  assert.ok(
    evidence.includes(
      "needs: [desktop, desktop-capacity, desktop-artifact, auth, auth-container, auth-verification, desktop-security, link-security]",
    ),
  );
  assert.ok(evidence.includes("setup-node@v4"));
  assert.ok(evidence.includes("node-version: 24"));
  assert.ok(evidence.includes("create-release-evidence-manifest.js"));
  assert.ok(
    evidence.includes(
      "--migration-report build/evidence/desktop-migration-roundtrip.json",
    ),
  );
  assert.ok(
    evidence.includes(
      "--auth-migration-report build/evidence/migration-roundtrip.json",
    ),
  );
  assert.ok(
    evidence.includes("--capacity-report build/evidence/capacity.json"),
  );
  assert.ok(evidence.includes("name: desktop-capacity-evidence"));
  assert.ok(
    evidence.includes(
      "validate-release-checklist.js build/release-evidence-manifest.json --allow-blocked",
    ),
  );
  for (const check of REQUIRED_CHECKS)
    assert.ok(evidence.includes("--check " + check + "=PASSED"), check);

  for (const check of REQUIRED_CHECKS)
    assert.ok(workflow.includes(check), check);
  assert.equal(workflow.includes("${{ secrets."), false);
  assert.equal(workflow.includes("npm run verify"), false);
  const runner = fs.readFileSync(
    path.join(repositoryRoot, "auto—publish", "scripts", "run-tests.js"),
    "utf8",
  );
  assert.ok(runner.includes(".test.js"));
  assert.ok(runner.includes(".test.mjs"));
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

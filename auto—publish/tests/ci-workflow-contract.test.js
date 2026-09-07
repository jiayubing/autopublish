"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { collectTestFiles, parseArguments } = require("../scripts/run-tests");
const {
  REQUIRED_CHECKS,
} = require("../scripts/create-release-evidence-manifest");

const applicationRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(applicationRoot, "..");
const workflowPath = path.join(
  repositoryRoot,
  ".github",
  "workflows",
  "ci.yml",
);
const installerWorkflowPath = path.join(
  repositoryRoot,
  ".github",
  "workflows",
  "windows-installer.yml",
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(applicationRoot, "package.json"), "utf8"),
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

test("CI assigns specialized desktop tests and renderer typecheck to one ordinary owner", () => {
  const command = packageJson.scripts["test:desktop-core"].split(/\s+/);
  assert.deepEqual(command.slice(0, 2), ["node", "scripts/run-tests.js"]);
  const options = parseArguments(command.slice(2));
  assert.ok(options, "desktop core must use valid runner arguments");
  const discovered = new Set(collectTestFiles());
  const desktopFiles = new Set(collectTestFiles(options.excludedFiles));
  const workflow = fs.readFileSync(workflowPath, "utf8");
  const desktop = job(workflow, "desktop");
  const security = job(workflow, "desktop-security");

  // The npm commands own these file lists; do not copy them into the test.
  for (const name of [
    "test:packaging",
    "test:migration",
    "test:diagnostics",
    "test:media-transport",
  ]) {
    const args = packageJson.scripts[name].split(/\s+/);
    assert.deepEqual(args.slice(0, 2), ["node", "--test"], name);
    const files = args.slice(2);
    assert.ok(files.length > 0, name);
    assert.equal(new Set(files).size, files.length, name);
    for (const file of files) {
      assert.ok(discovered.has(file), name + " must select an existing test");
      assert.equal(
        desktopFiles.has(file),
        false,
        file + " has a dedicated owner",
      );
    }
    if (name === "test:migration") {
      const migrationFiles = Array.from(
        desktop.matchAll(/--test\s+(\S+)/g),
        (match) => match[1],
      );
      assert.deepEqual(migrationFiles.sort(), [...files].sort());
    } else {
      const owner = name === "test:packaging" ? desktop : security;
      assert.ok(owner.includes("npm run " + name), name);
    }
  }

  assert.equal(desktop.includes("npm run typecheck:renderer"), false);
  assert.ok(desktop.includes("npm run build:renderer"));
  assert.match(
    packageJson.scripts["build:renderer"],
    /npm --prefix media-workbench run lint && npm --prefix media-workbench run build/,
  );
});

test("Windows installer reuses successful master CI instead of rerunning desktop core", () => {
  assert.equal(fs.existsSync(installerWorkflowPath), true);
  const workflow = fs.readFileSync(installerWorkflowPath, "utf8");
  const installer = job(workflow, "installer");

  assert.ok(workflow.includes("  workflow_run:"));
  assert.ok(workflow.includes("      - CI"));
  assert.ok(workflow.includes("      - master"));
  assert.ok(workflow.includes("      - completed"));
  assert.equal(workflow.includes("  push:"), false);
  assert.ok(
    installer.includes("github.event.workflow_run.conclusion == 'success'"),
  );
  assert.ok(installer.includes("github.event.workflow_run.head_sha"));
  assert.ok(
    installer.includes(
      "- name: Run desktop core tests\n        if: github.event_name == 'workflow_dispatch'\n        run: npm run test:desktop-core",
    ),
  );
  assert.ok(
    installer.includes(
      "- name: Install Playwright Chromium\n        if: github.event_name == 'workflow_dispatch'",
    ),
  );
});

test("Auth compose clean-machine storage and health are readiness-safe", () => {
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

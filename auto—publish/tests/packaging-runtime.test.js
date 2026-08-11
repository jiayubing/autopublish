"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const asar = require("@electron/asar");
const { execFileSync } = require("node:child_process");

const {
  createPackagedRuntimeResolver,
  validateCandidate,
} = require("../src/infrastructure/runtime/packaged-runtime-resolver");
const {
  resolveMigrationCliPath,
} = require("../desktop/packaging/migration-runtime-paths");
const {
  createProductionArtifactManifest,
  DEFINITIONS,
} = require("../scripts/create-production-artifact-manifest");
const { runOfflineSelfTest } = require("../scripts/offline-self-test");
const {
  evidenceCommand,
  summarizeChecks,
  writeEvidenceReport,
} = require("../scripts/verify-production-package");
const {
  verifyArtifactPackage,
  validateManifest,
} = require("../desktop/packaging/artifact-verifier");
const {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  readWorkspaceSchemaMarker,
} = require("../desktop/workspace-schema-gate");

function write(root, relative, value) {
  const filename = path.join(root, relative);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, value, "utf8");
  return filename;
}

function hash(filename) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filename))
    .digest("hex");
}

function temporaryRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

async function makeManifestFixture() {
  const fixture = temporaryRoot("autopublish-production-fixture-");
  const root = path.join(fixture.root, "source");
  fs.mkdirSync(root, { recursive: true });
  write(
    root,
    "package.json",
    JSON.stringify({ name: "fixture", version: "9.9.9" }),
  );
  DEFINITIONS.forEach((definition) => {
    if (definition.source === "package.json") return;
    if (definition.source.endsWith("runtime-tools-manifest.json")) {
      write(
        root,
        definition.source,
        JSON.stringify({ tool: "node", nodeVersion: "v24.18.0" }),
      );
    } else if (definition.source.endsWith("@playwright/cli/package.json")) {
      write(root, definition.source, JSON.stringify({ version: "0.1.14" }));
    } else if (definition.source.endsWith("index.html")) {
      write(
        root,
        definition.source,
        "<!doctype html><html><body><script>window.fixture=true;</script></body></html>",
      );
    } else if (definition.source.endsWith("node.exe")) {
      write(root, definition.source, "fixture node runtime");
    } else {
      write(root, definition.source, definition.name + " fixture\n");
    }
    if (
      definition.versionSource &&
      !fs.existsSync(path.join(root, definition.versionSource.source))
    ) {
      write(
        root,
        definition.versionSource.source,
        definition.name === "playwright-cli"
          ? JSON.stringify({ version: "0.1.14" })
          : JSON.stringify({ tool: "node", nodeVersion: "v24.18.0" }),
      );
    }
  });
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "fixture"], {
    cwd: root,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.email", "fixture@example.test"], {
    cwd: root,
    stdio: "ignore",
  });
  execFileSync("git", ["add", "."], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "fixture"], {
    cwd: root,
    stdio: "ignore",
  });
  const manifestPath = path.join(
    root,
    "build",
    "production-artifact-manifest.json",
  );
  createProductionArtifactManifest({ root, output: manifestPath });
  fs.rmSync(path.join(root, ".git"), { recursive: true, force: true });
  const resources = path.join(root, "resources-out");
  const unpacked = path.join(resources, "app.asar.unpacked");
  fs.mkdirSync(unpacked, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  await asar.createPackage(root, path.join(resources, "app.asar"));
  manifest.artifacts
    .filter((item) => item.location !== "asar")
    .forEach((item) => {
      const source = path.join(
        root,
        DEFINITIONS.find((definition) => definition.name === item.name).source,
      );
      const destination =
        item.location === "unpacked"
          ? path.join(unpacked, item.path)
          : path.join(resources, item.path);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    });
  DEFINITIONS.filter((definition) => definition.versionSource).forEach(
    (definition) => {
      const source = path.join(root, definition.versionSource.source);
      const destination =
        definition.versionSource.location === "unpacked"
          ? path.join(unpacked, definition.versionSource.path)
          : path.join(resources, definition.versionSource.path);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    },
  );
  fs.mkdirSync(
    path.dirname(path.join(resources, "production-artifact-manifest.json")),
    { recursive: true },
  );
  fs.copyFileSync(
    manifestPath,
    path.join(resources, "production-artifact-manifest.json"),
  );
  return Object.assign(fixture, { resources, manifestPath, manifest });
}

test("packaged runtime resolver rejects ASAR paths and canonical escapes", () => {
  const fixture = temporaryRoot("autopublish-runtime-resolver-");
  try {
    const resourceRoot = path.join(fixture.root, "resources");
    fs.mkdirSync(resourceRoot, { recursive: true });
    const executable = write(resourceRoot, "tools/node/node.exe", "node");
    const resolver = createPackagedRuntimeResolver({
      packaged: true,
      resourcesPath: resourceRoot,
      appRoot: path.join(resourceRoot, "app.asar"),
    });
    const result = resolver.tryResolve({
      packagedCandidates: [executable],
      root: resourceRoot,
      executable: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.path, fs.realpathSync(executable));
    assert.throws(
      () =>
        validateCandidate(
          path.join(resourceRoot, "app.asar", "tools", "node.exe"),
          { root: resourceRoot },
        ),
      (error) => error.code === "PACKAGED_ASAR_PATH_REJECTED",
    );
    const linkFs = {
      lstatSync: () => ({
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => true,
      }),
    };
    assert.throws(
      () => validateCandidate(executable, { fs: linkFs }),
      (error) => error.code === "PACKAGED_RUNTIME_LINK_REJECTED",
    );
    const escapeFs = {
      lstatSync: (filename) => ({
        isFile: () => filename.endsWith("node.exe"),
        isDirectory: () => !filename.endsWith("node.exe"),
        isSymbolicLink: () => false,
      }),
      realpathSync: (filename) =>
        filename.endsWith("node.exe")
          ? path.join(fixture.root, "outside", "node.exe")
          : filename,
    };
    assert.throws(
      () => validateCandidate(executable, { fs: escapeFs, root: resourceRoot }),
      (error) => error.code === "PACKAGED_RUNTIME_CANONICAL_ESCAPE",
    );
  } finally {
    fixture.cleanup();
  }
});

test("workspace schema gate accepts current markers and rejects older/future markers without rewriting", () => {
  const fixture = temporaryRoot("autopublish-schema-gate-");
  try {
    const marker = path.join(fixture.root, ".autopublish-workspace.json");
    const current = {
      version: CURRENT_WORKSPACE_SCHEMA_VERSION,
      createdAt: "2026-08-01T00:00:00.000Z",
    };
    fs.writeFileSync(marker, JSON.stringify(current) + "\n", "utf8");
    const before = fs.readFileSync(marker, "utf8");
    assert.equal(readWorkspaceSchemaMarker(marker).status, "supported");
    assert.equal(fs.readFileSync(marker, "utf8"), before);
    fs.writeFileSync(
      marker,
      JSON.stringify({
        version: CURRENT_WORKSPACE_SCHEMA_VERSION + 1,
        createdAt: current.createdAt,
      }) + "\n",
      "utf8",
    );
    assert.equal(
      readWorkspaceSchemaMarker(marker).code,
      "WORKSPACE_SCHEMA_FUTURE",
    );
    fs.writeFileSync(
      marker,
      JSON.stringify({ version: 1, createdAt: current.createdAt }) + "\n",
      "utf8",
    );
    assert.equal(
      readWorkspaceSchemaMarker(marker, { currentVersion: 2 }).code,
      "WORKSPACE_SCHEMA_OLDER_UNSUPPORTED",
    );
  } finally {
    fixture.cleanup();
  }
});

test("artifact verifier validates ordinary resource files and detects tampering", async () => {
  const fixture = await makeManifestFixture();
  try {
    const verified = verifyArtifactPackage(fixture.resources);
    assert.equal(verified.packageVersion, "9.9.9");
    assert.ok(
      verified.artifacts.some(
        (item) =>
          item.name === "migration-cli" &&
          item.relativePath === "migration/migrate-content-library-v2.js",
      ),
    );
    fs.appendFileSync(
      path.join(fixture.resources, "migration/migrate-content-library-v2.js"),
      "tampered\n",
      "utf8",
    );
    assert.throws(
      () => verifyArtifactPackage(fixture.resources),
      (error) => error.code === "ARTIFACT_HASH_MISMATCH",
    );
  } finally {
    fixture.cleanup();
  }
});

test("artifact verifier rejects an incomplete required inventory", async () => {
  const fixture = await makeManifestFixture();
  try {
    const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, "utf8"));
    manifest.artifacts = manifest.artifacts.slice(1);
    assert.throws(
      () => validateManifest(manifest),
      (error) => error.code === "ARTIFACT_MANIFEST_INVENTORY_INVALID",
    );
  } finally {
    fixture.cleanup();
  }
});

test("offline self-test uses packaged paths and emits only safe relative evidence", async () => {
  const fixture = await makeManifestFixture();
  const calls = [];
  try {
    const result = runOfflineSelfTest(fixture.resources, {
      commandRunner: (file, args) => {
        calls.push({ file, args });
        return {
          status: 0,
          stdout: args.includes("--version") ? "v24.18.0\n" : "{}\n",
        };
      },
    });
    const serialized = JSON.stringify(result);
    assert.equal(result.ok, true);
    assert.equal(
      result.checks.migrationCli.path,
      "migration/migrate-content-library-v2.js",
    );
    assert.equal(result.checks.hepan.status, "SKIPPED_OPTIONAL");
    assert.equal(result.checks.storageBoundaries.cleanup.status, "passed");
    assert.doesNotMatch(
      serialized,
      new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.ok(
      calls.some((call) =>
        call.file.endsWith(path.join("tools", "node", "node.exe")),
      ),
    );
    assert.ok(
      calls.some((call) =>
        call.args.some((value) =>
          String(value).endsWith(
            path.join("migration", "migrate-content-library-v2.js"),
          ),
        ),
      ),
    );
  } finally {
    fixture.cleanup();
  }
});

test("offline self-test launches the packaged Electron executable when supplied", async () => {
  const fixture = await makeManifestFixture();
  const applicationPath = write(
    path.dirname(fixture.resources),
    "fixture.exe",
    "fixture executable",
  );
  const calls = [];
  try {
    const result = runOfflineSelfTest(fixture.resources, {
      applicationPath,
      commandRunner: (file, args) => {
        calls.push({ file, args });
        if (args.includes("--offline-packaging-smoke")) {
          return {
            status: 0,
            stdout: JSON.stringify({
              ok: true,
              checks: { main: true, preload: true, renderer: true },
            }),
          };
        }
        return {
          status: 0,
          stdout: args.includes("--version") ? "v24.18.0\n" : "{}\n",
        };
      },
    });
    assert.equal(result.checks.electronApplication.status, 0);
    assert.ok(
      calls.some((call) => call.args.includes("--offline-packaging-smoke")),
    );
  } finally {
    fixture.cleanup();
  }
});

test("production smoke evidence summarizes offline checks and rejects empty results", () => {
  const fixture = temporaryRoot("autopublish-production-evidence-");
  try {
    const output = path.join(fixture.root, "production-smoke.json");
    const passed = writeEvidenceReport(
      output,
      {
        ok: true,
        packageVersion: "1.0.1",
        workspaceSchemaVersion: 1,
        artifactCount: 13,
        offline: {
          main: { status: 0 },
          storage: { cleanup: { status: "passed" } },
        },
      },
      {
        root: path.resolve(__dirname, ".."),
        command: "node tests/packaging-runtime.test.js",
        startedAt: Date.now() - 1,
      },
    );
    assert.equal(passed.status, "PASSED");
    assert.equal(passed.checkCount, 2);
    assert.equal(passed.passed, 2);
    assert.match(passed.commit, /^[a-f0-9]{40,64}$/);
    assert.match(passed.nodeVersion, /^v\d+\.\d+\.\d+$/);
    assert.equal(passed.command, "node tests/packaging-runtime.test.js");
    assert.match(passed.startedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(passed.finishedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(typeof passed.sourceState.summary.changedEntries, "number");
    const failed = writeEvidenceReport(
      output,
      {
        ok: true,
        packageVersion: "1.0.1",
        workspaceSchemaVersion: 1,
        artifactCount: 13,
        offline: { main: { status: "FAILED" } },
      },
      {
        root: path.resolve(__dirname, ".."),
        command: "node tests/packaging-runtime.test.js",
        startedAt: Date.now() - 1,
      },
    );
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.failed, 1);
    assert.throws(
      () => summarizeChecks({}),
      (error) => error.code === "PRODUCTION_PACKAGE_CHECKS_EMPTY",
    );
  } finally {
    fixture.cleanup();
  }
});

test("production smoke evidence command keeps workspace paths relative and masks external paths", () => {
  assert.equal(
    evidenceCommand([
      path.resolve(__dirname, "..", "release-production-smoke", "resources"),
      "--output",
      path.resolve(__dirname, "..", "build", "evidence", "smoke.json"),
    ]),
    "node scripts/verify-production-package.js release-production-smoke/resources --output build/evidence/smoke.json",
  );
  assert.equal(
    evidenceCommand([path.resolve(os.tmpdir(), "external-resources")]),
    "node scripts/verify-production-package.js <absolute-path>",
  );
});

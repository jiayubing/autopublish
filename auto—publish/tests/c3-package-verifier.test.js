"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const asar = require("@electron/asar");
const {
  requiredArchiveFiles,
  verifyPackage,
} = require("../scripts/verify-alpha-package");

const C3_RUNTIME_FILES = Object.freeze([
  "desktop/services/submission-maintenance-service.js",
  "desktop/services/prepared-submission-recovery.js",
  "desktop/services/submission-target-catalog.js",
  "desktop/services/submission-item-projection.js",
  "desktop/services/submission-action-policy.js",
  "desktop/services/submission-operation-files.js",
  "desktop/services/submission-operation-staging.js",
  "desktop/services/submission-action-recovery.js",
  "desktop/services/submission-cleanup.js",
  "desktop/composition/publication-recovery-composition.js",
  "desktop/services/article-attention-query.js",
  "desktop/services/article-attention-resolver.js",
  "src/application/publication-recovery.js",
  "src/infrastructure/operational-store/operational-store.js",
]);

const C3_RETIRED_FILES = Object.freeze([
  "desktop/composition/phase-01-composition.js",
  "src/application/publication-workflow/errors.js",
  "src/application/publication-workflow/post-processing.js",
]);
const SOURCE_PLATFORM_CONFIG = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../config/platforms.json"), "utf8"),
);

function inventory(source, name) {
  const match = new RegExp(
    "const " + name + " = \\[([\\s\\S]*?)\\n\\];",
  ).exec(source);
  assert.ok(match, name + " inventory must be readable");
  return Array.from(match[1].matchAll(/"([^"]+)"/g), (item) => item[1]);
}

function writeFile(root, relative, content) {
  const filename = path.join(root, ...relative.split("/"));
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content || "fixture\n");
}

async function pack(appRoot, resources) {
  const archive = path.join(resources, "app.asar");
  await asar.createPackage(appRoot, archive);
}

async function packageFixture(verifierSource, options) {
  const value = options || {};
  const omitted = new Set(value.omitted || []);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "c3-package-verifier-"));
  const appRoot = path.join(root, "app");
  const resources = path.join(root, "resources");
  for (const relative of requiredArchiveFiles()) {
    if (!omitted.has(relative))
      writeFile(
        appRoot,
        relative,
        relative === "package.json"
          ? "{}"
          : relative === "config/platforms.json"
            ? JSON.stringify(SOURCE_PLATFORM_CONFIG)
            : null,
      );
  }
  for (const [relative, content] of Object.entries(value.contents || {}))
    writeFile(appRoot, relative, content);
  for (const relative of value.added || []) writeFile(appRoot, relative);
  for (const relative of inventory(verifierSource, "UNPACKED_FILES"))
    writeFile(path.join(resources, "app.asar.unpacked"), relative);
  for (const relative of inventory(verifierSource, "RESOURCE_FILES"))
    writeFile(resources, relative);
  await pack(appRoot, resources);
  return { resources, dispose: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function packageError(resources) {
  try {
    verifyPackage(resources);
  } catch (error) {
    return error;
  }
  assert.fail("Package verification should fail");
}

test("C3 package verifier requires named runtime files and rejects every retired workflow file", async () => {
  const projectRoot = path.resolve(__dirname, "..");
  const verifierSource = fs.readFileSync(
    path.join(projectRoot, "scripts", "verify-alpha-package.js"),
    "utf8",
  );
  const fixtures = [];
  try {
    const baseline = await packageFixture(verifierSource);
    fixtures.push(baseline);
    assert.doesNotThrow(() => verifyPackage(baseline.resources));

    const withoutRuntime = await packageFixture(verifierSource, {
      omitted: C3_RUNTIME_FILES,
    });
    fixtures.push(withoutRuntime);
    const missing = packageError(withoutRuntime.resources);
    assert.equal(missing.code, "ALPHA_PACKAGE_CONTENT_INVALID");
    for (const relative of C3_RUNTIME_FILES)
      assert.ok(
        missing.details.includes("ARCHIVE_FILE_MISSING: " + relative),
        relative,
      );

    const withRetired = await packageFixture(verifierSource, {
      added: C3_RETIRED_FILES,
    });
    fixtures.push(withRetired);
    const retired = packageError(withRetired.resources);
    assert.equal(retired.code, "ALPHA_PACKAGE_CONTENT_INVALID");
    for (const relative of C3_RETIRED_FILES)
      assert.ok(
        retired.details.includes("RETIRED_ARCHIVE_FILE_PRESENT: " + relative),
        relative,
      );
  } finally {
    fixtures.reverse().forEach((fixture) => fixture.dispose());
  }
});

test("package verifier derives enabled platform runtime requirements from the packaged config", async () => {
  const projectRoot = path.resolve(__dirname, "..");
  const verifierSource = fs.readFileSync(
    path.join(projectRoot, "scripts", "verify-alpha-package.js"),
    "utf8",
  );
  const fixtures = [];
  try {
    const enabled = SOURCE_PLATFORM_CONFIG.enabled;
    const disabledFiles = enabled.slice(1).flatMap((id) => [
      `src/platforms/${id}/definition.js`,
      `src/platforms/${id}/platform.js`,
    ]);
    const packagedSubset = await packageFixture(verifierSource, {
      omitted: disabledFiles,
      contents: {
        "config/platforms.json": JSON.stringify({ enabled: [enabled[0]] }),
      },
    });
    fixtures.push(packagedSubset);
    assert.doesNotThrow(() => verifyPackage(packagedSubset.resources));

    const missingSyntheticRuntime = await packageFixture(verifierSource, {
      contents: {
        "config/platforms.json": JSON.stringify({
          enabled: enabled.concat("reference-standard"),
        }),
      },
    });
    fixtures.push(missingSyntheticRuntime);
    const missing = packageError(missingSyntheticRuntime.resources);
    assert.equal(missing.code, "ALPHA_PACKAGE_CONTENT_INVALID");
    assert.ok(
      missing.details.includes(
        "ARCHIVE_FILE_MISSING: src/platforms/reference-standard/definition.js",
      ),
    );
    assert.ok(
      missing.details.includes(
        "ARCHIVE_FILE_MISSING: src/platforms/reference-standard/platform.js",
      ),
    );

    const invalidConfig = await packageFixture(verifierSource, {
      contents: {
        "config/platforms.json": JSON.stringify({
          enabled,
          workspaceExtension: true,
        }),
      },
    });
    fixtures.push(invalidConfig);
    const invalid = packageError(invalidConfig.resources);
    assert.equal(invalid.code, "ALPHA_PACKAGE_CONTENT_INVALID");
    assert.ok(
      invalid.details.includes(
        "ENABLED_PLATFORM_INVENTORY_INVALID: config/platforms.json",
      ),
    );

    const missingPolicy = await packageFixture(verifierSource, {
      omitted: ["desktop/security/external-links.js"],
    });
    fixtures.push(missingPolicy);
    const policy = packageError(missingPolicy.resources);
    assert.equal(policy.code, "ALPHA_PACKAGE_CONTENT_INVALID");
    assert.ok(
      policy.details.includes(
        "ARCHIVE_FILE_MISSING: desktop/security/external-links.js",
      ),
    );
  } finally {
    fixtures.reverse().forEach((fixture) => fixture.dispose());
  }
});

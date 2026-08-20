"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  parsePlatformDefinitionV1,
  parsePlatformDefinitionsV1,
} = require("../src/core/platform-definition");
const {
  loadEnabledPlatformDefinitions,
  loadPlatformModules,
  loadPlatforms,
  readEnabledPlatformIds,
} = require("../src/core/platforms");
const { setDiagnosticReporter } = require("../src/diagnostics/diagnostic-producer");
const {
  createPlatformWorkbenchService,
} = require("../desktop/services/platform-workbench-service");
const {
  createSubmissionTargetCatalog,
} = require("../desktop/services/submission-target-catalog");

function definition(id, overrides) {
  const base = {
    schemaVersion: 1,
    id,
    displayName: `Fixture ${id}`,
    publicationTargetKind: "platform",
    scanDir: id,
    capabilities: {
      regularSubmission: true,
      legacyQueueImport: false,
      loginSession: false,
      accountInspection: false,
      imagePublishing: false,
    },
    contributions: {
      settings: false,
      clientProfile: false,
      runtimeArtifacts: false,
    },
    externalHosts: [],
  };
  return Object.assign(base, overrides || {});
}

function moduleFor(input, createPlatform) {
  return { definition: input, createPlatform: createPlatform || (() => ({ regularSubmission: { preparePlatformSubmission: async () => ({}) } })) };
}

test("PlatformDefinitionV1 parses only the exact immutable schema", () => {
  const parsed = parsePlatformDefinitionV1(definition("fixture"));
  assert.equal(parsed.id, "fixture");
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.capabilities), true);
  assert.equal(Object.isFrozen(parsed.externalHosts), true);
  assert.throws(() => parsePlatformDefinitionV1(Object.assign(definition("fixture"), { extra: true })), { code: "PLATFORM_DEFINITION_UNKNOWN_FIELD" });
  assert.throws(() => parsePlatformDefinitionV1(Object.assign(definition("fixture"), { schemaVersion: 2 })), { code: "PLATFORM_DEFINITION_SCHEMA_UNSUPPORTED" });
  assert.throws(() => parsePlatformDefinitionV1(definition("../fixture")), { code: "PLATFORM_DEFINITION_ID_INVALID" });
  assert.throws(() => parsePlatformDefinitionV1(Object.assign(definition("fixture"), { displayName: "bad\u202ename" })), { code: "PLATFORM_DEFINITION_DISPLAY_NAME_INVALID" });
  assert.throws(() => parsePlatformDefinitionV1(Object.assign(definition("fixture"), { scanDir: "fixture/path" })), { code: "PLATFORM_DEFINITION_SCAN_DIR_INVALID" });
  assert.throws(() => parsePlatformDefinitionV1(Object.assign(definition("fixture"), { externalHosts: ["https://example.com/path"] })), { code: "PLATFORM_DEFINITION_EXTERNAL_HOST_INVALID" });
});

test("definition sets reject duplicates and invalid capability invariants", () => {
  assert.throws(() => parsePlatformDefinitionsV1([definition("fixture"), definition("fixture")]), { code: "PLATFORM_DEFINITION_ID_DUPLICATE" });
  assert.throws(() => parsePlatformDefinitionV1(definition("fixture", { capabilities: { regularSubmission: false, legacyQueueImport: false, loginSession: false, accountInspection: false, imagePublishing: true } })), { code: "PLATFORM_DEFINITION_INVARIANT_VIOLATION" });
  assert.throws(() => parsePlatformDefinitionV1(definition("resource-fixture", { publicationTargetKind: "resource" })), { code: "PLATFORM_DEFINITION_INVARIANT_VIOLATION" });
});

test("loader exposes only declared exact ports and isolates each runtime", async () => {
  let nextRuntime = 0;
  const fixture = moduleFor(definition("fixture"), () => {
    const runtime = ++nextRuntime;
    return { regularSubmission: { preparePlatformSubmission: async () => runtime } };
  });
  const one = loadPlatformModules({ platformModules: [fixture], enabledIds: ["fixture"] })[0];
  const two = loadPlatformModules({ platformModules: [fixture], enabledIds: ["fixture"] })[0];
  assert.deepEqual(Object.keys(one), ["definition", "submissionDirectoryEntry", "regularSubmission"]);
  assert.equal(await one.regularSubmission.preparePlatformSubmission(), 1);
  assert.equal(await two.regularSubmission.preparePlatformSubmission(), 2);
  assert.equal(one.legacyQueue, undefined);
  assert.equal(Object.hasOwn(one, "legacyQueue"), false);
  assert.equal(Object.isFrozen(one.regularSubmission), true);
});

test("missing, undeclared, and malformed ports fail closed without hiding a valid platform", () => {
  const diagnostics = [];
  const restore = setDiagnosticReporter((record) => { diagnostics.push(record); return true; });
  try {
    const loaded = loadPlatformModules({
      platformModules: [
        moduleFor(definition("missing"), () => ({})),
        moduleFor(definition("undeclared", { capabilities: { regularSubmission: false, legacyQueueImport: false, loginSession: false, accountInspection: false, imagePublishing: false } })),
        moduleFor(definition("undefined-port", { capabilities: { regularSubmission: false, legacyQueueImport: false, loginSession: false, accountInspection: false, imagePublishing: false } }), () => ({ regularSubmission: undefined })),
        moduleFor(definition("extra"), () => ({ regularSubmission: { preparePlatformSubmission: async () => ({}), extra: () => undefined } })),
        moduleFor(definition("valid")),
      ],
      enabledIds: ["missing", "undeclared", "undefined-port", "extra", "valid"],
    });
    assert.deepEqual(loaded.map((platform) => platform.definition.id), ["valid"]);
    assert.deepEqual(diagnostics.map((record) => record.code).sort(), ["PLATFORM_PORT_INVALID", "PLATFORM_PORT_REQUIRED", "PLATFORM_PORT_UNDECLARED", "PLATFORM_PORT_UNDECLARED"].sort());
    assert.equal(JSON.stringify(diagnostics).includes("preparePlatformSubmission"), false);
  } finally {
    restore();
  }
});

test("a missing enabled built-in module is quarantined without hiding another valid platform", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "platform-module-load-"));
  const diagnostics = [];
  const restore = setDiagnosticReporter((record) => { diagnostics.push(record); return true; });
  try {
    const configPath = path.join(root, "platforms.json");
    fs.writeFileSync(configPath, JSON.stringify({ enabled: ["missing-module", "toutiao"] }), "utf8");
    const loaded = loadPlatformModules({ configPath });
    assert.deepEqual(loaded.map((platform) => platform.definition.id), ["toutiao"]);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].code, "PLATFORM_MODULE_LOAD_FAILED");
    assert.deepEqual(diagnostics[0].metadata, { action: "module-load", platformId: "missing-module" });
  } finally {
    restore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("loader quarantines every module that shares a duplicate platform id", () => {
  const diagnostics = [];
  const restore = setDiagnosticReporter((record) => { diagnostics.push(record); return true; });
  try {
    const loaded = loadPlatformModules({
      platformModules: [
        moduleFor(definition("duplicate")),
        moduleFor(definition("duplicate")),
        moduleFor(definition("valid")),
      ],
      enabledIds: ["duplicate", "valid"],
    });
    assert.deepEqual(loaded.map((platform) => platform.definition.id), ["valid"]);
    assert.equal(diagnostics.filter((record) => record.code === "PLATFORM_DEFINITION_ID_DUPLICATE").length, 1);
  } finally {
    restore();
  }
});

test("loader quarantines every enabled platform that shares a scan directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "platform-scan-dir-"));
  const diagnostics = [];
  const restore = setDiagnosticReporter((record) => { diagnostics.push(record); return true; });
  try {
    const loaded = loadPlatformModules({
      platformModules: [
        moduleFor(definition("alpha", { scanDir: "shared" })),
        moduleFor(definition("beta", { scanDir: "shared" })),
        moduleFor(definition("valid")),
      ],
      enabledIds: ["alpha", "beta", "valid"],
    });
    assert.deepEqual(loaded.map((platform) => platform.definition.id), ["valid"]);
    assert.equal(diagnostics.filter((record) => record.code === "PLATFORM_DEFINITION_SCAN_DIR_DUPLICATE").length, 1);

    const workbench = createPlatformWorkbenchService({
      rootDir: root,
      platforms: loaded.map((platform) => platform.submissionDirectoryEntry),
    });
    assert.deepEqual(workbench.scanQueue().map((group) => group.platformId), ["valid"]);
  } finally {
    restore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("enabled definition security projection rejects folder identity mismatches and duplicate identities", () => {
  const definitionPaths = ["toutiao", "lieju"].map((id) =>
    require.resolve(`../src/platforms/${id}/definition`),
  );
  const originals = definitionPaths.map((filename) => require.cache[filename]);
  const diagnostics = [];
  const restore = setDiagnosticReporter((record) => { diagnostics.push(record); return true; });
  try {
    require.cache[definitionPaths[0]] = {
      id: definitionPaths[0],
      filename: definitionPaths[0],
      loaded: true,
      exports: definition("lieju", {
        scanDir: "shared",
        externalHosts: ["unexpected.example"],
      }),
    };
    require.cache[definitionPaths[1]] = {
      id: definitionPaths[1],
      filename: definitionPaths[1],
      loaded: true,
      exports: definition("lieju", {
        scanDir: "shared",
        externalHosts: ["duplicate.example"],
      }),
    };

    const definitions = loadEnabledPlatformDefinitions({
      enabledIds: ["toutiao", "lieju", "hepan"],
    });
    const { createExternalLinkPolicy } = require("../desktop/security/external-links");
    const policy = createExternalLinkPolicy({ definitions });

    assert.deepEqual(definitions.map((item) => item.id), ["hepan"]);
    assert.equal(policy.hosts.includes("unexpected.example"), false);
    assert.equal(policy.hosts.includes("duplicate.example"), false);
    assert.equal(diagnostics.some((record) => record.code === "PLATFORM_DEFINITION_ID_MISMATCH"), true);
    assert.equal(diagnostics.some((record) => record.code === "PLATFORM_DEFINITION_ID_DUPLICATE"), true);
    assert.equal(diagnostics.some((record) => record.code === "PLATFORM_DEFINITION_SCAN_DIR_DUPLICATE"), true);
  } finally {
    restore();
    definitionPaths.forEach((filename, index) => {
      if (originals[index]) require.cache[filename] = originals[index];
      else delete require.cache[filename];
    });
  }
});

test("built-in projections and enabled filtering match the frozen four-platform matrix", () => {
  const loaded = loadPlatforms();
  const matrix = Object.fromEntries(loaded.map((platform) => [platform.definition.id, {
    displayName: platform.definition.displayName,
    kind: platform.definition.publicationTargetKind,
    regular: Boolean(platform.regularSubmission),
    legacy: Boolean(platform.legacyQueue),
    login: Boolean(platform.loginSession),
    inspect: Boolean(platform.accountInspection),
    image: platform.definition.capabilities.imagePublishing,
  }]));
  assert.deepEqual(matrix, {
    lieju: { displayName: "列举网", kind: "platform", regular: true, legacy: false, login: true, inspect: true, image: true },
    toutiao: { displayName: "头条", kind: "platform", regular: false, legacy: true, login: true, inspect: true, image: false },
    hepan: { displayName: "蓝色河畔", kind: "platform", regular: true, legacy: true, login: false, inspect: true, image: false },
    media: { displayName: "付费媒体", kind: "resource", regular: false, legacy: false, login: false, inspect: false, image: false },
  });
  assert.deepEqual(loadPlatforms({ platformIds: ["lieju"] }).map((platform) => platform.definition.id), ["lieju"]);
  assert.equal(Array.isArray(loadPlatforms({ platformIds: ["toutiao"] })[0].legacyQueue.scan()), true);
  assert.equal(createSubmissionTargetCatalog().find("toutiao"), null);
  assert.deepEqual(createSubmissionTargetCatalog().list().map((platform) => platform.id), ["lieju", "hepan"]);
});

test("built-in optional contributions stay platform-owned and exact", async () => {
  const loaded = loadPlatforms({
    runtimeContext: {
      workspacePaths: { tmp: path.join(os.tmpdir(), "platform-contribution-runtime") },
      getPlatformSettingsService: () => ({
        test: async () => ({ ok: false }),
        getAdapterForRuntime: () => { throw Object.assign(new Error("not configured"), { code: "PLATFORM_CONFIG_NOT_SET" }); },
      }),
    },
  });
  const byId = Object.fromEntries(loaded.map((platform) => [platform.definition.id, platform]));
  assert.equal(byId.hepan.settingsContribution.createSettingsAdapter({}).id, "hepan");
  assert.equal(byId.media.settingsContribution.createSettingsAdapter({}).id, "media");
  assert.equal(byId.media.regularSubmission, undefined);

  const reads = [];
  const reader = byId.lieju.clientProfileContribution.createProfileReader({
    read(input) {
      reads.push(input);
      return { city: "北京", contact: "合成联系人", phone: "010-12345678" };
    },
  });
  assert.deepEqual(reader.read({ clientId: "client-a" }), {
    city: "北京",
    contact: "合成联系人",
    phone: "010-12345678",
  });
  assert.deepEqual(reads, [{ clientId: "client-a", profileKey: "lieju" }]);
  assert.deepEqual(byId.lieju.clientProfileContribution.requirement, {
    profileKey: "lieju",
    requiredFields: ["city", "contact", "phone"],
  });
});

test("settings contributions cannot impersonate another platform adapter", () => {
  const fixture = moduleFor(
    definition("settings-fixture", {
      capabilities: { regularSubmission: false, legacyQueueImport: false, loginSession: false, accountInspection: false, imagePublishing: false },
      contributions: { settings: true, clientProfile: false, runtimeArtifacts: false },
    }),
    () => ({ settingsContribution: { createSettingsAdapter: () => ({ id: "media" }) } }),
  );
  const loaded = loadPlatformModules({ platformModules: [fixture], enabledIds: ["settings-fixture"] });
  assert.throws(() => loaded[0].settingsContribution.createSettingsAdapter({}), { code: "PLATFORM_PORT_INVALID" });
});

test("shared composition and worker boundaries contain no special-platform branch", () => {
  [
    "desktop/composition/workspace-runtime-composition.js",
    "desktop/services/desktop-task-service.js",
    "desktop/worker/run-task.js",
  ].forEach(function (filename) {
    const source = fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
    assert.equal(/(?:^|[^A-Za-z0-9_-])(hepan|lieju)(?:$|[^A-Za-z0-9_-])/iu.test(source), false, filename);
  });
  assert.equal(fs.existsSync(path.join(__dirname, "..", "desktop/services/platform-account-runtime.js")), false);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "desktop/services/hepan-regular-preparation-adapter.js")), false);
});

test("enabled code-owned definitions drive runtime discovery and required package entries", () => {
  const ids = readEnabledPlatformIds();
  const definitions = loadEnabledPlatformDefinitions();
  assert.deepEqual(definitions.map((item) => item.id), ids);
  ids.forEach(function (id) {
    assert.equal(fs.existsSync(path.join(__dirname, "..", "src", "platforms", id, "definition.js")), true);
    assert.equal(fs.existsSync(path.join(__dirname, "..", "src", "platforms", id, "platform.js")), true);
  });

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "platform-config-"));
  try {
    const configPath = path.join(root, "platforms.json");
    fs.writeFileSync(configPath, JSON.stringify({ enabled: ["../unsafe"] }), "utf8");
    assert.throws(() => readEnabledPlatformIds({ configPath }), { code: "PLATFORM_MODULE_LOAD_FAILED" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("disabled modules are packaged as code but never executed", () => {
  let executed = false;
  const fixture = moduleFor(definition("disabled"), () => { executed = true; return { regularSubmission: { preparePlatformSubmission: async () => ({}) } }; });
  const loaded = loadPlatformModules({ platformModules: [fixture, moduleFor(definition("enabled"))], enabledIds: ["enabled"] });
  assert.deepEqual(loaded.map((platform) => platform.definition.id), ["enabled"]);
  assert.equal(executed, false);
  for (const id of ["lieju", "toutiao", "hepan", "media"]) {
    assert.equal(typeof require(`../src/platforms/${id}/definition`).id, "string");
    assert.equal(typeof require(`../src/platforms/${id}/platform`).createPlatform, "function");
    assert.equal(Object.hasOwn(require(`../src/platforms/${id}/adapter`), "id"), false);
  }
});

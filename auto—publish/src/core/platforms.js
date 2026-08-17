const fs = require("node:fs");
const path = require("node:path");
const { reportDiagnostic } = require("../diagnostics/diagnostic-producer");
const { parsePlatformDefinitionV1, platformError } = require("./platform-definition");

function configPath() {
  return path.resolve(__dirname, "../../config/platforms.json");
}

function readEnabledPlatformIds(options) {
  const values = options || {};
  let source;
  if (Array.isArray(values.enabledIds)) source = values.enabledIds;
  else {
    const configured = JSON.parse(
      fs.readFileSync(values.configPath || configPath(), "utf8"),
    );
    if (
      !configured ||
      typeof configured !== "object" ||
      Array.isArray(configured) ||
      Object.keys(configured).length !== 1 ||
      !Object.hasOwn(configured, "enabled")
    )
      throw platformError("PLATFORM_MODULE_LOAD_FAILED");
    source = configured.enabled;
  }
  if (
    !Array.isArray(source) ||
    source.length === 0 ||
    source.some((id) => typeof id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(id)) ||
    new Set(source).size !== source.length
  )
    throw platformError("PLATFORM_MODULE_LOAD_FAILED");
  return Object.freeze(source.slice());
}

const PORT_SPECS = Object.freeze({
  regularSubmission: Object.freeze(["preparePlatformSubmission"]),
  legacyQueue: Object.freeze(["scan", "parse", "publish", "close"]),
  loginSession: Object.freeze(["open", "check", "save", "close"]),
  accountInspection: Object.freeze(["prepare", "inspect"]),
  settingsContribution: Object.freeze(["createSettingsAdapter"]),
  clientProfileContribution: Object.freeze(["requirement", "createProfileReader"]),
  runtimeArtifactContribution: Object.freeze(["describe"]),
});
const DECLARATIONS = Object.freeze([
  ["capabilities", "regularSubmission", "regularSubmission"],
  ["capabilities", "legacyQueueImport", "legacyQueue"],
  ["capabilities", "loginSession", "loginSession"],
  ["capabilities", "accountInspection", "accountInspection"],
  ["contributions", "settings", "settingsContribution"],
  ["contributions", "clientProfile", "clientProfileContribution"],
  ["contributions", "runtimeArtifacts", "runtimeArtifactContribution"],
]);
const PORT_NAMES = Object.freeze(Object.keys(PORT_SPECS));
const BUILTIN_MODULE_LOAD_FAILED = Symbol("BUILTIN_MODULE_LOAD_FAILED");

function imagePublishingCapability(platform) {
  return Object.freeze({ supported: Boolean(platform && platform.definition && platform.definition.capabilities.imagePublishing) });
}

function exactPort(port, portName, platformId) {
  if (!port || typeof port !== "object" || Array.isArray(port)) throw platformError("PLATFORM_PORT_REQUIRED", { platformId, port: portName });
  const expected = PORT_SPECS[portName].slice().sort();
  const actual = Object.keys(port).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw platformError("PLATFORM_PORT_INVALID", { platformId, port: portName });
  PORT_SPECS[portName].forEach(function (key) {
    if (!(portName === "clientProfileContribution" && key === "requirement") && typeof port[key] !== "function") throw platformError("PLATFORM_PORT_INVALID", { platformId, port: portName });
  });
  const normalized = Object.assign({}, port);
  if (portName === "clientProfileContribution") {
    const requirement = port.requirement;
    if (!requirement || typeof requirement !== "object" || Array.isArray(requirement) || Object.keys(requirement).sort().join(",") !== "profileKey,requiredFields" || typeof requirement.profileKey !== "string" || !/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(requirement.profileKey) || !Array.isArray(requirement.requiredFields) || requirement.requiredFields.length === 0 || requirement.requiredFields.some((field) => typeof field !== "string" || !/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(field)) || new Set(requirement.requiredFields).size !== requirement.requiredFields.length)
      throw platformError("PLATFORM_PORT_INVALID", { platformId, port: portName });
    normalized.requirement = Object.freeze({ profileKey: requirement.profileKey, requiredFields: Object.freeze(requirement.requiredFields.slice()) });
  }
  if (portName === "runtimeArtifactContribution") {
    let projection;
    try { projection = port.describe(); } catch (_) { throw platformError("PLATFORM_PORT_INVALID", { platformId, port: portName }); }
    if (!projection || typeof projection !== "object" || Array.isArray(projection) || Object.keys(projection).sort().join(",") !== "platformId,requirements" || projection.platformId !== platformId || !Array.isArray(projection.requirements))
      throw platformError("PLATFORM_PORT_INVALID", { platformId, port: portName });
    const requirements = projection.requirements.map(function (item) {
      if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).sort().join(",") !== "artifactId,kind,packagedPath,required,smokeCheck" || typeof item.artifactId !== "string" || !/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(item.artifactId) || !["file", "directory-sentinel"].includes(item.kind) || typeof item.packagedPath !== "string" || item.packagedPath.includes("\\") || item.packagedPath.startsWith("/") || item.packagedPath.split("/").includes("..") || /[*?\[\]{}]/.test(item.packagedPath) || !(item.packagedPath.startsWith(`src/platforms/${platformId}/`) || item.packagedPath.startsWith(`resources/${platformId}/`) || item.packagedPath.startsWith("runtime-tools/")) || typeof item.required !== "boolean" || typeof item.smokeCheck !== "string" || !/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(item.smokeCheck))
        throw platformError("PLATFORM_PORT_INVALID", { platformId, port: portName });
      return Object.freeze(Object.assign({}, item));
    });
    const frozenProjection = Object.freeze({ platformId, requirements: Object.freeze(requirements) });
    normalized.describe = function () { return frozenProjection; };
  }
  if (portName === "settingsContribution") {
    const createSettingsAdapter = port.createSettingsAdapter;
    normalized.createSettingsAdapter = function (context) {
      const adapter = createSettingsAdapter(context);
      if (!adapter || typeof adapter !== "object" || Array.isArray(adapter) || adapter.id !== platformId)
        throw platformError("PLATFORM_PORT_INVALID", { platformId, port: portName });
      return adapter;
    };
  }
  return Object.freeze(normalized);
}

function safeDiagnostic(error, fallbackPlatformId, action) {
  const metadata = (error && error.metadata) || {};
  const platformId = typeof metadata.platformId === "string" ? metadata.platformId : fallbackPlatformId;
  const safeMetadata = { action };
  if (/^[a-z][a-z0-9-]{0,63}$/.test(platformId || "")) safeMetadata.platformId = platformId;
  ["schemaVersion", "capability", "port"].forEach(function (key) {
    const value = metadata[key];
    if ((key === "schemaVersion" && Number.isInteger(value)) || (typeof value === "string" && /^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(value))) safeMetadata[key] = value;
  });
  reportDiagnostic({ code: error && /^PLATFORM_[A-Z0-9_]+$/.test(error.code || "") ? error.code : "PLATFORM_MODULE_LOAD_FAILED", module: "core-platforms", category: "validation", operationId: "platform-loader", metadata: safeMetadata });
}

function normalizePlatformModule(moduleValue, definition, runtimeContext) {
  if (!moduleValue || typeof moduleValue !== "object" || Object.keys(moduleValue).some((key) => key !== "definition" && key !== "createPlatform") || typeof moduleValue.createPlatform !== "function") throw platformError("PLATFORM_MODULE_LOAD_FAILED", { platformId: definition.id });
  const raw = moduleValue.createPlatform(runtimeContext || {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw platformError("PLATFORM_MODULE_LOAD_FAILED", { platformId: definition.id });
  Object.keys(raw).forEach(function (key) {
    if (!PORT_NAMES.includes(key)) throw platformError("PLATFORM_PORT_UNDECLARED", { platformId: definition.id, port: key });
  });
  const loaded = { definition, submissionDirectoryEntry: Object.freeze({ id: definition.id, displayName: definition.displayName, publicationTargetKind: definition.publicationTargetKind, scanDir: definition.scanDir, imagePublishing: definition.capabilities.imagePublishing }) };
  DECLARATIONS.forEach(function (entry) {
    const declared = definition[entry[0]][entry[1]];
    const portName = entry[2];
    if (!declared && Object.hasOwn(raw, portName)) throw platformError("PLATFORM_PORT_UNDECLARED", { platformId: definition.id, capability: entry[1], port: portName });
    if (declared) loaded[portName] = exactPort(raw[portName], portName, definition.id);
  });
  return Object.freeze(loaded);
}

function builtinPlatformModules(enabledIds) {
  return enabledIds.map(function (platformId) {
    try {
      return require(path.resolve(__dirname, "../platforms", platformId, "platform"));
    } catch (error) {
      safeDiagnostic(error, platformId, "module-load");
      return BUILTIN_MODULE_LOAD_FAILED;
    }
  });
}

function duplicateDefinitionValues(definitions, key, include) {
  const seen = new Set();
  const duplicates = new Set();
  definitions.forEach(function (definition) {
    if (!definition || (include && !include(definition))) return;
    const value = definition[key];
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return duplicates;
}

function reportDefinitionConflicts(definitions, include) {
  const duplicateIds = duplicateDefinitionValues(definitions, "id", include);
  const duplicateScanDirs = duplicateDefinitionValues(definitions, "scanDir", include);
  duplicateIds.forEach(function (platformId) {
    safeDiagnostic(
      platformError("PLATFORM_DEFINITION_ID_DUPLICATE", { platformId }),
      platformId,
      "definition-parse",
    );
  });
  duplicateScanDirs.forEach(function (scanDir) {
    const definition = definitions.find(function (item) {
      return item && (!include || include(item)) && item.scanDir === scanDir;
    });
    safeDiagnostic(
      platformError("PLATFORM_DEFINITION_SCAN_DIR_DUPLICATE", {
        platformId: definition && definition.id,
      }),
      definition && definition.id,
      "definition-parse",
    );
  });
  return { duplicateIds, duplicateScanDirs };
}

function loadEnabledPlatformDefinitions(options) {
  const enabledIds = readEnabledPlatformIds(options);
  const parsed = enabledIds.map(function (platformId) {
    try {
      return parsePlatformDefinitionV1(
        require(path.resolve(__dirname, "../platforms", platformId, "definition")),
      );
    } catch (error) {
      safeDiagnostic(error, platformId, "definition-load");
      return null;
    }
  });
  const conflicts = reportDefinitionConflicts(parsed);
  const definitions = parsed.filter(function (definition, index) {
    if (!definition) return false;
    const expectedPlatformId = enabledIds[index];
    if (definition.id !== expectedPlatformId) {
      safeDiagnostic(
        platformError("PLATFORM_DEFINITION_ID_MISMATCH", {
          platformId: expectedPlatformId,
        }),
        expectedPlatformId,
        "definition-parse",
      );
      return false;
    }
    return (
      !conflicts.duplicateIds.has(definition.id) &&
      !conflicts.duplicateScanDirs.has(definition.scanDir)
    );
  });
  if (definitions.length === 0) throw platformError("PLATFORM_MODULE_LOAD_FAILED");
  return Object.freeze(definitions);
}

function loadPlatformModules(options) {
  var opts = options || {};
  const enabledIds = readEnabledPlatformIds(opts);
  const usesBuiltinModules = !Array.isArray(opts.platformModules);
  const modules = usesBuiltinModules ? builtinPlatformModules(enabledIds) : opts.platformModules.slice();
  const enabled = new Set(enabledIds);
  const selected = Array.isArray(opts.platformIds) ? new Set(opts.platformIds) : null;
  const definitions = [];
  modules.forEach(function (moduleValue, index) {
    if (moduleValue === BUILTIN_MODULE_LOAD_FAILED) {
      definitions[index] = null;
      return;
    }
    try {
      const definition = parsePlatformDefinitionV1(moduleValue && moduleValue.definition);
      definitions[index] = definition;
    } catch (error) {
      safeDiagnostic(error, null, "definition-parse");
      definitions[index] = null;
    }
  });
  const conflicts = reportDefinitionConflicts(definitions, function (definition) {
    return enabled.has(definition.id);
  });
  const platforms = [];
  modules.forEach(function (moduleValue, index) {
    const definition = definitions[index];
    if (!definition) return;
    if (usesBuiltinModules && definition.id !== enabledIds[index]) {
      safeDiagnostic(
        platformError("PLATFORM_DEFINITION_ID_MISMATCH", {
          platformId: enabledIds[index],
        }),
        enabledIds[index],
        "definition-parse",
      );
      return;
    }
    if (
      conflicts.duplicateIds.has(definition.id) ||
      conflicts.duplicateScanDirs.has(definition.scanDir)
    ) return;
    if (!enabled.has(definition.id) || (selected && !selected.has(definition.id))) return;
    try { platforms.push(normalizePlatformModule(moduleValue, definition, opts.runtimeContext)); }
    catch (error) { safeDiagnostic(error, definition.id, "load"); }
  });
  if (platforms.length === 0) throw platformError("PLATFORM_MODULE_LOAD_FAILED");
  return Object.freeze(platforms);
}

function loadPlatforms(options) { return loadPlatformModules(options); }

module.exports = {
  loadPlatforms,
  loadPlatformModules,
  loadEnabledPlatformDefinitions,
  readEnabledPlatformIds,
  normalizePlatformModule,
  imagePublishingCapability,
};

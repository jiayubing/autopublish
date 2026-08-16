"use strict";

const TOP_LEVEL_KEYS = Object.freeze(["schemaVersion", "id", "displayName", "publicationTargetKind", "scanDir", "capabilities", "contributions", "externalHosts"]);
const CAPABILITY_KEYS = Object.freeze(["regularSubmission", "legacyQueueImport", "loginSession", "accountInspection", "imagePublishing"]);
const CONTRIBUTION_KEYS = Object.freeze(["settings", "clientProfile", "runtimeArtifacts"]);
const SAFE_SEGMENT = /^[a-z][a-z0-9-]{0,63}$/;
const SAFE_HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const UNSAFE_DISPLAY = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;

function platformError(code, metadata) {
  const error = new Error(code);
  error.code = code;
  error.metadata = Object.freeze(Object.assign({}, metadata || {}));
  return error;
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expected, code, metadata) {
  if (!plainObject(value)) throw platformError(code, metadata);
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    const hasUnknown = actual.some((key) => !wanted.includes(key));
    throw platformError(hasUnknown ? "PLATFORM_DEFINITION_UNKNOWN_FIELD" : code, metadata);
  }
}

function parseBooleanMap(value, keys, code, platformId) {
  assertExactKeys(value, keys, code, { platformId });
  const parsed = {};
  keys.forEach(function (key) {
    if (typeof value[key] !== "boolean") throw platformError(code, { platformId, capability: key });
    parsed[key] = value[key];
  });
  return Object.freeze(parsed);
}

function parsePlatformDefinitionV1(input) {
  assertExactKeys(input, TOP_LEVEL_KEYS, "PLATFORM_DEFINITION_UNKNOWN_FIELD");
  if (input.schemaVersion !== 1) throw platformError("PLATFORM_DEFINITION_SCHEMA_UNSUPPORTED", { schemaVersion: input.schemaVersion });
  if (typeof input.id !== "string" || !SAFE_SEGMENT.test(input.id)) throw platformError("PLATFORM_DEFINITION_ID_INVALID");
  const platformId = input.id;
  if (typeof input.displayName !== "string" || input.displayName !== input.displayName.trim() || input.displayName.length < 1 || [...input.displayName].length > 80 || UNSAFE_DISPLAY.test(input.displayName))
    throw platformError("PLATFORM_DEFINITION_DISPLAY_NAME_INVALID", { platformId });
  if (!["platform", "resource"].includes(input.publicationTargetKind)) throw platformError("PLATFORM_DEFINITION_TARGET_KIND_INVALID", { platformId });
  if (typeof input.scanDir !== "string" || !SAFE_SEGMENT.test(input.scanDir)) throw platformError("PLATFORM_DEFINITION_SCAN_DIR_INVALID", { platformId });
  const capabilities = parseBooleanMap(input.capabilities, CAPABILITY_KEYS, "PLATFORM_DEFINITION_CAPABILITIES_INVALID", platformId);
  const contributions = parseBooleanMap(input.contributions, CONTRIBUTION_KEYS, "PLATFORM_DEFINITION_CONTRIBUTIONS_INVALID", platformId);
  if (!Array.isArray(input.externalHosts)) throw platformError("PLATFORM_DEFINITION_EXTERNAL_HOST_INVALID", { platformId });
  const seenHosts = new Set();
  const externalHosts = input.externalHosts.map(function (host) {
    if (typeof host !== "string" || host !== host.toLowerCase() || !SAFE_HOST.test(host) || host === "localhost" || /^\d+(?:\.\d+){3}$/.test(host) || seenHosts.has(host))
      throw platformError("PLATFORM_DEFINITION_EXTERNAL_HOST_INVALID", { platformId });
    seenHosts.add(host);
    return host;
  });
  if (input.publicationTargetKind === "resource" && (capabilities.regularSubmission || capabilities.legacyQueueImport || capabilities.loginSession || capabilities.accountInspection || capabilities.imagePublishing))
    throw platformError("PLATFORM_DEFINITION_INVARIANT_VIOLATION", { platformId });
  if (capabilities.imagePublishing && !capabilities.regularSubmission)
    throw platformError("PLATFORM_DEFINITION_INVARIANT_VIOLATION", { platformId, capability: "imagePublishing" });
  return Object.freeze({ schemaVersion: 1, id: platformId, displayName: input.displayName, publicationTargetKind: input.publicationTargetKind, scanDir: input.scanDir, capabilities, contributions, externalHosts: Object.freeze(externalHosts) });
}

function parsePlatformDefinitionsV1(inputs) {
  if (!Array.isArray(inputs)) throw platformError("PLATFORM_DEFINITION_CAPABILITIES_INVALID");
  const seen = new Set();
  return Object.freeze(inputs.map(function (input) {
    const definition = parsePlatformDefinitionV1(input);
    if (seen.has(definition.id)) throw platformError("PLATFORM_DEFINITION_ID_DUPLICATE", { platformId: definition.id });
    seen.add(definition.id);
    return definition;
  }));
}

module.exports = { CAPABILITY_KEYS, CONTRIBUTION_KEYS, parsePlatformDefinitionV1, parsePlatformDefinitionsV1, platformError };

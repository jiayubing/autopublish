"use strict";

const crypto = require("node:crypto");
const { isSafeSegment } = require("./content-identity");

const SECTIONS = Object.freeze(["offerings", "capabilities", "scenarios", "geoQuestions", "externalResearch", "restrictions"]);
const BASIS = ["fact", "research", "derived", "candidate"];
const SOURCE_TYPES = ["client_file", "client_input", "official_web", "authority", "industry", "media", "third_party"];

function geoError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
function requireValue(condition) {
  if (!condition) throw geoError("GEO_KNOWLEDGE_INVALID");
}
function text(value, max = 12000) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
function stableId(kind, identity) {
  return kind + "-" + crypto.createHash("sha256").update(identity.normalize("NFKC").trim().toLowerCase()).digest("hex").slice(0, 24);
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch (_) { return false; }
}
function validateKnowledge(document) {
  requireValue(object(document) && document.schemaVersion === 1 && isSafeSegment(document.clientId));
  requireValue(Number.isSafeInteger(document.revision) && document.revision >= 0);
  requireValue(["restaurant", "manufacturer", "service", "retail", "other"].includes(document.businessType));
  requireValue(text(document.generatedAt) && Number.isFinite(Date.parse(document.generatedAt)) && text(document.updatedAt) && Number.isFinite(Date.parse(document.updatedAt)));
  requireValue(object(document.status) && ["complete", "partial"].includes(document.status.outcome));
  requireValue(Array.isArray(document.status.warnings) && document.status.warnings.length <= 100 && document.status.warnings.every(v => text(v, 2000)));
  requireValue(Array.isArray(document.sources) && document.sources.length <= 500);
  const sources = new Map();
  for (const source of document.sources) {
    requireValue(object(source) && isSafeSegment(source.id) && !sources.has(source.id) && SOURCE_TYPES.includes(source.type) && text(source.title, 500));
    if (source.type === "client_file") requireValue(text(source.materialId, 1000) && text(source.fileName, 500) && text(source.contentHash, 128));
    else if (source.type !== "client_input") requireValue(safeUrl(source.url) && text(source.fetchedAt) && Number.isFinite(Date.parse(source.fetchedAt)) && source.citationVerified === true);
    sources.set(source.id, source);
  }
  const ids = new Set();
  function validateItem(item, section) {
    requireValue(object(item) && isSafeSegment(item.id) && !ids.has(item.id) && text(item.identity, 2000));
    ids.add(item.id);
    requireValue(BASIS.includes(item.basis) && ["ai", "manual"].includes(item.origin) && typeof item.locked === "boolean");
    requireValue(Array.isArray(item.sourceIds) && item.sourceIds.length <= 100 && item.sourceIds.every(id => sources.has(id)));
    if (item.basis === "fact") requireValue(item.sourceIds.length > 0 && item.sourceIds.some(id => ["client_file", "client_input", "official_web", "authority"].includes(sources.get(id).type)));
    if (section === "profile") requireValue(object(item.fields) && Object.keys(item.fields).length <= 30 && Object.entries(item.fields).every(([key, value]) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(key) && text(value, 2000)));
    else requireValue(text(item.name, 2000) && typeof item.description === "string" && item.description.length <= 12000);
    if (section === "geoQuestions") requireValue(["brand", "category", "selection", "scenario", "local", "comparison"].includes(item.intent) && ["enough", "partial", "insufficient"].includes(item.knowledgeCoverage));
    if (section === "restrictions") requireValue(["unknown", "conflict", "forbidden_claim", "internal_only", "volatile"].includes(item.type));
    for (const key of ["relatedOfferingIds", "relatedScenarioIds"]) requireValue(Array.isArray(item[key]) && item[key].every(id => typeof id === "string"));
    if (item.questionId !== undefined && item.questionId !== null) requireValue(isSafeSegment(item.questionId));
  }
  validateItem(document.profile, "profile");
  for (const section of SECTIONS) {
    requireValue(Array.isArray(document[section]) && document[section].length <= 500);
    document[section].forEach(item => validateItem(item, section));
  }
  const offerings = new Set(document.offerings.map(item => item.id));
  const scenarios = new Set(document.scenarios.map(item => item.id));
  for (const item of [document.profile, ...SECTIONS.flatMap(key => document[key])]) {
    requireValue(item.relatedOfferingIds.every(id => offerings.has(id)) && item.relatedScenarioIds.every(id => scenarios.has(id)));
  }
  requireValue(Buffer.byteLength(JSON.stringify(document)) <= 4000000);
  return structuredClone(document);
}

module.exports = { SECTIONS, geoError, stableId, safeUrl, validateKnowledge };

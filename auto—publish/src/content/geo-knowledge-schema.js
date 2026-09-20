"use strict";

const crypto = require("node:crypto");
const { isSafeSegment } = require("./content-identity");

const SECTIONS = Object.freeze([
  "onlinePresence", "history", "offerings", "capabilities", "cases", "scenarios",
  "recommendationAngles", "competitors", "geoQuestions", "externalResearch", "restrictions",
]);
const BASIS = Object.freeze(["fact", "research", "derived", "candidate"]);
const SOURCE_TYPES = Object.freeze([
  "client_file", "client_input", "client_public", "official_web", "authority",
  "platform", "industry", "media", "third_party",
]);
const CLAIM_STATUSES = Object.freeze(["accepted", "candidate", "rejected"]);
const FACT_SOURCES = new Set(["client_file", "client_input", "official_web", "authority"]);
const RESEARCH_SOURCES = new Set(["client_public", "official_web", "authority", "platform", "industry", "media", "third_party"]);

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
function unique(values) { return new Set(values).size === values.length; }
function stableId(kind, identity) {
  return kind + "-" + crypto.createHash("sha256").update(identity.normalize("NFKC").trim().toLowerCase()).digest("hex").slice(0, 24);
}
function safeUrl(value) {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch (_) { return false; }
}
function normalizeClaimValue(value) { return value.normalize("NFKC").trim().replace(/\s+/gu, " "); }
function basisAllowed(basis, sourceIds, sources) {
  if (basis === "derived") return true;
  if (basis === "candidate") return true;
  if (!sourceIds.length) return false;
  const allowed = basis === "fact" ? FACT_SOURCES : RESEARCH_SOURCES;
  return sourceIds.some(id => allowed.has(sources.get(id)?.type));
}
function profileProjection(claims) {
  const accepted = claims.filter(claim => claim.status === "accepted");
  return {
    id: stableId("profile", "profile"),
    identity: "profile",
    basis: accepted.some(claim => claim.basis === "fact") ? "fact" : accepted.length ? "research" : "candidate",
    origin: accepted.some(claim => claim.origin === "manual") ? "manual" : "ai",
    locked: accepted.some(claim => claim.locked),
    sourceIds: [...new Set(accepted.flatMap(claim => claim.sourceIds))],
    relatedOfferingIds: [], relatedScenarioIds: [],
    fields: Object.fromEntries(accepted.map(claim => [claim.field, claim.value])),
    claims,
  };
}

function validateKnowledge(document) {
  requireValue(object(document) && document.schemaVersion === 2 && isSafeSegment(document.clientId));
  requireValue(Number.isSafeInteger(document.revision) && document.revision >= 0);
  requireValue(["restaurant", "manufacturer", "service", "retail", "other"].includes(document.businessType));
  requireValue(text(document.generatedAt) && Number.isFinite(Date.parse(document.generatedAt)) && text(document.updatedAt) && Number.isFinite(Date.parse(document.updatedAt)));
  requireValue(object(document.status) && ["complete", "partial"].includes(document.status.outcome));
  requireValue(Array.isArray(document.status.warnings) && document.status.warnings.length <= 100 && document.status.warnings.every(value => text(value, 2000)));
  requireValue(Array.isArray(document.sources) && document.sources.length <= 500);
  const sources = new Map();
  for (const source of document.sources) {
    requireValue(object(source) && isSafeSegment(source.id) && !sources.has(source.id) && SOURCE_TYPES.includes(source.type) && text(source.title, 500));
    if (source.type === "client_file") requireValue(text(source.materialId, 1000) && text(source.fileName, 500) && text(source.contentHash, 128));
    else if (source.type !== "client_input") requireValue(safeUrl(source.url) && text(source.fetchedAt) && Number.isFinite(Date.parse(source.fetchedAt)) && source.citationVerified === true);
    sources.set(source.id, source);
  }

  requireValue(object(document.profile) && Array.isArray(document.profile.claims) && document.profile.claims.length <= 500);
  const claimIds = new Set();
  const acceptedFields = new Set();
  for (const claim of document.profile.claims) {
    requireValue(object(claim) && isSafeSegment(claim.id) && !claimIds.has(claim.id));
    claimIds.add(claim.id);
    requireValue(/^[a-zA-Z][a-zA-Z0-9]*$/.test(claim.field) && text(claim.value, 2000));
    requireValue(CLAIM_STATUSES.includes(claim.status) && BASIS.includes(claim.basis));
    requireValue(["ai", "manual"].includes(claim.origin) && typeof claim.locked === "boolean");
    requireValue(Array.isArray(claim.sourceIds) && claim.sourceIds.length <= 100 && unique(claim.sourceIds) && claim.sourceIds.every(id => sources.has(id)));
    requireValue(basisAllowed(claim.basis, claim.sourceIds, sources));
    if (claim.status === "accepted") {
      requireValue(["fact", "research"].includes(claim.basis) && !acceptedFields.has(claim.field));
      acceptedFields.add(claim.field);
    }
  }
  const projected = profileProjection(document.profile.claims);
  requireValue(JSON.stringify(document.profile) === JSON.stringify(projected));
  requireValue(Object.keys(document.profile.fields).length <= 30);

  const ids = new Set([document.profile.id]);
  function validateItem(item, section) {
    requireValue(object(item) && isSafeSegment(item.id) && !ids.has(item.id) && text(item.identity, 2000));
    ids.add(item.id);
    requireValue(BASIS.includes(item.basis) && ["ai", "manual"].includes(item.origin) && typeof item.locked === "boolean");
    requireValue(Array.isArray(item.sourceIds) && item.sourceIds.length <= 100 && unique(item.sourceIds) && item.sourceIds.every(id => sources.has(id)));
    requireValue(basisAllowed(item.basis, item.sourceIds, sources));
    requireValue(text(item.name, 2000) && typeof item.description === "string" && item.description.length <= 12000);
    requireValue(Array.isArray(item.relatedOfferingIds) && item.relatedOfferingIds.length <= 100 && unique(item.relatedOfferingIds));
    requireValue(Array.isArray(item.relatedScenarioIds) && item.relatedScenarioIds.length <= 100 && unique(item.relatedScenarioIds));
    if (["onlinePresence", "history", "cases", "competitors"].includes(section)) requireValue(item.sourceIds.length >= 1);
    if (section === "onlinePresence") requireValue(text(item.platform, 100) && safeUrl(item.url));
    if (section === "history" && item.dateText !== undefined) requireValue(text(item.dateText, 200));
    if (section === "recommendationAngles") requireValue(item.basis === "derived" && (item.relatedOfferingIds.length > 0 || item.relatedScenarioIds.length > 0));
    if (section === "geoQuestions") requireValue(["brand", "category", "selection", "scenario", "local", "comparison"].includes(item.intent) && ["enough", "partial", "insufficient"].includes(item.knowledgeCoverage));
    if (section === "restrictions") {
      requireValue(["unknown", "conflict", "forbidden_claim", "internal_only", "volatile"].includes(item.type));
      if (item.type === "conflict") {
        requireValue(object(item.target) && item.target.section === "profile" && /^[a-zA-Z][a-zA-Z0-9]*$/.test(item.target.field));
        requireValue(Array.isArray(item.claimIds) && item.claimIds.length >= 2 && item.claimIds.every(id => claimIds.has(id)));
        requireValue(["open", "resolved"].includes(item.conflictStatus));
        if (item.conflictStatus === "resolved") requireValue(object(item.resolution) && claimIds.has(item.resolution.acceptedClaimId) && text(item.resolution.resolvedAt, 100));
        else requireValue(item.resolution === null);
      }
    }
    if (item.questionId !== undefined && item.questionId !== null) requireValue(isSafeSegment(item.questionId));
  }
  for (const section of SECTIONS) {
    requireValue(Array.isArray(document[section]) && document[section].length <= 500);
    document[section].forEach(item => validateItem(item, section));
  }
  const offerings = new Set(document.offerings.map(item => item.id));
  const scenarios = new Set(document.scenarios.map(item => item.id));
  for (const item of SECTIONS.flatMap(key => document[key])) {
    requireValue(item.relatedOfferingIds.every(id => offerings.has(id)) && item.relatedScenarioIds.every(id => scenarios.has(id)));
  }
  requireValue(Buffer.byteLength(JSON.stringify(document)) <= 4000000);
  return structuredClone(document);
}

module.exports = { BASIS, CLAIM_STATUSES, SECTIONS, SOURCE_TYPES, basisAllowed, geoError, normalizeClaimValue, profileProjection, safeUrl, stableId, validateKnowledge };

"use strict";

const {
  SECTIONS, basisAllowed, stableId, geoError, normalizeClaimValue,
  profileProjection, validateKnowledge,
} = require("./geo-knowledge-schema");

function normalizeCandidate(candidate, sources, clientId) {
  if (!candidate || typeof candidate !== "object") throw geoError("GEO_KNOWLEDGE_INVALID");
  const sourceMap = new Map(sources.map(source => [source.id, source]));
  const timestamp = new Date().toISOString();
  function sourceIds(value) {
    const ids = Array.isArray(value) ? [...new Set(value)] : [];
    if (ids.some(id => !sourceMap.has(id))) throw geoError("GEO_SOURCE_INVALID");
    return ids;
  }
  function allowedBasis(requested, ids) {
    const basis = ["fact", "research", "derived", "candidate"].includes(requested) ? requested : "candidate";
    return basisAllowed(basis, ids, sourceMap) ? basis : "candidate";
  }
  function item(value, section) {
    if (!value || typeof value !== "object") throw geoError("GEO_KNOWLEDGE_INVALID");
    const ids = sourceIds(value.sourceIds);
    const name = value.name;
    let identity = value.identity || name;
    if (section === "onlinePresence" && !value.identity) identity = [value.platform, name, value.url].join(":");
    if (typeof identity !== "string" || !identity.trim()) throw geoError("GEO_KNOWLEDGE_INVALID");
    let basis = allowedBasis(value.basis, ids);
    if (section === "recommendationAngles") basis = "derived";
    const result = {
      id: stableId(section, identity), identity, basis, origin: "ai", locked: false, sourceIds: ids,
      relatedOfferingIds: (value.relatedOfferingNames || []).map(name => stableId("offerings", name)),
      relatedScenarioIds: (value.relatedScenarioNames || []).map(name => stableId("scenarios", name)),
      name, description: value.description || "",
    };
    if (section === "onlinePresence") Object.assign(result, { platform: value.platform, url: value.url });
    if (section === "history" && value.dateText !== undefined) result.dateText = value.dateText;
    if (section === "geoQuestions") Object.assign(result, { intent: value.intent, knowledgeCoverage: value.knowledgeCoverage || "insufficient", questionId: null });
    if (section === "restrictions") result.type = value.type === "conflict" ? "unknown" : value.type;
    return result;
  }
  const profileInput = candidate.profile && typeof candidate.profile === "object" ? candidate.profile : { fields: {} };
  const profileSources = sourceIds(profileInput.sourceIds);
  const profileBasis = allowedBasis(profileInput.basis, profileSources);
  const fields = profileInput.fields && typeof profileInput.fields === "object" && !Array.isArray(profileInput.fields) ? profileInput.fields : {};
  const claims = Object.entries(fields).map(([field, value]) => {
    if (typeof value !== "string") throw geoError("GEO_KNOWLEDGE_INVALID");
    return {
    id: stableId("claim", field + ":" + normalizeClaimValue(value)),
    field,
    value,
    status: ["fact", "research"].includes(profileBasis) ? "accepted" : "candidate",
    basis: profileBasis,
    origin: "ai",
    locked: false,
    sourceIds: profileSources,
  }; });
  const document = {
    schemaVersion: 2, clientId, revision: 0, businessType: candidate.businessType || "other",
    generatedAt: timestamp, updatedAt: timestamp, status: { outcome: "complete", warnings: [] },
    sources: structuredClone(sources), profile: profileProjection(claims),
  };
  for (const section of SECTIONS) {
    if (candidate[section] !== undefined && !Array.isArray(candidate[section])) throw geoError("GEO_KNOWLEDGE_INVALID");
    document[section] = (candidate[section] || []).map(value => item(value, section));
  }
  return validateKnowledge(document);
}

function mergeProfile(current, incoming, restrictions) {
  const claims = structuredClone(current.claims);
  const byObservation = new Map(claims.map(claim => [claim.field + "\0" + normalizeClaimValue(claim.value), claim]));
  for (const observation of incoming.claims) {
    const key = observation.field + "\0" + normalizeClaimValue(observation.value);
    const same = byObservation.get(key);
    const accepted = claims.find(claim => claim.field === observation.field && claim.status === "accepted");
    if (same) {
      same.sourceIds = [...new Set([...same.sourceIds, ...observation.sourceIds])];
      continue;
    }
    const next = structuredClone(observation);
    if (accepted && normalizeClaimValue(accepted.value) !== normalizeClaimValue(next.value)) next.status = "candidate";
    claims.push(next);
    byObservation.set(key, next);
    if (!accepted || normalizeClaimValue(accepted.value) === normalizeClaimValue(next.value)) continue;
    const identity = "profile:" + next.field;
    const existing = restrictions.find(item => item.type === "conflict" && item.identity === identity);
    const claimIds = [...new Set([...(existing?.claimIds || []), accepted.id, next.id])];
    const sourceIds = [...new Set(claimIds.flatMap(id => claims.find(claim => claim.id === id)?.sourceIds || []))];
    const conflict = {
      id: stableId("restrictions", identity), identity,
      name: next.field + " 存在冲突", description: JSON.stringify({ current: accepted.value, candidate: next.value }),
      type: "conflict", basis: "candidate", origin: "ai", locked: false,
      sourceIds, relatedOfferingIds: [], relatedScenarioIds: [],
      target: { section: "profile", field: next.field }, claimIds,
      conflictStatus: "open", resolution: null,
    };
    if (existing) Object.assign(existing, conflict);
    else restrictions.push(conflict);
  }
  return profileProjection(claims);
}

function mergeKnowledge(current, incoming) {
  if (!current) return validateKnowledge(incoming);
  const result = structuredClone(incoming);
  result.revision = current.revision;
  result.sources = [...new Map([...current.sources, ...incoming.sources].map(source => [source.id, source])).values()];
  result.restrictions = structuredClone(current.restrictions);
  result.profile = mergeProfile(current.profile, incoming.profile, result.restrictions);
  function mergeItem(old, next) {
    if (!old) return next;
    if (old.locked || (old.basis === "fact" && next.basis !== "fact")) return old;
    const oldContent = JSON.stringify({ name: old.name, description: old.description });
    const nextContent = JSON.stringify({ name: next.name, description: next.description });
    if (old.basis === "fact" && next.basis === "fact" && oldContent !== nextContent) return old;
    return { ...next, id: old.id, identity: old.identity, ...(old.questionId ? { questionId: old.questionId } : {}) };
  }
  for (const section of SECTIONS.filter(section => section !== "restrictions")) {
    const items = new Map(current[section].map(item => [item.id, item]));
    for (const item of incoming[section]) items.set(item.id, mergeItem(items.get(item.id), item));
    result[section] = [...items.values()];
  }
  for (const item of incoming.restrictions) {
    const index = result.restrictions.findIndex(existing => existing.id === item.id);
    if (index < 0) result.restrictions.push(item);
    else result.restrictions[index] = mergeItem(result.restrictions[index], item);
  }
  return validateKnowledge(result);
}

module.exports = { normalizeCandidate, mergeKnowledge };

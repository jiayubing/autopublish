"use strict";

const { SECTIONS, stableId, geoError, validateKnowledge } = require("./geo-knowledge-schema");

function normalizeCandidate(candidate, sources, clientId) {
  if (!candidate || typeof candidate !== "object") throw geoError("GEO_KNOWLEDGE_INVALID");
  const sourceMap = new Map(sources.map(source => [source.id, source]));
  const timestamp = new Date().toISOString();
  function item(value, section) {
    if (!value || typeof value !== "object") throw geoError("GEO_KNOWLEDGE_INVALID");
    const identity = section === "profile" ? "profile" : value.identity || value.name;
    if (typeof identity !== "string" || !identity.trim()) throw geoError("GEO_KNOWLEDGE_INVALID");
    const sourceIds = Array.isArray(value.sourceIds) ? [...new Set(value.sourceIds)] : [];
    if (sourceIds.some(id => !sourceMap.has(id))) throw geoError("GEO_SOURCE_INVALID");
    let basis = value.basis || "candidate";
    if (basis === "fact" && !sourceIds.some(id => ["client_file", "client_input", "official_web", "authority"].includes(sourceMap.get(id).type))) basis = "candidate";
    const result = {
      id: stableId(section, identity), identity, basis, origin: "ai", locked: false, sourceIds,
      relatedOfferingIds: (value.relatedOfferingNames || []).map(name => stableId("offerings", name)),
      relatedScenarioIds: (value.relatedScenarioNames || []).map(name => stableId("scenarios", name)),
    };
    if (section === "profile") result.fields = value.fields || {};
    else Object.assign(result, { name: value.name, description: value.description || "" });
    if (section === "geoQuestions") Object.assign(result, { intent: value.intent, knowledgeCoverage: value.knowledgeCoverage || "insufficient", questionId: null });
    if (section === "restrictions") result.type = value.type;
    return result;
  }
  const document = {
    schemaVersion: 1, clientId, revision: 0, businessType: candidate.businessType || "other",
    generatedAt: timestamp, updatedAt: timestamp, status: { outcome: "complete", warnings: [] },
    sources: structuredClone(sources), profile: item(candidate.profile || { fields: {} }, "profile"),
  };
  for (const section of SECTIONS) {
    if (candidate[section] !== undefined && !Array.isArray(candidate[section])) throw geoError("GEO_KNOWLEDGE_INVALID");
    document[section] = (candidate[section] || []).map(value => item(value, section));
  }
  return validateKnowledge(document);
}

function mergeKnowledge(current, incoming) {
  if (!current) return incoming;
  const result = structuredClone(incoming);
  result.revision = current.revision;
  result.sources = [...new Map([...current.sources, ...incoming.sources].map(source => [source.id, source])).values()];
  const conflicts = [];
  function mergeItem(old, next) {
    if (!old) return next;
    if (old.locked) return old;
    const oldContent = JSON.stringify(old.fields || { name: old.name, description: old.description });
    const nextContent = JSON.stringify(next.fields || { name: next.name, description: next.description });
    if (old.basis === "fact" && next.basis === "fact" && oldContent !== nextContent) {
      const identity = old.id + ":" + nextContent;
      conflicts.push({
        id: stableId("restrictions", identity), identity, name: "已有事实与新资料需要核对", description: oldContent + "\n" + nextContent,
        type: "conflict", basis: "candidate", origin: "ai", locked: false,
        sourceIds: [...new Set([...old.sourceIds, ...next.sourceIds])], relatedOfferingIds: [], relatedScenarioIds: [],
      });
      return old;
    }
    return { ...next, id: old.id, identity: old.identity, ...(old.questionId ? { questionId: old.questionId } : {}) };
  }
  result.profile = mergeItem(current.profile, incoming.profile);
  for (const section of SECTIONS) {
    const items = new Map(current[section].map(item => [item.id, item]));
    for (const item of incoming[section]) items.set(item.id, mergeItem(items.get(item.id), item));
    result[section] = [...items.values()];
  }
  result.restrictions = [...new Map([...result.restrictions, ...conflicts].map(item => [item.id, item])).values()];
  return validateKnowledge(result);
}
module.exports = { normalizeCandidate, mergeKnowledge };

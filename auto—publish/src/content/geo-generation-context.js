"use strict";
const { validateKnowledge, geoError } = require("./geo-knowledge-schema");
const { normalizeQuestionText } = require("./geo-question-links");

function selectGeoKnowledge(document, researches, researchIds) {
  if (!document) return null;
  const knowledge = validateKnowledge(document);
  const questions = knowledge.geoQuestions.filter((q) => {
    const index = researchIds.indexOf(q.questionId);
    return (
      index >= 0 &&
      normalizeQuestionText(q.name) ===
        normalizeQuestionText(researches[index].question)
    );
  });
  if (!questions.length) return null;
  const offeringIds = new Set(questions.flatMap((q) => q.relatedOfferingIds));
  const scenarioIds = new Set(questions.flatMap((q) => q.relatedScenarioIds));
  const related = (item) =>
    item.relatedOfferingIds.some((id) => offeringIds.has(id)) ||
    item.relatedScenarioIds.some((id) => scenarioIds.has(id));
  const selected = {
    profile: knowledge.profile.basis === "fact" ? knowledge.profile : null,
    offerings: knowledge.offerings.filter(
      (i) => offeringIds.has(i.id) && i.basis === "fact",
    ),
    scenarios: knowledge.scenarios.filter(
      (i) => scenarioIds.has(i.id) && i.basis !== "candidate",
    ),
    capabilities: knowledge.capabilities.filter(
      (i) => related(i) && i.basis === "fact",
    ),
    externalResearch: knowledge.externalResearch.filter(
      (i) => related(i) && i.basis === "research",
    ),
    restrictions: knowledge.restrictions,
  };
  const sourceIds = new Set(
    [selected.profile, ...Object.values(selected).filter(Array.isArray).flat()]
      .filter(Boolean)
      .flatMap((i) => i.sourceIds),
  );
  const context = JSON.stringify({
    ...selected,
    sources: knowledge.sources.filter((s) => sourceIds.has(s.id)),
  });
  // Never silently truncate restrictions or send an unbounded whole library.
  if (context.length > 100000) throw geoError("GEO_CONTEXT_TOO_LARGE");
  return {
    version: 1,
    clientId: knowledge.clientId,
    revision: knowledge.revision,
    generatedAt: knowledge.generatedAt,
    questions: questions.map((q) => ({
      id: q.id,
      questionId: q.questionId,
      text: q.name,
    })),
    context,
  };
}
function validateGeoSnapshot(value, clientId, researchIds) {
  if (
    !value ||
    value.version !== 1 ||
    value.clientId !== clientId ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    typeof value.context !== "string" ||
    !value.context ||
    value.context.length > 100000 ||
    !Array.isArray(value.questions) ||
    !value.questions.length ||
    value.questions.length > 500 ||
    value.questions.some(
      (q) =>
        !q ||
        typeof q.id !== "string" ||
        !/^geoQuestions-[a-f0-9]{24}$/.test(q.id) ||
        !researchIds?.includes(q.questionId) ||
        typeof q.text !== "string" ||
        !q.text.trim() ||
        q.text.length > 2000,
    ) ||
    new Set(value.questions.map((q) => q.id)).size !== value.questions.length
  )
    throw geoError("ARTICLE_INVALID");
  return structuredClone(value);
}
module.exports = { selectGeoKnowledge, validateGeoSnapshot };

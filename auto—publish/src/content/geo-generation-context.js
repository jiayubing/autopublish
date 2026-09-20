"use strict";
const { validateKnowledge, geoError } = require("./geo-knowledge-schema");
const { normalizeQuestionText } = require("./geo-question-links");

const ANGLE_INTENTS = new Set(["selection", "local", "scenario", "comparison"]);
const COMPETITOR_INTENTS = new Set(["comparison", "selection", "local"]);

function normalizedLiteral(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/gu, "");
}

function selectGeoKnowledge(document, researches, researchIds) {
  if (!document) return null;
  const knowledge = validateKnowledge(document);
  const matchedResearches = [];
  const questions = knowledge.geoQuestions.filter((question) => {
    const index = researchIds.indexOf(question.questionId);
    const matches =
      index >= 0 &&
      normalizeQuestionText(question.name) ===
        normalizeQuestionText(researches[index].question);
    if (matches) matchedResearches.push(researches[index]);
    return matches;
  });
  if (!questions.length) return null;

  const sourceById = new Map(
    knowledge.sources.map((source) => [source.id, source]),
  );
  const offeringIds = new Set(
    questions.flatMap((question) => question.relatedOfferingIds),
  );
  const scenarioIds = new Set(
    questions.flatMap((question) => question.relatedScenarioIds),
  );
  const intents = new Set(questions.map((question) => question.intent));
  const related = (item) =>
    item.relatedOfferingIds.some((id) => offeringIds.has(id)) ||
    item.relatedScenarioIds.some((id) => scenarioIds.has(id));
  const clientWide = (item) =>
    item.relatedOfferingIds.length === 0 &&
    item.relatedScenarioIds.length === 0;
  const attributionRequired = (sourceIds) =>
    sourceIds.length > 0 &&
    sourceIds.every((id) => sourceById.get(id)?.type === "client_public");
  const annotate = (item) => ({
    ...item,
    attributionRequired: attributionRequired(item.sourceIds),
  });
  const selectRelatedWithClientWide = (items, allowClientWide, limit) => {
    const usableItems = items.filter((item) => item.basis !== "candidate");
    const relatedItems = usableItems.filter(related);
    const extras = allowClientWide
      ? usableItems.filter((item) => clientWide(item)).slice(0, limit)
      : [];
    return [
      ...new Map(
        [...relatedItems, ...extras].map((item) => [item.id, item]),
      ).values(),
    ].map(annotate);
  };

  const profileClaims = knowledge.profile.claims
    .filter(
      (claim) =>
        claim.status === "accepted" &&
        ["fact", "research"].includes(claim.basis),
    )
    .map((claim) => ({
      ...claim,
      evidenceClass: claim.basis,
      attributionRequired: attributionRequired(claim.sourceIds),
    }));
  const profile = profileClaims.length
    ? {
        ...knowledge.profile,
        fields: Object.fromEntries(
          profileClaims.map((claim) => [claim.field, claim.value]),
        ),
        claims: profileClaims,
        sourceIds: [
          ...new Set(profileClaims.flatMap((claim) => claim.sourceIds)),
        ],
      }
    : null;

  const answerAndReferenceTitles = matchedResearches
    .flatMap((research) => [
      research.answerText,
      ...(Array.isArray(research.references)
        ? research.references.map((reference) => reference?.title)
        : []),
    ])
    .map(normalizedLiteral)
    .filter(Boolean);
  const competitorMentioned = (item) => {
    const name = normalizedLiteral(item.name);
    return (
      name.length > 0 &&
      answerAndReferenceTitles.some((text) => text.includes(name))
    );
  };

  const selected = {
    profile,
    offerings: knowledge.offerings
      .filter((item) => offeringIds.has(item.id) && item.basis === "fact")
      .map(annotate),
    scenarios: knowledge.scenarios
      .filter(
        (item) => scenarioIds.has(item.id) && item.basis !== "candidate",
      )
      .map(annotate),
    capabilities: knowledge.capabilities
      .filter((item) => related(item) && item.basis === "fact")
      .map(annotate),
    onlinePresence: selectRelatedWithClientWide(
      knowledge.onlinePresence,
      intents.has("brand") || intents.has("local"),
      3,
    ),
    history: selectRelatedWithClientWide(
      knowledge.history,
      intents.has("brand"),
      2,
    ),
    cases: knowledge.cases
      .filter((item) => item.basis !== "candidate" && related(item))
      .map(annotate),
    recommendationAngles: [...intents].some((intent) =>
      ANGLE_INTENTS.has(intent),
    )
      ? knowledge.recommendationAngles.filter(related).slice(0, 3).map(annotate)
      : [],
    competitors: [...intents].some((intent) =>
      COMPETITOR_INTENTS.has(intent),
    )
      ? knowledge.competitors
          .filter(
            (item) =>
              item.basis !== "candidate" &&
              (related(item) || competitorMentioned(item)),
          )
          .slice(0, 5)
          .map(annotate)
      : [],
    externalResearch: knowledge.externalResearch
      .filter((item) => related(item) && item.basis === "research")
      .map(annotate),
    restrictions: knowledge.restrictions.map(annotate),
  };
  const sourceIds = new Set(
    [
      ...(profile ? profile.claims : []),
      ...Object.entries(selected)
        .filter(([key, value]) => key !== "profile" && Array.isArray(value))
        .flatMap(([, value]) => value),
    ].flatMap((item) => item.sourceIds),
  );
  const context = JSON.stringify({
    ...selected,
    sources: knowledge.sources.filter((source) => sourceIds.has(source.id)),
  });
  // Never silently truncate restrictions or send an unbounded whole library.
  if (context.length > 100000) throw geoError("GEO_CONTEXT_TOO_LARGE");
  return {
    version: 1,
    clientId: knowledge.clientId,
    revision: knowledge.revision,
    generatedAt: knowledge.generatedAt,
    questions: questions.map((question) => ({
      id: question.id,
      questionId: question.questionId,
      text: question.name,
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
      (question) =>
        !question ||
        typeof question.id !== "string" ||
        !/^geoQuestions-[a-f0-9]{24}$/.test(question.id) ||
        !researchIds?.includes(question.questionId) ||
        typeof question.text !== "string" ||
        !question.text.trim() ||
        question.text.length > 2000,
    ) ||
    new Set(value.questions.map((question) => question.id)).size !==
      value.questions.length
  )
    throw geoError("ARTICLE_INVALID");
  return structuredClone(value);
}
module.exports = { selectGeoKnowledge, validateGeoSnapshot };

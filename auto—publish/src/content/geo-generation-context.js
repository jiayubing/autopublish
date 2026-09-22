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
  if (value?.version === 2) return validateArticleBriefV2(value, clientId, researchIds);
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

function literalMention(answer, value) {
  const needle = normalizedLiteral(value);
  return needle.length >= 2 && normalizedLiteral(answer).includes(needle);
}

function splitAliases(value) {
  return String(value || "")
    .split(/[、,，;；\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function deriveDecisionDimensions(answer) {
  const values = [];
  for (const line of String(answer || "").split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:[-*]|\d+[.、])\s*([^：:]{2,40})[：:]/u);
    if (match) values.push(match[1].trim());
  }
  return [...new Set(values)].slice(0, 20);
}

function buildArticleBriefV2({ document, knowledgeRevision, geoQuestionId, collectionQuestion, research }) {
  const knowledge = validateKnowledge(document);
  const question = knowledge.geoQuestions.find((item) => item.id === geoQuestionId);
  if (
    knowledgeRevision !== knowledge.revision ||
    !question ||
    !question.questionId ||
    !collectionQuestion ||
    collectionQuestion.id !== question.questionId ||
    collectionQuestion.clientId !== knowledge.clientId ||
    !research ||
    research.id !== collectionQuestion.id ||
    research.clientId !== knowledge.clientId ||
    normalizeQuestionText(question.name) !== normalizeQuestionText(collectionQuestion.text) ||
    normalizeQuestionText(question.name) !== normalizeQuestionText(research.question)
  )
    throw geoError("GENERATION_SOURCE_STALE");
  const oneQuestionDocument = structuredClone(knowledge);
  oneQuestionDocument.geoQuestions = [structuredClone(question)];
  const legacySelection = selectGeoKnowledge(
    oneQuestionDocument,
    [research],
    [collectionQuestion.id],
  );
  if (!legacySelection) throw geoError("GENERATION_SOURCE_STALE");
  const selected = JSON.parse(legacySelection.context);
  const fields = selected.profile?.fields || {};
  const aliases = splitAliases(fields.aliases);
  const primaryName = fields.name || "";
  const knownEntities = [
    primaryName,
    ...aliases,
    ...selected.competitors.map((item) => item.name),
    ...research.references.map((reference) => reference.title),
  ].filter((value) => literalMention(research.answerText, value));
  const selectedKnowledge = {
    profileFacts: selected.profile?.claims || [],
    offerings: selected.offerings,
    capabilities: selected.capabilities,
    scenarios: selected.scenarios,
    cases: selected.cases,
    recommendationAngles: selected.recommendationAngles,
    onlinePresence: selected.onlinePresence,
    history: selected.history,
  };
  const positiveItems = Object.values(selectedKnowledge)
    .flat()
    .filter((item) => item && typeof item.name === "string");
  const sourceIds = new Set(
    [...positiveItems, ...selected.competitors, ...selected.restrictions]
      .flatMap((item) => item.sourceIds || []),
  );
  for (const claim of selectedKnowledge.profileFacts)
    for (const id of claim.sourceIds || []) sourceIds.add(id);
  const brief = {
    version: 2,
    clientId: knowledge.clientId,
    knowledgeRevision: knowledge.revision,
    targetQuestion: {
      geoQuestionId: question.id,
      collectionQuestionId: collectionQuestion.id,
      text: question.name,
      intent: question.intent,
    },
    client: {
      primaryName,
      aliases,
      ...(fields.location ? { location: fields.location } : {}),
    },
    selectedKnowledge,
    competitors: selected.competitors,
    restrictions: selected.restrictions,
    evidence: {
      sources: selected.sources.filter((source) => sourceIds.has(source.id)),
      attributionRequiredIds: [
        ...new Set(
          [...selectedKnowledge.profileFacts, ...positiveItems, ...selected.competitors]
            .filter((item) => item.attributionRequired)
            .map((item) => item.id),
        ),
      ],
    },
    currentResearch: {
      question: research.question,
      answer: research.answerText,
      references: structuredClone(research.references),
      capturedAt: research.collectedAt,
      clientMentioned: [primaryName, ...aliases].some((value) =>
        literalMention(research.answerText, value),
      ),
      mentionedEntities: [...new Set(knownEntities)],
      decisionDimensions: deriveDecisionDimensions(research.answerText),
      answerGaps: positiveItems
        .filter((item) => !literalMention(research.answerText, item.name))
        .map((item) => item.id),
    },
  };
  if (JSON.stringify(brief).length > 100000) throw geoError("GEO_CONTEXT_TOO_LARGE");
  return brief;
}

function validateArticleBriefV2(value, clientId, researchIds) {
  const target = value?.targetQuestion;
  const current = value?.currentResearch;
  const arrays = value?.selectedKnowledge;
  if (
    !value || value.version !== 2 || value.clientId !== clientId ||
    !Number.isSafeInteger(value.knowledgeRevision) || value.knowledgeRevision < 1 ||
    !target || !/^geoQuestions-[a-f0-9]{24}$/.test(target.geoQuestionId || "") ||
    !Array.isArray(researchIds) || researchIds.length !== 1 ||
    researchIds[0] !== target.collectionQuestionId ||
    typeof target.text !== "string" || !target.text.trim() ||
    !current || normalizeQuestionText(current.question) !== normalizeQuestionText(target.text) ||
    typeof current.answer !== "string" || !current.answer.trim() ||
    typeof current.capturedAt !== "string" || !current.capturedAt.trim() ||
    !Array.isArray(current.references) || current.references.some((reference) =>
      !reference || typeof reference.title !== "string" || !reference.title.trim() ||
      typeof reference.url !== "string" || !reference.url.trim()) ||
    !Array.isArray(current.mentionedEntities) ||
    !Array.isArray(current.decisionDimensions) || !Array.isArray(current.answerGaps) ||
    typeof current.clientMentioned !== "boolean" ||
    !value.client || typeof value.client.primaryName !== "string" ||
    !Array.isArray(value.client.aliases) || !arrays ||
    ["profileFacts", "offerings", "capabilities", "scenarios", "cases", "recommendationAngles", "onlinePresence", "history"].some((key) => !Array.isArray(arrays[key])) ||
    !Array.isArray(value.competitors) || !Array.isArray(value.restrictions) ||
    !value.evidence || !Array.isArray(value.evidence.sources) ||
    !Array.isArray(value.evidence.attributionRequiredIds) ||
    JSON.stringify(value).length > 100000
  )
    throw geoError("ARTICLE_INVALID");
  return structuredClone(value);
}

module.exports = {
  selectGeoKnowledge,
  buildArticleBriefV2,
  validateGeoSnapshot,
  validateArticleBriefV2,
  deriveDecisionDimensions,
};

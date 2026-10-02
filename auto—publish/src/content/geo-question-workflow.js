"use strict";

const { normalizeQuestionText } = require("./geo-question-links");

function buildGeoQuestionWorkflow({ document, questions, research, articleCounts }) {
  const questionsById = new Map(questions.map((item) => [item.id, item]));
  const researchById = new Map(research.map((item) => [item.id, item]));
  return {
    clientId: document.clientId,
    knowledgeRevision: document.revision,
    items: document.geoQuestions.slice(0, 500).map((item) => {
      const question = item.questionId ? questionsById.get(item.questionId) : null;
      const textMatches =
        question &&
        normalizeQuestionText(question.text) === normalizeQuestionText(item.name);
      const metadata = textMatches ? researchById.get(question.id) : null;
      const researchMatches =
        metadata &&
        metadata.isAnswerComplete &&
        normalizeQuestionText(metadata.question) ===
          normalizeQuestionText(question.text);
      let linkStatus = "unlinked";
      let readinessCode = "GEO_QUESTION_UNLINKED";
      if (item.questionId && !textMatches) {
        linkStatus = "stale";
        readinessCode = "GEO_QUESTION_LINK_STALE";
      } else if (textMatches) {
        linkStatus = "linked";
        readinessCode = researchMatches
          ? "GEO_GENERATION_READY"
          : metadata
            ? "GEO_RESEARCH_STALE"
            : "GEO_RESEARCH_MISSING";
      }
      return {
        id: item.id,
        name: item.name,
        intent: item.intent || "",
        knowledgeCoverage: item.knowledgeCoverage || "",
        linkStatus,
        questionId: textMatches ? question.id : null,
        collectionEnabled: textMatches ? question.enabled : null,
        research: researchMatches
          ? {
              collectedAt: metadata.collectedAt || "",
              answerLength: metadata.answerLength,
              referenceCount: metadata.referenceCount,
            }
          : null,
        articles: articleCounts[item.id] || { total: 0, publishedCount: 0 },
        generation: {
          ready: readinessCode === "GEO_GENERATION_READY",
          code: readinessCode,
        },
      };
    }),
  };
}

module.exports = { buildGeoQuestionWorkflow };

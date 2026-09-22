"use strict";

const { geoError } = require("./geo-knowledge-schema");
const normalizeQuestionText = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");
const normalizeMentionText = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/\s+/g, " ");

function acceptedClientNames(document, client) {
  const aliases = String(document.profile?.fields?.aliases || "")
    .split(/[、,，;；\n]/u)
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([client.name, client.displayName, document.profile?.fields?.name, ...aliases]
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function createGeoQuestionLinks({
  store,
  questionService,
  researchStore,
  getClient,
}) {
  function documentFor(clientId) {
    getClient(clientId);
    const document = store.load(clientId);
    if (!document) throw geoError("GEO_NOT_FOUND");
    return document;
  }
  function linkQuestions({ clientId, revision, ids }) {
    const document = documentFor(clientId);
    if (document.revision !== revision) throw geoError("GEO_REVISION_CONFLICT");
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 500 ||
      new Set(ids).size !== ids.length
    )
      throw geoError("GEO_KNOWLEDGE_INVALID");
    const selected = ids.map((id) =>
      document.geoQuestions.find((item) => item.id === id),
    );
    if (selected.some((item) => !item)) throw geoError("GEO_ITEM_NOT_FOUND");
    const questions = questionService.listQuestions({ clientId });
    let mayHaveWritten = false;
    try {
      for (const item of selected) {
        const text = normalizeQuestionText(item.name);
        let question = questions.find(
          (q) => normalizeQuestionText(q.text) === text,
        );
        if (!question) {
          // The existing owner may persist before its invalidation callback fails.
          mayHaveWritten = true;
          question = questionService.createQuestion({
            clientId,
            text: item.name,
            enabled: true,
          });
          questions.push(question);
        }
        item.questionId = question.id;
      }
      return { knowledge: store.save(document, revision) };
    } catch (error) {
      if (mayHaveWritten) throw geoError("GEO_LINK_PARTIAL");
      throw error;
    }
  }
  function questionDetails({ clientId, id }) {
    const document = documentFor(clientId);
    const item = document.geoQuestions.find((q) => q.id === id);
    if (!item) throw geoError("GEO_ITEM_NOT_FOUND");
    const empty = {
      id,
      linkStatus: "unlinked",
      enabled: null,
      research: null,
      clientMentioned: null,
    };
    if (!item.questionId) return empty;
    const question = questionService
      .listQuestions({ clientId })
      .find((q) => q.id === item.questionId);
    if (
      !question ||
      normalizeQuestionText(question.text) !== normalizeQuestionText(item.name)
    )
      return { ...empty, linkStatus: "stale" };
    const result = {
      ...empty,
      linkStatus: "linked",
      enabled: question.enabled,
    };
    let research;
    try {
      research = researchStore.getResearch(clientId, question.id);
    } catch (error) {
      if (error.code === "RESEARCH_NOT_FOUND") return result;
      throw geoError("GEO_READ_FAILED");
    }
    if (
      normalizeQuestionText(research.question) !==
      normalizeQuestionText(question.text)
    )
      return { ...result, linkStatus: "stale" };
    const client = getClient(clientId);
    const names = acceptedClientNames(document, client);
    const answer = normalizeMentionText(research.answerText);
    return {
      ...result,
      clientMentioned: names.length
        ? names.some((name) => answer.includes(normalizeMentionText(name)))
        : null,
      research: {
        question: research.question,
        answerText: research.answerText,
        collectedAt: research.collectedAt || "",
        collectionMethod: research.collectionMethod,
        references: research.references.map((ref) => ({
          title: ref.title,
          url: ref.url,
        })),
      },
    };
  }
  return { linkQuestions, questionDetails };
}
module.exports = { createGeoQuestionLinks, normalizeQuestionText, acceptedClientNames };

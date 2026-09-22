"use strict";
const crypto = require("node:crypto");
const { normalizeQuestionText } = require("./geo-question-links");

function canonicalUrl(value) {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80"))
    url.port = "";
  return url.toString();
}

function canonicalResearch(research) {
  if (!research || typeof research !== "object") throw Object.assign(new Error("Research is invalid"), { code: "GEO_RESEARCH_INVALID" });
  return {
    version: 1,
    id: research.id,
    clientId: research.clientId,
    question: normalizeQuestionText(research.question),
    answerText: String(research.answerText || "").replace(/\r\n?/gu, "\n").trim(),
    references: (research.references || []).map((reference) => ({
      title: String(reference.title || "").trim(),
      url: canonicalUrl(reference.url),
      snippet: String(reference.snippet || "").replace(/\s+/gu, " ").trim(),
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    collectedAt: research.collectedAt,
  };
}

function fingerprintResearch(research) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalResearch(research))).digest("hex");
}

function canonicalCreateIntent(input) {
  const selectedQuestions = [...new Map((input.selectedQuestions || []).map((item) => [
    item.clientId + "\0" + item.geoQuestionId,
    { clientId: item.clientId, geoQuestionId: item.geoQuestionId },
  ])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const selectedTemplates = [...new Map((input.selectedTemplates || []).map((item) => [
    item.platform + "\0" + item.templateId,
    { platform: item.platform, templateId: item.templateId },
  ])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { version: 1, selectedQuestions, selectedTemplates, concurrency: input.concurrency };
}

function fingerprintCreateIntent(input) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalCreateIntent(input))).digest("hex");
}

module.exports = { canonicalResearch, fingerprintResearch, canonicalCreateIntent, fingerprintCreateIntent };

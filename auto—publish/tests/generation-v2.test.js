"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fingerprintResearch, fingerprintCreateIntent } = require("../src/content/generation-v2");

test("research fingerprint canonicalizes order, URLs, line endings and excludes updatedAt", () => {
  const base = {
    id: "q1", clientId: "c1", question: "  如何 选择？ ", answerText: "答案\r\n第二行\r\n",
    collectedAt: "2026-09-22T00:00:00Z", updatedAt: "old",
    references: [
      { title: " B ", url: "https://EXAMPLE.com:443/b#fragment" },
      { title: "A", url: "https://example.com/a", snippet: " x   y " },
    ],
  };
  assert.equal(fingerprintResearch(base), fingerprintResearch({
    ...base,
    updatedAt: "new",
    answerText: "答案\n第二行",
    references: [...base.references].reverse(),
  }));
  assert.notEqual(fingerprintResearch(base), fingerprintResearch({ ...base, answerText: "变化" }));
});

test("create fingerprint is stable by client-question and template identity", () => {
  const input = {
    selectedQuestions: [{ clientId: "c2", geoQuestionId: "g2" }, { clientId: "c1", geoQuestionId: "g1" }],
    selectedTemplates: [{ platform: "p2", templateId: "t2" }, { platform: "p1", templateId: "t1" }],
    concurrency: 2,
  };
  assert.equal(fingerprintCreateIntent(input), fingerprintCreateIntent({
    ...input,
    selectedQuestions: [...input.selectedQuestions].reverse(),
    selectedTemplates: [...input.selectedTemplates].reverse(),
  }));
  assert.notEqual(fingerprintCreateIntent(input), fingerprintCreateIntent({ ...input, concurrency: 3 }));
});

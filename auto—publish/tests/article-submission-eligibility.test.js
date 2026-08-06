const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { evaluateArticleSubmissionEligibility, REASON_CODES } = require("../src/content/article-submission-eligibility");

function completeArticle(overrides = {}) {
  return Object.assign({
    id: "article-1",
    clientId: "client-1",
    status: "generated",
    title: "完整标题",
    content: "完整正文",
    source: { client_material: true, doubao_answer: true, references: true, template: true },
    materialSnapshots: [{ id: "material-1", name: "资料", extension: ".md", content: "资料", contentHash: "hash", source: "text" }],
    researchSnapshots: [{ questionId: "question-1", answerText: "回答", references: [], collectionMethod: "manual" }],
    templateSnapshot: { platform: "platform-1", id: "template-1", name: "模板", scenario: "场景", body: "模板正文", bodyHash: "template-hash" }
  }, overrides);
}

describe("article submission eligibility", function() {
  it("allows a generated article without a review click or provenance snapshots", function() {
    const result = evaluateArticleSubmissionEligibility(completeArticle());
    assert.deepEqual(result, { eligible: true, reasonCodes: [], reasons: [] });
  });

  it("allows a manually written article without AI provenance", function() {
    const result = evaluateArticleSubmissionEligibility({
      id: "manual-1",
      clientId: "client-1",
      title: "手工文章",
      content: "手工正文",
      status: "saved",
      reviewedAt: "2026-07-15T00:00:00.000Z",
    });
    assert.deepEqual(result, { eligible: true, reasonCodes: [], reasons: [] });
  });

  it("uses the same policy for saved articles and returns stable Chinese reason codes", function() {
    const result = evaluateArticleSubmissionEligibility(completeArticle({ status: "saved", content: "" }));
    assert.equal(result.eligible, false);
    assert.deepEqual(result.reasonCodes, [REASON_CODES.ARTICLE_CONTENT_EMPTY]);
    assert.equal(result.reasons[0], "正文为空");
  });

  it("blocks missing identity, title, or body with explicit Chinese reasons", function() {
    const result = evaluateArticleSubmissionEligibility({ id: "article-1" });
    assert.deepEqual(result.reasonCodes, [
      REASON_CODES.ARTICLE_IDENTITY_INVALID,
      REASON_CODES.ARTICLE_TITLE_EMPTY,
      REASON_CODES.ARTICLE_CONTENT_EMPTY,
    ]);
    assert.deepEqual(result.reasons, ["文章身份不完整", "标题为空", "正文为空"]);
  });
});

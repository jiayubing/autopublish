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
  it("allows a complete generated article without a review click", function() {
    const result = evaluateArticleSubmissionEligibility(completeArticle());
    assert.deepEqual(result, { eligible: true, reasonCodes: [], reasons: [] });
  });

  it("uses the same policy for saved articles and returns stable Chinese reason codes", function() {
    const result = evaluateArticleSubmissionEligibility(completeArticle({ status: "saved", content: "" }));
    assert.equal(result.eligible, false);
    assert.deepEqual(result.reasonCodes, [REASON_CODES.ARTICLE_CONTENT_EMPTY]);
    assert.equal(result.reasons[0], "正文为空");
  });

  it("blocks incomplete provenance instead of manufacturing a source", function() {
    const result = evaluateArticleSubmissionEligibility(completeArticle({ materialSnapshots: [] }));
    assert.equal(result.eligible, false);
    assert.deepEqual(result.reasonCodes, [REASON_CODES.ARTICLE_PROVENANCE_INCOMPLETE]);
  });
});

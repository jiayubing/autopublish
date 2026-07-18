const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { resolveArticleIdentity } = require("../src/publication/article-identity");

describe("publication article identity", function() {
  it("prefers the generated article identity over editable content", function() {
    const identity = resolveArticleIdentity({ clientId: "client-1", articleId: "article-1", title: "标题", content: "正文" });
    assert.equal(identity.articleKey, "generated:client-1:article-1");
    assert.equal(identity.kind, "generated");
    assert.equal(identity.clientId, "client-1");
    assert.equal(identity.articleId, "article-1");
    assert.equal(Object.prototype.hasOwnProperty.call(identity, "content"), false);
  });

  it("hashes normalized manual title and content", function() {
    const identity = resolveArticleIdentity({ clientId: "client-1", title: "  标题\r\n", content: "正文\r\n" });
    const expected = crypto.createHash("sha256").update("标题\n\n正文", "utf8").digest("hex");
    assert.equal(identity.articleKey, "content:" + expected);
    assert.equal(identity.contentHash, expected);
    assert.equal(identity.articleId, null);
  });

  it("rejects empty or path-like identity parts", function() {
    assert.throws(() => resolveArticleIdentity({ clientId: "", articleId: "article-1" }), { code: "PUBLICATION_ARTICLE_ID_INVALID" });
    assert.throws(() => resolveArticleIdentity({ clientId: "client-1", articleId: "../article" }), { code: "PUBLICATION_ARTICLE_ID_INVALID" });
    assert.throws(() => resolveArticleIdentity({ clientId: "client-1", title: "标题" }), { code: "PUBLICATION_ARTICLE_CONTENT_REQUIRED" });
  });
});

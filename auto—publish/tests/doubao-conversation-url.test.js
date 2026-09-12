const { it } = require("node:test");
const assert = require("node:assert/strict");
const { validConversationUrl } = require("../src/content/doubao-conversation-url");

it("accepts only a Doubao conversation URL without credentials or a foreign origin", () => {
  assert.equal(validConversationUrl("https://www.doubao.com/chat/123?type=1#fragment"), "https://www.doubao.com/chat/123?type=1");
  for (const value of ["https://example.com/chat/123", "https://www.doubao.com/chat/", "javascript:alert(1)", "https://user:pass@www.doubao.com/chat/123", "https://www.doubao.com:8080/chat/123"]) {
    assert.equal(validConversationUrl(value), null);
  }
});

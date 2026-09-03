const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createDoubaoConversationStore,
  validConversationUrl,
} = require("../src/content/doubao-conversation-store");

describe("doubao client conversation store", function() {
  const roots = [];
  afterEach(function() {
    while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
  });

  it("persists one reusable Doubao conversation URL per client", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "doubao-conversations-"));
    roots.push(root);
    const filename = path.join(root, "data", "doubao-conversations.json");
    const store = createDoubaoConversationStore(filename);

    assert.equal(store.get("client-a"), null);
    assert.equal(store.set("client-a", "https://www.doubao.com/chat/7373790288617275418?type=1"), true);
    assert.equal(
      store.get("client-a"),
      "https://www.doubao.com/chat/7373790288617275418?type=1",
    );

    const reopened = createDoubaoConversationStore(filename);
    assert.equal(
      reopened.get("client-a"),
      "https://www.doubao.com/chat/7373790288617275418?type=1",
    );
  });

  it("treats malformed or unrelated URLs as disposable routing state", function() {
    assert.equal(validConversationUrl("https://example.com/chat/123"), null);
    assert.equal(validConversationUrl("https://www.doubao.com/chat/"), null);
    assert.equal(validConversationUrl("javascript:alert(1)"), null);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "doubao-conversations-invalid-"));
    roots.push(root);
    const filename = path.join(root, "data", "doubao-conversations.json");
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, "{broken", "utf8");

    const store = createDoubaoConversationStore(filename);
    assert.equal(store.get("client-a"), null);
    assert.equal(store.set("client-a", "https://example.com/chat/123"), false);
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createDoubaoBrowserAdapter } = require("../src/content/doubao-browser-adapter");

function snapshot(url, messages) {
  return {
    url,
    inputAvailable: true,
    loginRequired: false,
    generating: false,
    challenge: false,
    errorText: "",
    messageCandidates: messages.map(function(message, index) {
      return {
        messageId: message.id || "message-" + index,
        role: message.role,
        className: message.role === "user" ? "justify-end" : "assistant",
        text: message.text,
        references: [],
      };
    }),
  };
}

describe("doubao client conversation routing", function() {
  it("keeps one conversation for the same client and switches only when the client changes", async function() {
    const calls = [];
    const stored = new Map();
    const histories = new Map();
    let pendingSwitchUrl = null;
    let currentUrl = "https://www.doubao.com/chat/";
    let messages = [];
    let nextConversation = 1000;
    let draftConversation = null;

    const conversationStore = {
      get(clientId) {
        pendingSwitchUrl = stored.get(clientId) || null;
        return pendingSwitchUrl;
      },
      set(clientId, url) {
        if (/\/chat\/\d+/.test(url)) stored.set(clientId, url);
        return true;
      },
      remove(clientId) {
        stored.delete(clientId);
        return true;
      },
    };

    const runtime = {
      async open(input) {
        calls.push(["open", input.url]);
      },
      async close() {
        calls.push(["close"]);
      },
      async evaluate(input) {
        calls.push(["evaluate", input.action]);
        if (input.action === "new-conversation") {
          currentUrl = "https://www.doubao.com/chat/";
          messages = [];
          draftConversation = String(nextConversation++);
          return { url: currentUrl, created: true };
        }
        if (input.action === "switch-conversation") {
          currentUrl = pendingSwitchUrl;
          messages = (histories.get(currentUrl) || []).map((item) => ({ ...item }));
          return { url: currentUrl };
        }
        if (input.action === "send-question") {
          if (draftConversation) {
            currentUrl = "https://www.doubao.com/chat/" + draftConversation;
            draftConversation = null;
          }
          const question = JSON.parse(input.questionJson);
          messages.push({ id: "user-" + messages.length, role: "user", text: question });
          messages.push({
            id: "assistant-" + messages.length,
            role: "assistant",
            text: "这是针对“" + question + "”生成的完整回答。",
          });
          histories.set(currentUrl, messages.map((item) => ({ ...item })));
          return { ok: true };
        }
        if (input.action === "inspect-page") {
          return snapshot(currentUrl, messages);
        }
        throw new Error("unexpected action " + input.action);
      },
    };

    const adapter = createDoubaoBrowserAdapter({
      runtime,
      conversationStore,
      sleep: async function() {},
      clock: function() { return 0; },
      now: function() { return "2026-09-03T00:00:00.000Z"; },
    });

    await adapter.collect({ clientId: "client-a", question: "问题 A1" });
    await adapter.collect({ clientId: "client-a", question: "问题 A2" });
    assert.equal(
      calls.filter((call) => call[0] === "evaluate" && call[1] === "new-conversation").length,
      1,
    );
    assert.equal(
      calls.filter((call) => call[0] === "evaluate" && call[1] === "switch-conversation").length,
      0,
    );

    await adapter.collect({ clientId: "client-b", question: "问题 B1" });
    assert.equal(
      calls.filter((call) => call[0] === "evaluate" && call[1] === "new-conversation").length,
      2,
    );
    assert.notEqual(stored.get("client-a"), stored.get("client-b"));

    await adapter.close();
    await adapter.collect({ clientId: "client-a", question: "问题 A3" });
    assert.equal(
      calls.filter((call) => call[0] === "evaluate" && call[1] === "switch-conversation").length,
      1,
    );
    assert.match(stored.get("client-a"), /^https:\/\/www\.doubao\.com\/chat\/\d+/);
  });
});

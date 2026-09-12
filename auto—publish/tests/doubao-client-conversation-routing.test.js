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
  it("shares a conversation within a run and opens fresh conversations after a new run or close", async function() {
    const calls = [];
    const histories = new Map();
    let currentUrl = "https://www.doubao.com/chat/";
    let messages = [];
    let nextConversation = 1000;
    let draftConversation = null;

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
          await new Function("page", `return (async () => {${input.script}})();`)({
            goto: async url => { currentUrl = url; }, url: () => currentUrl,
          });
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
          return { ok: true, questionMessageId: messages[messages.length - 2].id, url: currentUrl };
        }
        if (input.action === "inspect-page") {
          return snapshot(currentUrl, messages);
        }
        throw new Error("unexpected action " + input.action);
      },
    };

    const adapter = createDoubaoBrowserAdapter({
      runtime,
      sleep: async function() {},
      clock: function() { return 0; },
      now: function() { return "2026-09-03T00:00:00.000Z"; },
    });

    await adapter.collect({ clientId: "client-a", question: "问题 A1" });
    const firstUrl = currentUrl;
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
    assert.notEqual(firstUrl, currentUrl);

    await adapter.collect({ clientId: "client-a", question: "问题 A3" });
    assert.equal(currentUrl, firstUrl);

    await adapter.collect({ clientId: "client-a", question: "问题 A4", collectionRunId: "next-run" });
    assert.notEqual(currentUrl, firstUrl);
    const secondUrl = currentUrl;
    await adapter.collect({ clientId: "client-a", question: "问题 A5", collectionRunId: "next-run" });
    assert.equal(currentUrl, secondUrl);

    await adapter.close();
    await adapter.collect({ clientId: "client-a", question: "问题 A6", collectionRunId: "next-run" });
    assert.notEqual(currentUrl, secondUrl);
    assert.equal(
      calls.filter((call) => call[0] === "evaluate" && call[1] === "switch-conversation").length,
      1,
    );
    assert.equal(calls.filter(call => call[1] === "new-conversation").length, 4);
  });
});

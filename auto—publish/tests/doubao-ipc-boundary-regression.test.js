const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { registerDoubaoCollectionIpc } = require("../desktop/ipc/doubao-collection-ipc");
const { assertPlaywrightAvailable } = require("../desktop/services/playwright-capability");

function runtimeDiagnostics(overrides) {
  const diagnostics = {
    tools: {
      playwrightNode: { command: "node" },
      playwrightCli: { command: "playwright" },
      browserChannel: { configured: true },
    },
    capabilities: {
      browserChannel: { state: "available" },
    },
  };
  if (overrides) overrides(diagnostics);
  return { diagnose: function() { return diagnostics; } };
}

describe("Doubao IPC boundary regressions", function() {
  it("projects only the deleted question from the service invalidation result", async function() {
    const handlers = new Map();
    const question = {
      id: "question-a",
      text: "删除前的问题",
      enabled: true,
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
    };

    registerDoubaoCollectionIpc({
      ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } },
      doubaoCollectionService: {
        deleteQuestion: function(input) {
          assert.deepEqual(input, { clientId: "client-a", questionId: "question-a" });
          return { question: question, research: { id: "research-a" } };
        },
      },
    });

    const result = await handlers.get("content:delete-question")(null, {
      clientId: "client-a",
      questionId: "question-a",
    });

    assert.deepEqual(result, { ok: true, data: { question: question } });
  });

  it("maps browser runtime capability failures to the public Playwright error code", function() {
    const cases = [
      function(diagnostics) { diagnostics.tools.playwrightNode.command = null; },
      function(diagnostics) { diagnostics.tools.playwrightCli.command = null; },
      function(diagnostics) { diagnostics.tools.browserChannel.configured = false; },
      function(diagnostics) {
        diagnostics.capabilities.browserChannel = {
          state: "unavailable",
          errorCode: "BROWSER_CHANNEL_UNAVAILABLE",
        };
      },
    ];

    for (const mutate of cases) {
      assert.throws(
        function() { assertPlaywrightAvailable(runtimeDiagnostics(mutate)); },
        function(error) { return error && error.code === "PLAYWRIGHT_UNAVAILABLE"; },
      );
    }
  });
});

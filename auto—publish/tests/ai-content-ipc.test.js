const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { registerAiContentIpc } = require("../desktop/ipc/ai-content-ipc");

function createIpc() {
  const handlers = new Map();
  return { handlers: handlers, ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } } };
}

describe("ai content ipc", function() {
  it("registers the complete thin content IPC surface", async function() {
    const ipc = createIpc();
    const service = {
      listClients: function() { return [{ id: "client-1" }]; }, getClient: function() { return {}; },
      listResearch: function() { return []; }, getResearch: function() { return {}; }, listTemplates: function() { return []; },
      generateArticle: async function() { return { id: "article-1" }; }, saveArticle: function(value) { return value; },
      listGeneratedArticles: function() { return []; }, getGeneratedArticle: function() { return {}; }
    };
    registerAiContentIpc({ ipcMain: ipc.ipcMain, aiContentService: service });
    ["content:list-clients", "content:get-client", "content:list-research", "content:get-research", "content:list-templates", "content:generate-article", "content:save-article", "content:list-generated-articles", "content:get-generated-article"].forEach(function(channel) {
      assert.equal(ipc.handlers.has(channel), true, "missing " + channel);
    });
    assert.deepStrictEqual(await ipc.handlers.get("content:list-clients")(), { ok: true, data: [{ id: "client-1" }] });
    assert.deepStrictEqual(await ipc.handlers.get("content:generate-article")(null, { clientId: "client-1" }), { ok: true, data: { id: "article-1" } });
  });

  it("wraps coded service errors without stack traces", async function() {
    const ipc = createIpc();
    const failure = new Error("safe failure");
    failure.code = "CONTENT_INPUT_INVALID";
    registerAiContentIpc({ ipcMain: ipc.ipcMain, aiContentService: { listClients: function() { throw failure; } } });
    const result = await ipc.handlers.get("content:list-clients")();
    assert.deepStrictEqual(result, { ok: false, error: { code: "CONTENT_INPUT_INVALID", message: "safe failure" } });
  });

  it("returns safe provenance validation errors through the generation IPC boundary", async function() {
    const ipc = createIpc();
    const failure = new Error("Client material selection is invalid");
    failure.code = "CLIENT_MATERIAL_INVALID";
    registerAiContentIpc({ ipcMain: ipc.ipcMain, aiContentService: {
      generateArticle: function() { throw failure; }
    } });
    const result = await ipc.handlers.get("content:generate-article")(null, { clientId: "client-1", materialIds: ["missing"] });
    assert.deepStrictEqual(result, { ok: false, error: { code: "CLIENT_MATERIAL_INVALID", message: "Client material selection is invalid" } });
    assert.equal(Object.prototype.hasOwnProperty.call(result.error, "stack"), false);
  });

  it("rejects non-object generation payloads without exposing internal details", async function() {
    const ipc = createIpc();
    registerAiContentIpc({ ipcMain: ipc.ipcMain, aiContentService: { generateArticle: function() { throw new Error("should not run"); } } });
    const result = await ipc.handlers.get("content:generate-article")(null, []);
    assert.deepStrictEqual(result, { ok: false, error: { code: "CONTENT_INPUT_INVALID", message: "Generation input must be an object" } });
  });
});

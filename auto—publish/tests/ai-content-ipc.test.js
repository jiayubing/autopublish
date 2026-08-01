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
      listClients: function() { return [{ id: "client-1", name: "Client", knowledgeFiles: [] }]; }, retryMaterial: function() { return { id: "material-1", name: "facts.txt", content: "facts", status: "ready" }; },
      listResearch: function() { return []; },
      generateArticle: async function() { return { id: "article-1" }; }, saveArticle: function(value) { return value; },
      copyArticleVersion: function(input) { return { id: "article-copy", sourceArticleId: input.sourceArticleId, version: 2 }; }
    };
    registerAiContentIpc({ ipcMain: ipc.ipcMain, aiContentService: service });
    ["content:list-clients", "content:list-research", "content:list-template-catalog", "content:retry-material", "content:generate-article", "content:save-article", "content:copy-article-version"].forEach(function(channel) {
      assert.equal(ipc.handlers.has(channel), true, "missing " + channel);
    });
    assert.deepStrictEqual(await ipc.handlers.get("content:list-clients")(), { ok: true, data: { clients: [{ id: "client-1", name: "Client", knowledgeFiles: [] }] } });
    assert.deepStrictEqual(await ipc.handlers.get("content:generate-article")(null, { clientId: "client-1" }), { ok: true, data: { article: { id: "article-1" } } });
    assert.deepStrictEqual(await ipc.handlers.get("content:copy-article-version")(null, { clientId: "client-1", sourceArticleId: "article-1" }), { ok: true, data: { article: { id: "article-copy", sourceArticleId: "article-1", version: 2 } } });
    assert.deepStrictEqual(await ipc.handlers.get("content:retry-material")(null, { clientId: "client-1", materialId: "material-1" }), { ok: true, data: { material: { id: "material-1", name: "facts.txt", content: "facts", status: "ready" } } });
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

  it("exposes safe removal transaction query and retry handlers", async function() {
    const ipc = createIpc();
    const service = {
      getArticleRemovalTransaction: (id) => ({ id, transactionId: id, status: "needs_repair", phase: "needs_repair", errorCode: "PUBLICATION_ATTEMPT_MISMATCH" }),
      retryArticleRemovalTransaction: (input) => ({ id: input.transactionId, transactionId: input.transactionId, status: "committed", phase: "committed" })
    };
    registerAiContentIpc({ ipcMain: ipc.ipcMain, aiContentService: service });

    assert.deepEqual(await ipc.handlers.get("content:get-article-removal-transaction")(null, { transactionId: "tx-1" }), { ok: true, data: { transaction: { id: "tx-1", transactionId: "tx-1", status: "needs_repair", phase: "needs_repair", errorCode: "PUBLICATION_ATTEMPT_MISMATCH" } } });
    assert.deepEqual(await ipc.handlers.get("content:retry-article-removal-transaction")(null, { transactionId: "tx-1", confirmed: true }), { ok: true, data: { transaction: { id: "tx-1", transactionId: "tx-1", status: "committed", phase: "committed" } } });
  });
});

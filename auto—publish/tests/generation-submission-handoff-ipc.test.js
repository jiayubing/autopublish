const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { registerGenerationSubmissionHandoffIpc } = require("../desktop/ipc/generation-submission-handoff-ipc");

function fakeIpc() {
  const handlers = new Map();
  return { handlers, ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } } };
}

describe("generation submission handoff IPC", function() {
  it("rejects renderer paths and unknown fields before invoking the service", async function() {
    const { ipcMain, handlers } = fakeIpc();
    let calls = 0;
    registerGenerationSubmissionHandoffIpc({ ipcMain, generationSubmissionHandoffService: { preview() { calls += 1; return {}; }, commit() { calls += 1; return {}; } } });
    const pathResult = await handlers.get("content:preview-generation-submission-handoff")(null, { generationBatchId: "C:\\private\\generation", platformId: "target-a", accountProfileId: "account-a" });
    const fieldResult = await handlers.get("content:preview-generation-submission-handoff")(null, { generationBatchId: "generation-1", platformId: "target-a", accountProfileId: "account-a", articleId: "article-1" });
    const legacyResult = await handlers.get("content:preview-generation-submission-handoff")(null, { generationBatchId: "generation-1", targetPlatformIds: ["target-a", "target-b"], accountProfiles: { "target-a": "account-a" } });
    assert.deepEqual(pathResult, { ok: false, error: { code: "HANDOFF_INPUT_INVALID", message: "批次投稿交接输入无效" } });
    assert.deepEqual(fieldResult, { ok: false, error: { code: "HANDOFF_INPUT_INVALID", message: "批次投稿交接输入无效" } });
    assert.deepEqual(legacyResult, { ok: false, error: { code: "HANDOFF_INPUT_INVALID", message: "批次投稿交接输入无效" } });
    assert.equal(calls, 0);
  });

  it("returns only the allowlisted safe error for a stale preview", async function() {
    const { ipcMain, handlers } = fakeIpc();
    registerGenerationSubmissionHandoffIpc({ ipcMain, generationSubmissionHandoffService: { preview() { return { previewToken: "handoff-token" }; }, commit() { throw Object.assign(new Error("C:\\secret\\article.md"), { code: "HANDOFF_PREVIEW_STALE", filePath: "C:\\secret\\article.md" }); } } });
    const result = await handlers.get("content:commit-generation-submission-handoff")(null, { generationBatchId: "generation-1", platformId: "target-a", accountProfileId: "account-a", previewToken: "handoff-token", confirmed: true });
    assert.deepEqual(result, { ok: false, error: { code: "HANDOFF_PREVIEW_STALE", message: "投稿交接预检已过期，请重新检查" } });
    assert.equal(JSON.stringify(result).includes("secret"), false);
  });
});

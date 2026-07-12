const { it } = require("node:test"); const assert = require("node:assert/strict");
const { registerContentSubmissionIpc } = require("../desktop/ipc/content-submission-ipc");
it("requires confirmed true and never accepts renderer paths", async function() {
  const handlers = new Map();
  registerContentSubmissionIpc({ ipcMain: { handle: (c, h) => handlers.set(c, h) }, contentSubmissionService: { previewExport: () => ({}) } });
  const result = await handlers.get("content:preview-export")(null, { clientId: "c", generatedArticleId: "a", targetPlatform: "media", confirmed: false, filePath: "C:\\x" });
  assert.deepStrictEqual(result, { ok: false, error: { code: "CONTENT_EXPORT_CONFIRMATION_REQUIRED", message: "Manual confirmation is required" } });
});

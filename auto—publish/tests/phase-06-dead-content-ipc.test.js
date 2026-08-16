const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { registerAiContentIpc } = require("../desktop/ipc/ai-content-ipc");
const {
  registerContentSubmissionIpc,
} = require("../desktop/ipc/content-submission-ipc");

const DEAD_CHANNELS = [
  "content:recover-article-removals",
  "content:get-client",
  "content:get-research",
  "content:get-generated-article",
  "content:get-submission-batch",
];

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

test("content IPC registrars omit capabilities with no production Renderer caller", () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };

  registerAiContentIpc({ ipcMain, aiContentService: {} });
  registerContentSubmissionIpc({ ipcMain, submissionMaintenance: {} });

  for (const channel of DEAD_CHANNELS) {
    assert.equal(handlers.has(channel), false, channel);
  }
});

test("preload and main IPC sources omit dead content capability names", () => {
  const boundarySource = [
    read("desktop/preload.js"),
    read("desktop/ipc/ai-content-ipc.js"),
    read("desktop/ipc/content-submission-ipc.js"),
  ].join("\n");

  for (const channel of DEAD_CHANNELS) {
    assert.equal(boundarySource.includes(channel), false, channel);
  }

  for (const preloadMethod of [
    "getClient: function",
    "getResearch: function",
    "getGeneratedArticle: function",
    "getSubmissionBatch: function",
  ]) {
    assert.equal(boundarySource.includes(preloadMethod), false, preloadMethod);
  }
});

const fs = require("node:fs");
const mammoth = require("mammoth");
const { loadPlatforms } = require("../../src/core/platforms");
const { assertPlaywrightAvailable } = require("./playwright-capability");
const { createPlatformSessionService } = require("./platform-session-service");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");
const {
  projectPlatformQueue,
  projectPlatformSnapshot,
} = require("../ipc/contracts/platform-contracts");

function diagnose(code, action) {
  reportDiagnostic({
    code,
    module: "platform-workbench-application",
    category: "validation",
    operationId: "platform-workbench-application",
    metadata: { action },
  });
}

function createPlatformWorkbenchApplication(options) {
  const values = options || {};
  const loadedPlatforms = values.loadedPlatforms || loadPlatforms();
  const adapters = {};
  loadedPlatforms.forEach((platform) => { adapters[platform.id] = platform; });
  const ensurePlaywright = typeof values.assertPlaywrightAvailable === "function"
    ? values.assertPlaywrightAvailable
    : () => assertPlaywrightAvailable(values.runtimeDiagnosticsService);
  const platformSessionService = values.platformSessionService || createPlatformSessionService({
    adapters,
    assertPlaywrightAvailable: ensurePlaywright,
  });
  const workbenchService = values.platformWorkbenchService;
  if (!workbenchService) throw new Error("Platform application requires the workspace ContentStore service");

  async function getQueue() {
    const nonMedia = loadedPlatforms.filter((platform) => platform.id !== "media");
    const grouped = workbenchService.scanQueue();
    const queue = [];
    for (const group of grouped) {
      for (const article of group.articles || []) {
        let title = article.title;
        if (article.filename && article.filename.toLowerCase().endsWith(".docx")) {
          try {
            const docxResult = await mammoth.extractRawText({ buffer: fs.readFileSync(article.filePath || article.file) });
            for (const line of String((docxResult && docxResult.value) || "").split(/\n/)) {
              const candidate = line.replace(/^#+\s*/, "").trim();
              if (candidate) {
                title = candidate.length > 60 ? candidate.substring(0, 60) + "..." : candidate;
                break;
              }
            }
          } catch (_) {
            diagnose("PLATFORM_DOCX_TITLE_PROBE_FAILED", "docx-title");
          }
        }
        queue.push({
          filename: article.filename,
          title,
          platformId: group.platformId,
          sourcePlatformId: group.platformId,
          sourceArticleState: article.sourceArticleState || "active",
          reasonCode: article.reasonCode || null,
          accountProfileId: typeof article.accountProfileId === "string" ? article.accountProfileId : "",
          archiveError: article.archiveError || null,
          remoteStatus: article.remoteStatus || null,
        });
      }
    }
    return projectPlatformQueue({
      platforms: nonMedia.map((platform) => ({
        id: platform.id,
        loginAvailable: platformSessionService.supports(platform.id),
      })),
      queue,
    });
  }

  return Object.freeze({
    getQueue,
    openLogin: (input) => platformSessionService.openLogin(input.platformId),
    checkLogin: (input) => platformSessionService.checkLogin(input.platformId),
    pauseSubmit: (input) => {
      const result = (values.taskService || {}).pausePlatformSubmit(input && input.runId) || {};
      return { accepted: result.ok === true, alreadyStopped: result.alreadyStopped === true };
    },
    stopSubmit: (input) => {
      const result = (values.taskService || {}).stopPlatformSubmit(input && input.runId) || {};
      return { accepted: result !== false && result.alreadyStopped !== true, alreadyStopped: result.alreadyStopped === true };
    },
    getState: () => projectPlatformSnapshot((values.taskService || {}).getState()),
  });
}

module.exports = { createPlatformWorkbenchApplication };

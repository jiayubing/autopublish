const fs = require("node:fs");
const mammoth = require("mammoth");
const { loadPlatforms } = require("../../src/core/platforms");
const {
  validatePlatformSubmission,
  inputError,
} = require("./submission-boundary");
const { assertPlaywrightAvailable } = require("./playwright-capability");
const { createPlatformSessionService } = require("./platform-session-service");
const {
  projectPlatformQueue,
  projectPlatformSnapshot,
  projectPlatformSubmitResult,
} = require("../ipc/contracts/platform-contracts");

function emptyTrashSummary() {
  return {
    offeredCount: 0,
    requestedCount: 0,
    movedCount: 0,
    recoveryCount: 0,
    blockedCount: 0,
    failedCount: 0,
    reasonCodes: [],
  };
}

function addTrashReason(summary, code) {
  if (!summary.reasonCodes.includes(code)) summary.reasonCodes.push(code);
}

function taskGroupKey(task) {
  return `${task && task.sourcePlatformId}\u0000${task && task.filename}`;
}

function projectAutoTrash(plan, results) {
  const summary = emptyTrashSummary();
  const groups = new Map();
  for (const task of (plan && plan.tasks) || []) {
    const key = taskGroupKey(task);
    if (!groups.has(key)) groups.set(key, { tasks: [], results: [], jobs: new Map() });
    groups.get(key).tasks.push(task);
  }
  (results || []).forEach((result, index) => {
    const task = result.task || ((plan && plan.tasks) || [])[index] || {};
    const group = groups.get(taskGroupKey(task));
    if (!group) return;
    group.results.push(result);
    for (const job of result.postProcessing || []) {
      if (taskGroupKey(job) !== taskGroupKey(task)) continue;
      group.jobs.set(`${job.batchId || ""}\u0000${job.jobId || ""}`, job);
    }
  });

  let allSucceeded = groups.size > 0;
  groups.forEach((group) => {
    const expectedBatchId = group.tasks[0] && group.tasks[0].postProcessingPayload && group.tasks[0].postProcessingPayload.batchId;
    const jobs = Array.from(group.jobs.values()).filter(
      (job) => !expectedBatchId || !job.batchId || job.batchId === expectedBatchId,
    );
    const published = group.results.length === group.tasks.length &&
      group.results.every((result) => result.status === "published");
    const autoResults = jobs.map((job) => job.output && job.output.autoTrash).filter(Boolean);
    const archived = jobs.length >= group.tasks.length && jobs.every((job) => job.status === "completed");
    if (!published) {
      allSucceeded = false;
      summary.blockedCount += 1;
      addTrashReason(summary, "REMOVAL_BLOCKED");
      return;
    }
    if (!archived) {
      if (autoResults.some((value) => ["failed", "needs_repair"].includes(value.status))) {
        allSucceeded = false;
        summary.failedCount += 1;
        addTrashReason(summary, "REMOVAL_NEEDS_REPAIR");
      } else if (autoResults.some((value) => value.status === "blocked")) {
        allSucceeded = false;
        summary.blockedCount += 1;
        addTrashReason(summary, autoResults.find((value) => value.status === "blocked").reasonCode === "IDENTITY_MISSING" ? "IDENTITY_MISSING" : "REMOVAL_BLOCKED");
      } else {
        allSucceeded = false;
        summary.blockedCount += 1;
        addTrashReason(summary, "REMOVAL_BLOCKED");
      }
      return;
    }
    summary.offeredCount += 1;
    summary.requestedCount += 1;
    if (autoResults.some((value) => ["failed", "needs_repair"].includes(value.status))) {
      allSucceeded = false;
      summary.failedCount += 1;
      addTrashReason(summary, "REMOVAL_NEEDS_REPAIR");
    } else if (autoResults.some((value) => value.status === "blocked")) {
      allSucceeded = false;
      summary.blockedCount += 1;
      addTrashReason(summary, autoResults.find((value) => value.status === "blocked").reasonCode === "IDENTITY_MISSING" ? "IDENTITY_MISSING" : "REMOVAL_BLOCKED");
    } else if (autoResults.some((value) => value.status === "committed")) {
      summary.movedCount += 1;
    } else if (autoResults.some((value) => ["pending_auto_recovery", "pending_recovery"].includes(value.status))) {
      summary.recoveryCount += 1;
    } else {
      allSucceeded = false;
      summary.blockedCount += 1;
      addTrashReason(summary, autoResults[0] && autoResults[0].reasonCode === "IDENTITY_MISSING" ? "IDENTITY_MISSING" : "REMOVAL_BLOCKED");
    }
  });
  if (allSucceeded && summary.movedCount + summary.recoveryCount === summary.requestedCount)
    return { disposition: "auto_trash_requested", summary };
  return { disposition: "auto_trash_blocked", summary };
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
          } catch (_) {}
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

  async function submitSelected(input) {
    const raw = Array.isArray(input) ? input : input && Array.isArray(input.submissions) ? input.submissions : [input];
    if (!raw.length) throw inputError();
    ensurePlaywright();
    const plan = workbenchService.buildSelectedSubmissionsPlan(raw.map(validatePlatformSubmission));
    const autoTrash = Boolean(input && input.autoTrash === true);
    if (!values.publicationSubmissionService || typeof values.publicationSubmissionService.submit !== "function") {
      const error = new Error("Publication workflow is unavailable");
      error.code = "PUBLICATION_WORKFLOW_UNAVAILABLE";
      throw error;
    }
    const execution = await values.publicationSubmissionService.submit(plan, { autoTrash });
    const results = (execution.results || []).map((result, index) => Object.assign({ task: plan.tasks[index] }, result));
    const trash = autoTrash ? projectAutoTrash(plan, results) : { disposition: "keep_local", summary: emptyTrashSummary() };
    return projectPlatformSubmitResult({
      ok: results.filter((result) => ["published", "submitted"].includes(result.status)).length,
      fail: results.filter((result) => result.status === "failed").length,
      uncertain: results.filter((result) => result.status === "uncertain").length,
      skipped: 0,
      results,
      archiveSummary: { attempted: 0, succeeded: 0, failed: 0 },
      trashDisposition: trash.disposition,
      trashSummary: trash.summary,
    });
  }

  return Object.freeze({
    getQueue,
    openLogin: (input) => platformSessionService.openLogin(input.platformId),
    checkLogin: (input) => platformSessionService.checkLogin(input.platformId),
    submitSelected,
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

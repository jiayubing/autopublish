const mammoth = require("mammoth");
const { loadPlatforms } = require("../../src/core/platforms");
const { wrap } = require("../services/ipc-response");
const {
  validatePlatformSubmission,
  inputError,
} = require("../services/submission-boundary");
const {
  assertPlaywrightAvailable,
} = require("../services/playwright-capability");
const {
  createPlatformSessionService,
} = require("../services/platform-session-service");
const {
  projectPlatformQueue,
  projectPlatformSnapshot,
  projectPlatformSubmitResult,
} = require("./contracts/platform-contracts");

function registerPlatformIpc(deps) {
  const values = deps || {};
  const ipcMain = values.ipcMain;
  const taskService = values.taskService;
  const loadedPlatforms = values.loadedPlatforms || loadPlatforms();
  const adapters = {};
  loadedPlatforms.forEach((platform) => {
    adapters[platform.id] = platform;
  });
  const platformSessionService =
    values.platformSessionService ||
    createPlatformSessionService({
      adapters,
      assertPlaywrightAvailable: () =>
        assertPlaywrightAvailable(values.runtimeDiagnosticsService),
    });
  const service = values.platformWorkbenchService;
  if (!service)
    throw new Error("Platform IPC requires the workspace ContentStore service");

  function buildPlanFromSubmissions(input) {
    if (!Array.isArray(input) || !input.length) throw inputError();
    return service.buildSelectedSubmissionsPlan(
      input.map(validatePlatformSubmission),
    );
  }

  function submissionValues(input) {
    if (Array.isArray(input)) return input;
    if (input && Array.isArray(input.submissions)) return input.submissions;
    return [input];
  }

  function trashSummary() {
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
    if (summary.reasonCodes.indexOf(code) === -1)
      summary.reasonCodes.push(code);
  }

  function taskGroupKey(task) {
    return `${task && task.sourcePlatformId}\u0000${task && task.filename}`;
  }

  function projectAutoTrash(plan, results) {
    const summary = trashSummary();
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
        const jobKey = `${job.batchId || ""}\u0000${job.jobId || ""}`;
        group.jobs.set(jobKey, job);
      }
    });

    let allSucceeded = groups.size > 0;
    groups.forEach((group) => {
      const expectedBatchId =
        group.tasks[0] &&
        group.tasks[0].postProcessingPayload &&
        group.tasks[0].postProcessingPayload.batchId;
      const jobs = Array.from(group.jobs.values()).filter(
        (job) => !expectedBatchId || !job.batchId || job.batchId === expectedBatchId,
      );
      const published =
        group.results.length === group.tasks.length &&
        group.results.every((result) => result.status === "published");
      const autoResults = jobs
        .map((job) => job.output && job.output.autoTrash)
        .filter(Boolean);
      const archived =
        jobs.length >= group.tasks.length &&
        jobs.every((job) => job.status === "completed");
      if (!published) {
        allSucceeded = false;
        summary.blockedCount += 1;
        addTrashReason(summary, "REMOVAL_BLOCKED");
        return;
      }
      if (!archived) {
        if (
          autoResults.some((value) =>
            ["failed", "needs_repair"].includes(value.status),
          )
        ) {
          allSucceeded = false;
          summary.failedCount += 1;
          addTrashReason(summary, "REMOVAL_NEEDS_REPAIR");
        } else if (autoResults.some((value) => value.status === "blocked")) {
          allSucceeded = false;
          summary.blockedCount += 1;
          addTrashReason(
            summary,
            autoResults.find((value) => value.status === "blocked")
              .reasonCode === "IDENTITY_MISSING"
              ? "IDENTITY_MISSING"
              : "REMOVAL_BLOCKED",
          );
        } else {
          allSucceeded = false;
          summary.blockedCount += 1;
          addTrashReason(summary, "REMOVAL_BLOCKED");
        }
        return;
      }
      summary.offeredCount += 1;
      summary.requestedCount += 1;
      if (
        autoResults.some((value) =>
          ["failed", "needs_repair"].includes(value.status),
        )
      ) {
        allSucceeded = false;
        summary.failedCount += 1;
        addTrashReason(summary, "REMOVAL_NEEDS_REPAIR");
      } else if (autoResults.some((value) => value.status === "blocked")) {
        allSucceeded = false;
        summary.blockedCount += 1;
        addTrashReason(
          summary,
          autoResults.find((value) => value.status === "blocked")
            .reasonCode === "IDENTITY_MISSING"
            ? "IDENTITY_MISSING"
            : "REMOVAL_BLOCKED",
        );
      } else if (autoResults.some((value) => value.status === "committed")) {
        summary.movedCount += 1;
      } else if (
        autoResults.some((value) =>
          ["pending_auto_recovery", "pending_recovery"].includes(value.status),
        )
      ) {
        summary.recoveryCount += 1;
      } else {
        allSucceeded = false;
        summary.blockedCount += 1;
        addTrashReason(
          summary,
          autoResults[0] && autoResults[0].reasonCode === "IDENTITY_MISSING"
            ? "IDENTITY_MISSING"
            : "REMOVAL_BLOCKED",
        );
      }
    });
    if (
      allSucceeded &&
      summary.movedCount + summary.recoveryCount === summary.requestedCount
    )
      return { disposition: "auto_trash_requested", summary };
    return { disposition: "auto_trash_blocked", summary };
  }

  function loginPlatformId(input) {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).length !== 1 ||
      typeof input.platformId !== "string" ||
      !input.platformId ||
      input.platformId.trim() !== input.platformId
    )
      throw inputError(
        "PLATFORM_LOGIN_INPUT_INVALID",
        "Platform login input is invalid",
      );
    return input.platformId;
  }

  ipcMain.handle("platforms:get-queue", function () {
    return wrap(async function () {
      const nonMedia = loadedPlatforms.filter(
        (platform) => platform.id !== "media",
      );
      const grouped = service.scanQueue();
      const flat = [];
      for (const group of grouped) {
        for (const article of group.articles || []) {
          let title = article.title;
          if (
            article.filename &&
            article.filename.toLowerCase().endsWith(".docx")
          ) {
            try {
              const docxResult = await mammoth.extractRawText({
                buffer: require("node:fs").readFileSync(
                  article.filePath || article.file,
                ),
              });
              const rawText = String((docxResult && docxResult.value) || "");
              for (const line of rawText.split(/\n/)) {
                const candidate = line.replace(/^#+\s*/, "").trim();
                if (candidate) {
                  title =
                    candidate.length > 60
                      ? candidate.substring(0, 60) + "..."
                      : candidate;
                  break;
                }
              }
            } catch (_) {
              // Keep the queue reader's filename fallback.
            }
          }
          flat.push({
            filename: article.filename,
            title,
            platformId: group.platformId,
            sourcePlatformId: group.platformId,
            sourceArticleState: article.sourceArticleState || "active",
            reasonCode: article.reasonCode || null,
            accountProfileId:
              typeof article.accountProfileId === "string"
                ? article.accountProfileId
                : "",
            archiveError: article.archiveError || null,
            remoteStatus: article.remoteStatus || null,
          });
        }
      }
      return projectPlatformQueue({
        platforms: nonMedia.map((platform) => ({
          id: platform.id,
          scanDir: platform.scanDir,
          loginAvailable: platformSessionService.supports(platform.id),
        })),
        queue: flat,
      });
    });
  });

  ipcMain.handle("platforms:open-login", function (event, input) {
    return wrap(async function () {
      return platformSessionService.openLogin(loginPlatformId(input));
    });
  });

  ipcMain.handle("platforms:check-login", function (event, input) {
    return wrap(async function () {
      return platformSessionService.checkLogin(loginPlatformId(input));
    });
  });

  ipcMain.handle("platforms:submit-selected", function (event, input) {
    return wrap(async function () {
      assertPlaywrightAvailable(deps.runtimeDiagnosticsService);
      const plan = buildPlanFromSubmissions(submissionValues(input));
      const autoTrashRequested = Boolean(input && input.autoTrash === true);
      if (
        !deps.publicationSubmissionService ||
        typeof deps.publicationSubmissionService.submit !== "function"
      ) {
        const error = new Error("Publication workflow is unavailable");
        error.code = "PUBLICATION_WORKFLOW_UNAVAILABLE";
        throw error;
      }
      const execution = await deps.publicationSubmissionService.submit(plan, {
        autoTrash: autoTrashRequested,
      });
      const results = (execution.results || []).map((result, index) =>
        Object.assign({ task: plan.tasks[index] }, result),
      );
      const trash = autoTrashRequested
        ? projectAutoTrash(plan, results)
        : {
            disposition: "keep_local",
            summary: trashSummary(),
          };
      return projectPlatformSubmitResult({
        ok: results.filter((result) =>
          ["published", "submitted"].includes(result.status),
        ).length,
        fail: results.filter((result) => result.status === "failed").length,
        uncertain: results.filter((result) => result.status === "uncertain")
          .length,
        skipped: 0,
        results,
        // These are neutral projection fields kept for the typed IPC contract;
        // archive remains owned by the publication post-processor and the
        // optional trash disposition is projected from its durable result.
        archiveSummary: { attempted: 0, succeeded: 0, failed: 0 },
        trashDisposition: trash.disposition,
        trashSummary: trash.summary,
      });
    });
  });

  ipcMain.handle("platforms:pause-submit", function (event, input) {
    return wrap(function () {
      const result =
        taskService.pausePlatformSubmit(input && input.runId) || {};
      return {
        accepted: result.ok === true,
        alreadyStopped: result.alreadyStopped === true,
      };
    });
  });

  ipcMain.handle("platforms:stop-submit", function (event, input) {
    return wrap(function () {
      const result = taskService.stopPlatformSubmit(input && input.runId) || {};
      return {
        accepted: result !== false && result.alreadyStopped !== true,
        alreadyStopped: result.alreadyStopped === true,
      };
    });
  });

  ipcMain.handle("platforms:get-state", function () {
    return wrap(function () {
      return projectPlatformSnapshot(taskService.getState());
    });
  });
  return { service };
}

module.exports = { registerPlatformIpc };

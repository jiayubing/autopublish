const mammoth = require("mammoth");
const { loadPlatforms } = require("../../src/core/platforms");
const {
  createPlatformWorkbenchService,
} = require("../services/platform-workbench-service");
const { wrap } = require("../services/ipc-response");
const {
  validatePlatformSubmission,
  inputError,
} = require("../services/submission-boundary");
const {
  assertPlaywrightAvailable,
} = require("../services/playwright-capability");
const { createPlatformSessionService } = require("../services/platform-session-service");

function registerPlatformIpc(deps) {
  var ipcMain = deps.ipcMain;
  var rootDir = deps.rootDir;
  var taskService = deps.taskService;
  var sendToRenderer = deps.sendToRenderer;
  var loadedPlatforms = deps.loadedPlatforms || loadPlatforms();
  var adapters = {};
  loadedPlatforms.forEach(function (platform) {
    adapters[platform.id] = platform;
  });
  var platformSessionService = deps.platformSessionService || createPlatformSessionService({ adapters: adapters, assertPlaywrightAvailable: function() { assertPlaywrightAvailable(deps.runtimeDiagnosticsService); } });
  var service =
    deps.platformWorkbenchService ||
    createPlatformWorkbenchService({
      rootDir: rootDir,
      paths: deps.paths,
      platforms: loadedPlatforms.map(function (platform) {
        return { id: platform.id, scanDir: platform.scanDir };
      }),
      adapters: adapters,
    });

  function buildPlanFromSubmissions(values) {
    if (!Array.isArray(values) || !values.length) throw inputError();
    var submissions = values.map(validatePlatformSubmission);
    return service.buildSelectedSubmissionsPlan(submissions);
  }

  function submissionValues(input) {
    if (Array.isArray(input)) return input;
    if (input && Array.isArray(input.submissions)) return input.submissions;
    return [input];
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

  function removalReasonCode(value, fallback) {
    var code = value && (value.reasonCode || value.code || value.errorCode);
    if (typeof code !== "string") return fallback;
    if (code === "IDENTITY_MISSING") return code;
    if (
      code.indexOf("REPAIR") !== -1 ||
      code.indexOf("STALE") !== -1 ||
      code.indexOf("RECOVERY") !== -1
    )
      return "REMOVAL_NEEDS_REPAIR";
    return "REMOVAL_BLOCKED";
  }

  function addRemovalReason(summary, reasonCode) {
    if (!Array.isArray(summary.reasonCodes)) summary.reasonCodes = [];
    if (summary.reasonCodes.indexOf(reasonCode) === -1)
      summary.reasonCodes.push(reasonCode);
  }

  function identityForGroup(group, identities) {
    var values = group.tasks.map(function (task) {
      return identities && identities.get(service.taskKey(task));
    });
    if (
      !values.length ||
      values.some(function (value) {
        return !value || !value.clientId || !value.articleId;
      })
    )
      return null;
    var first = values[0];
    if (
      values.some(function (value) {
        return (
          value.clientId !== first.clientId ||
          value.articleId !== first.articleId
        );
      })
    )
      return null;
    return { clientId: first.clientId, articleId: first.articleId };
  }

  async function applyPostPublishDisposition(
    data,
    plan,
    requested,
    identities,
  ) {
    var results = data && Array.isArray(data.results) ? data.results : [];
    var summary = {
      offeredCount: 0,
      requestedCount: 0,
      movedCount: 0,
      recoveryCount: 0,
      blockedCount: 0,
      failedCount: 0,
      reasonCodes: [],
    };
    if (!results.length)
      return Object.assign(data, {
        trashDisposition: "keep_local",
        trashSummary: summary,
      });

    var groups = new Map();
    var plannedTasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
    plannedTasks.forEach(function (rawTask) {
      var task = rawTask;
      var key = task.sourcePlatformId + "\0" + task.filename;
      if (!groups.has(key)) groups.set(key, { tasks: [], results: [] });
      groups.get(key).tasks.push(task);
    });
    results.forEach(function (item) {
      var task = (item && item.task) || {};
      var key = task.sourcePlatformId + "\0" + task.filename;
      if (!groups.has(key)) groups.set(key, { tasks: [], results: [] });
      groups.get(key).results.push(item);
    });

    var eligibleGroups = [];
    groups.forEach(function (group) {
      if (!group.tasks.length) return;
      var hasPublished = group.results.some(function (item) {
        return item.publicationStatus === "published";
      });
      if (!hasPublished) return;
      var complete =
        group.results.length === group.tasks.length &&
        group.tasks.every(function (task) {
          var matches = group.results.filter(function (item) {
            var resultTask = (item && item.task) || {};
            return resultTask.targetPlatformId === task.targetPlatformId;
          });
          return (
            matches.length === 1 &&
            matches[0].publicationStatus === "published" &&
            !matches[0].archiveError
          );
        });
      if (!complete) {
        if (requested) {
          summary.blockedCount += 1;
          addRemovalReason(summary, "REMOVAL_BLOCKED");
        }
        return;
      }
      summary.offeredCount += 1;
      eligibleGroups.push(group);
    });

    if (!requested) {
      delete summary.reasonCodes;
      return Object.assign(data, {
        trashDisposition: summary.offeredCount ? "offer_trash" : "keep_local",
        trashSummary: summary,
      });
    }

    if (!eligibleGroups.length) {
      addRemovalReason(summary, "REMOVAL_BLOCKED");
      return Object.assign(data, {
        trashDisposition: "auto_trash_blocked",
        trashSummary: summary,
      });
    }

    var removalAvailable =
      deps.aiContentService &&
      typeof deps.aiContentService.previewArticleRemovalImpact === "function" &&
      typeof deps.aiContentService.trashArticles === "function";
    var refreshNeeded = false;
    for (var group of eligibleGroups) {
      summary.requestedCount += 1;
      var selection = identityForGroup(group, identities);
      if (!selection) {
        summary.blockedCount += 1;
        addRemovalReason(summary, "IDENTITY_MISSING");
        continue;
      }
      if (!removalAvailable) {
        summary.blockedCount += 1;
        addRemovalReason(summary, "REMOVAL_BLOCKED");
        continue;
      }
      try {
        var preview = deps.aiContentService.previewArticleRemovalImpact({
          selections: [selection],
        });
        if (!preview || preview.canCommit !== true) {
          summary.blockedCount += 1;
          addRemovalReason(
            summary,
            removalReasonCode(preview, "REMOVAL_BLOCKED"),
          );
          continue;
        }
        var committed = deps.aiContentService.trashArticles({
          selections: [selection],
          token: preview.token,
          confirmed: true,
        });
        if (committed && committed.status === "committed") {
          summary.movedCount += 1;
          refreshNeeded = true;
        } else if (
          committed &&
          (committed.status === "pending_auto_recovery" ||
            committed.status === "pending_recovery")
        ) {
          summary.recoveryCount += 1;
          refreshNeeded = true;
        } else if (committed && committed.status === "needs_repair") {
          summary.blockedCount += 1;
          refreshNeeded = true;
          addRemovalReason(summary, "REMOVAL_NEEDS_REPAIR");
        } else {
          summary.blockedCount += 1;
          addRemovalReason(summary, "REMOVAL_BLOCKED");
        }
      } catch (error) {
        summary.failedCount += 1;
        addRemovalReason(
          summary,
          removalReasonCode(error, "REMOVAL_NEEDS_REPAIR"),
        );
      }
    }

    if (refreshNeeded && typeof deps.invalidateData === "function") {
      try {
        deps.invalidateData("PLATFORM_AUTO_TRASH_APPLIED");
      } catch (_) {}
    }
    var accepted =
      summary.movedCount + summary.recoveryCount === summary.requestedCount &&
      summary.blockedCount === 0 &&
      summary.failedCount === 0;
    return Object.assign(data, {
      trashDisposition: accepted
        ? "auto_trash_requested"
        : "auto_trash_blocked",
      trashSummary: summary,
    });
  }

  ipcMain.handle("platforms:get-queue", function () {
    return wrap(async function () {
      var nonMedia = loadedPlatforms.filter(function (platform) {
        return platform.id !== "media";
      });
      var grouped = service.scanQueue();
      var flat = [];
      for (var g = 0; g < grouped.length; g++) {
        var group = grouped[g];
        var articles = group.articles || [];
        for (var a = 0; a < articles.length; a++) {
          var article = articles[a];
          var title = article.title;
          if (
            article.filename &&
            article.filename.toLowerCase().endsWith(".docx")
          ) {
            try {
              var docxResult = await mammoth.extractRawText({
                buffer: require("fs").readFileSync(
                  article.filePath || article.file,
                ),
              });
              var rawText = String((docxResult && docxResult.value) || "");
              var textLines = rawText.split(/\n/);
              for (var li = 0; li < textLines.length; li++) {
                var line = textLines[li].replace(/^#+\s*/, "").trim();
                if (line) {
                  title =
                    line.length > 60 ? line.substring(0, 60) + "..." : line;
                  break;
                }
              }
            } catch (_) {
              /* keep filename fallback */
            }
          }
          flat.push({
            filename: article.filename,
            title: title,
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
      return {
        platforms: nonMedia.map(function (platform) {
          return {
            id: platform.id,
            scanDir: platform.scanDir,
            loginAvailable: platformSessionService.supports(platform.id),
          };
        }),
        queue: flat,
      };
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
      var plan = buildPlanFromSubmissions(submissionValues(input));
      if (
        !deps.publicationSubmissionService ||
        typeof deps.publicationSubmissionService.submit !== "function"
      ) {
        var unavailable = new Error("Publication workflow is unavailable");
        unavailable.code = "PUBLICATION_WORKFLOW_UNAVAILABLE";
        throw unavailable;
      }
      var execution = await deps.publicationSubmissionService.submit(plan);
      var results = (execution.results || []).map(function (result, index) {
        return Object.assign({ task: plan.tasks[index] }, result);
      });
      return {
        ok: results.filter(function (result) {
          return result.status === "published" || result.status === "submitted";
        }).length,
        fail: results.filter(function (result) {
          return result.status === "failed";
        }).length,
        uncertain: results.filter(function (result) {
          return result.status === "uncertain";
        }).length,
        skipped: 0,
        results: results,
        archiveSummary: { attempted: 0, succeeded: 0, failed: 0 },
        trashDisposition: "keep_local",
        trashSummary: {
          offeredCount: 0,
          requestedCount: 0,
          movedCount: 0,
          recoveryCount: 0,
          blockedCount: 0,
          failedCount: 0,
        },
      };
    });
  });

  ipcMain.handle("platforms:pause-submit", function (event, input) {
    return wrap(function () {
      return taskService.pausePlatformSubmit(input && input.runId);
    });
  });

  ipcMain.handle("platforms:stop-submit", function (event, input) {
    return wrap(function () {
      return taskService.stopPlatformSubmit(input && input.runId);
    });
  });

  ipcMain.handle("platforms:get-state", function () {
    return wrap(function () {
      return taskService.getState();
    });
  });
  return { service: service };
}

module.exports = { registerPlatformIpc };

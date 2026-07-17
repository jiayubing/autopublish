const mammoth = require("mammoth");
const { loadPlatforms } = require("../../src/core/platforms");
const { createPlatformWorkbenchService } = require("../services/platform-workbench-service");
const { wrap } = require("../services/ipc-response");
const { validatePlatformSubmission, inputError } = require("../services/submission-boundary");
const { assertPlaywrightAvailable } = require("../services/playwright-capability");

function registerPlatformIpc(deps) {
  var ipcMain = deps.ipcMain;
  var rootDir = deps.rootDir;
  var taskService = deps.taskService;
  var sendToRenderer = deps.sendToRenderer;
  var loadedPlatforms = loadPlatforms();
  var adapters = {};
  loadedPlatforms.forEach(function(platform) {
    adapters[platform.id] = platform;
  });
  var service = createPlatformWorkbenchService({
    rootDir: rootDir,
    paths: deps.paths,
    platforms: loadedPlatforms.map(function(platform) {
      return { id: platform.id, scanDir: platform.scanDir };
    }),
    adapters: adapters
  });

  function buildPlanFromSubmission(value) {
    var submission = validatePlatformSubmission(value);
    return service.buildSelectedPlan({
      selectedArticles: [{ sourcePlatformId: submission.sourcePlatformId, filename: submission.filename }],
      targetPlatformIds: submission.targetPlatformIds
    });
  }

  function buildPlanFromSubmissions(values) {
    if (!Array.isArray(values) || !values.length) throw inputError();
    var tasks = [];
    values.forEach(function(value) {
      tasks = tasks.concat(buildPlanFromSubmission(value).tasks);
    });
    return { taskCount: tasks.length, tasks: tasks };
  }

  ipcMain.handle("platforms:get-queue", function() {
    return wrap(async function() {
      var nonMedia = loadedPlatforms.filter(function(platform) {
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
          if (article.filename && article.filename.toLowerCase().endsWith(".docx")) {
            try {
              var docxResult = await mammoth.extractRawText({ buffer: require("fs").readFileSync(article.filePath || article.file) });
              var rawText = String(docxResult && docxResult.value || "");
              var textLines = rawText.split(/\n/);
              for (var li = 0; li < textLines.length; li++) {
                var line = textLines[li].replace(/^#+\s*/, "").trim();
                if (line) {
                  title = line.length > 60 ? line.substring(0, 60) + "..." : line;
                  break;
                }
              }
            } catch (_) { /* keep filename fallback */ }
          }
          flat.push({
            filename: article.filename,
            filePath: article.filePath || article.file,
            title: title,
            platformId: group.platformId,
            sourcePlatformId: group.platformId,
            sourceArticle: article
          });
        }
      }
      return {
        platforms: nonMedia.map(function(platform) {
          return { id: platform.id, scanDir: platform.scanDir };
        }),
        queue: flat
      };
    });
  });

  ipcMain.handle("platforms:build-selected-plan", function(event, input) {
    return wrap(function() {
      return buildPlanFromSubmission(input);
    });
  });

  ipcMain.handle("platforms:submit-selected-plan", function(event, input) {
    return wrap(async function() {
      assertPlaywrightAvailable(deps.runtimeDiagnosticsService);
      var plan = Array.isArray(input) ? buildPlanFromSubmissions(input) : buildPlanFromSubmission(input);
      var workerResult = await taskService.startPlatformSubmit(plan, {
        onLog: function(entry) {
          sendToRenderer("publish-log", entry);
        }
      });
      if (!workerResult || !workerResult.ok) {
        throw new Error(workerResult && workerResult.error ? workerResult.error : "Platform publish failed");
      }
      var data = workerResult.data || { ok: 0, fail: 0, skipped: 0, results: [] };
      data.skipped = data.skipped || data.pending || 0;
      return data;
    });
  });

  ipcMain.handle("platforms:pause-submit", function() {
    return wrap(function() {
      return taskService.pausePlatformSubmit();
    });
  });

  ipcMain.handle("platforms:stop-submit", function() {
    return wrap(function() {
      return taskService.stopPlatformSubmit();
    });
  });

  ipcMain.handle("platforms:get-state", function() {
    return wrap(function() {
      return taskService.getState();
    });
  });
}

module.exports = { registerPlatformIpc };

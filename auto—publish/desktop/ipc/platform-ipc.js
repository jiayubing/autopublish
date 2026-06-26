const { loadPlatforms } = require("../../src/core/platforms");
const { createPlatformWorkbenchService } = require("../services/platform-workbench-service");
const { wrap } = require("../services/ipc-response");

function registerPlatformIpc(deps) {
  var ipcMain = deps.ipcMain;
  var rootDir = deps.rootDir;
  var loadedPlatforms = loadPlatforms();
  var adapters = {};
  loadedPlatforms.forEach(function(platform) {
    adapters[platform.id] = platform;
  });
  var service = createPlatformWorkbenchService({
    rootDir: rootDir,
    platforms: loadedPlatforms.map(function(platform) {
      return { id: platform.id, scanDir: platform.scanDir };
    }),
    adapters: adapters
  });

  ipcMain.handle("platforms:get-queue", function() {
    return wrap(function() {
      var nonMedia = loadedPlatforms.filter(function(platform) {
        return platform.id !== "media";
      });
      var grouped = service.scanQueue();
      var flat = [];
      grouped.forEach(function(group) {
        var articles = group.articles || [];
        articles.forEach(function(article) {
          flat.push({
            filename: article.filename,
            filePath: article.filePath || article.file,
            title: article.title,
            platformId: group.platformId,
            sourcePlatformId: group.platformId,
            sourceArticle: article
          });
        });
      });
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
      var mapped = {
        selectedArticles: input.articles || input.selectedArticles || [],
        targetPlatformIds: input.platformIds || input.targetPlatformIds || []
      };
      return service.buildSelectedPlan(mapped);
    });
  });

  ipcMain.handle("platforms:submit-selected-plan", function(event, plan) {
    return wrap(function() {
      return service.submitSelectedPlanSerially(plan || { tasks: [] }, {
        autoSubmit: true,
        interactive: false
      }).then(function(result) {
        result.skipped = result.skipped || result.pending || 0;
        return result;
      });
    });
  });
}

module.exports = { registerPlatformIpc };
const fs = require("fs");
const path = require("path");

function firstTitle(raw, fallback) {
  var lines = String(raw || "").split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/^#+\s*/, "").trim();
    if (line) return line;
  }
  return fallback;
}

function createPlatformWorkbenchService(opts) {
  var options = opts || {};
  var rootDir = options.rootDir || path.resolve(__dirname, "..", "..");
  var platforms = options.platforms || [];
  var adapters = options.adapters || {};

  function scanQueue() {
    return platforms.filter(function(platform) {
      return platform.id !== "media";
    }).map(function(platform) {
      var platformId = platform.id;
      var scanDir = platform.scanDir || platform.id;
      var inputDir = path.join(rootDir, "input", scanDir);
      var articles = [];
      if (fs.existsSync(inputDir)) {
        articles = fs.readdirSync(inputDir).filter(function(name) {
          return name !== ".gitkeep" && name.indexOf("~$") !== 0;
        }).map(function(filename) {
          var filePath = path.join(inputDir, filename);
          var title = path.basename(filename, path.extname(filename));
          if (filename.endsWith(".txt") || filename.endsWith(".md")) {
            title = firstTitle(fs.readFileSync(filePath, "utf-8"), title);
          }
          return {
            filename: filename,
            filePath: filePath,
            file: filePath,
            sourceFile: filePath,
            fileBaseName: path.basename(filename, path.extname(filename)),
            title: title
          };
        });
      }
      return { platformId: platformId, scanDir: scanDir, articles: articles };
    });
  }

  function resolveSelectedFilePath(article) {
    if (article.filePath) return article.filePath;
    var source = platforms.filter(function(platform) {
      return platform.id === article.sourcePlatformId;
    })[0] || { scanDir: article.sourcePlatformId };
    return path.join(rootDir, "input", source.scanDir || source.id, article.filename);
  }

  function buildSelectedPlan(input) {
    var selectedArticles = input.selectedArticles || [];
    var targetPlatformIds = input.targetPlatformIds || [];
    var tasks = [];
    for (var i = 0; i < selectedArticles.length; i++) {
      var filePath = resolveSelectedFilePath(selectedArticles[i]);
      for (var j = 0; j < targetPlatformIds.length; j++) {
        tasks.push({
          sourcePlatformId: selectedArticles[i].sourcePlatformId,
          filename: selectedArticles[i].filename,
          filePath: filePath,
          sourceArticle: Object.assign({}, selectedArticles[i], {
            file: filePath,
            sourceFile: filePath,
            fileBaseName: path.basename(selectedArticles[i].filename, path.extname(selectedArticles[i].filename))
          }),
          targetPlatformId: targetPlatformIds[j]
        });
      }
    }
    return { taskCount: tasks.length, tasks: tasks };
  }

  async function submitSelectedPlanSerially(plan, submitOptions) {
    var opts = submitOptions || {};
    var tasks = plan.tasks || [];
    var results = [];
    for (var i = 0; i < tasks.length; i++) {
      var task = tasks[i];
      var adapter = adapters[task.targetPlatformId];
      if (!adapter) {
        results.push({ task: task, status: "failed", error: "Missing adapter: " + task.targetPlatformId });
        continue;
      }
      try {
        adapter.ensureSession();
        await adapter.ensureLoggedIn({ interactive: opts.interactive, timeoutMs: opts.timeoutMs });
        var sourceArticle = task.sourceArticle || {
          file: task.filePath, filePath: task.filePath, sourceFile: task.filePath,
          filename: task.filename, fileBaseName: path.basename(task.filename, path.extname(task.filename))
        };
        var parsed = adapter.parseArticleFiles
          ? adapter.parseArticleFiles([sourceArticle])
          : [{ sourceFile: sourceArticle.sourceFile, file: sourceArticle.file, filename: sourceArticle.filename, title: sourceArticle.title || sourceArticle.fileBaseName }];
        if (!parsed.length) throw new Error("Article parse returned no publishable article");
        var publishResult = await adapter.publishArticle(parsed[0], {
          autoSubmit: opts.autoSubmit !== false,
          interactive: opts.interactive,
          timeoutMs: opts.timeoutMs
        });
        results.push({ task: task, status: publishResult === "pending" ? "pending" : "success", result: publishResult });
      } catch (error) {
        results.push({ task: task, status: "failed", error: error.message });
      } finally {
        if (adapter.closeSession && opts.closeAfterEach !== false) {
          try { adapter.closeSession(); } catch (_) {}
        }
      }
    }
    return {
      ok: results.filter(function(item) { return item.status === "success"; }).length,
      fail: results.filter(function(item) { return item.status === "failed"; }).length,
      pending: results.filter(function(item) { return item.status === "pending"; }).length,
      results: results
    };
  }

  return { scanQueue: scanQueue, buildSelectedPlan: buildSelectedPlan, submitSelectedPlanSerially: submitSelectedPlanSerially };
}

module.exports = { createPlatformWorkbenchService };

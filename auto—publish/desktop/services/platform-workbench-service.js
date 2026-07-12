const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const { throwIfStopped } = require("../../src/core/operator-flow");

function firstTitle(raw, fallback) {
  var lines = String(raw || "").split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/^#+\s*/, "").trim();
    if (line) return line;
  }
  return fallback;
}

function submissionInputError() {
  var error = new Error("Invalid submission input");
  error.code = "SUBMISSION_INPUT_INVALID";
  return error;
}

function resolvePlatformSubmissionFile(rootDir, platforms, sourcePlatformId, filename) {
  if (typeof sourcePlatformId !== "string" || !sourcePlatformId || typeof filename !== "string" ||
      !filename || filename.trim() !== filename || path.basename(filename) !== filename ||
      path.isAbsolute(filename) || filename.indexOf("/") !== -1 || filename.indexOf("\\") !== -1) {
    throw submissionInputError();
  }
  var source = platforms.filter(function(platform) { return platform.id === sourcePlatformId; })[0];
  if (!source) throw submissionInputError();
  var ext = path.extname(filename).toLowerCase();
  if ([".md", ".txt", ".docx"].indexOf(ext) === -1) throw submissionInputError();
  var inputDir = path.resolve(rootDir, "input", source.scanDir || source.id);
  var filePath = path.resolve(inputDir, filename);
  if (path.dirname(filePath) !== inputDir) throw submissionInputError();
  var stat;
  try { stat = fs.lstatSync(filePath); } catch (_) { throw submissionInputError(); }
  if (!stat.isFile() || stat.isSymbolicLink()) throw submissionInputError();
  return filePath;
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
          if (name === ".gitkeep" || name.indexOf("~$") === 0) return false;
          var stat = fs.statSync(path.join(inputDir, name));
          if (stat.isDirectory()) return false;
          var ext = path.extname(name).toLowerCase();
          var imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'];
          if (imageExts.indexOf(ext) !== -1) return false;
          return true;
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
    return resolvePlatformSubmissionFile(rootDir, platforms, article.sourcePlatformId, article.filename);
  }

  function buildSelectedPlan(input) {
    var selectedArticles = input.selectedArticles || [];
    var targetPlatformIds = input.targetPlatformIds || [];
    if (!Array.isArray(selectedArticles) || !Array.isArray(targetPlatformIds) || targetPlatformIds.length === 0) throw submissionInputError();
    for (var targetIndex = 0; targetIndex < targetPlatformIds.length; targetIndex++) {
      if (typeof targetPlatformIds[targetIndex] !== "string" || !targetPlatformIds[targetIndex] ||
          (!platforms.some(function(platform) { return platform.id === targetPlatformIds[targetIndex] && platform.id !== "media"; }) && !adapters[targetPlatformIds[targetIndex]])) throw submissionInputError();
    }
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
      throwIfStopped();
      var task = tasks[i];
      var adapter = adapters[task.targetPlatformId];
      if (!adapter) {
        results.push({ task: task, status: "failed", error: "Missing adapter: " + task.targetPlatformId });
        continue;
      }
      try {
        adapter.ensureSession();
        await adapter.ensureLoggedIn({ interactive: opts.interactive, timeoutMs: opts.timeoutMs });
        throwIfStopped();

        var sourceArticle = task.sourceArticle || {
          file: task.filePath, filePath: task.filePath, sourceFile: task.filePath,
          filename: task.filename, fileBaseName: path.basename(task.filename, path.extname(task.filename))
        };
        var parsed = adapter.parseArticleFiles
          ? adapter.parseArticleFiles([sourceArticle])
          : await (async function() {
              var article = { sourceFile: sourceArticle.sourceFile, file: sourceArticle.file, filename: sourceArticle.filename, title: sourceArticle.title || sourceArticle.fileBaseName };
              var filePath = sourceArticle.filePath || sourceArticle.file || sourceArticle.sourceFile;
              if (filePath) {
                try {
                  var ext = require("path").extname(filePath).toLowerCase();
                  if (ext === ".txt" || ext === ".md") {
                    var raw = require("fs").readFileSync(filePath, "utf-8");
                    var rawLines = raw.split(/\n/);
                    var bodyStart = 0;
                    for (var li = 0; li < rawLines.length; li++) {
                      if (rawLines[li].replace(/^#+\s*/, "").trim()) {
                        bodyStart = li + 1;
                        break;
                      }
                    }
                    article.body = rawLines.slice(bodyStart).join("\n").trim();
                  } else if (ext === ".docx") {
                    var docxResult = await mammoth.extractRawText({ buffer: require("fs").readFileSync(filePath) });
                    var fullText = String(docxResult && docxResult.value || "");
                    var paraBreak = fullText.indexOf("\n\n");
                    if (paraBreak > 0) {
                      article.body = fullText.substring(paraBreak + 2).trim();
                    } else {
                      var titleLen = Math.min(String(article.title || "").length, 60);
                      article.body = fullText.substring(titleLen).trim();
                    }
                  }
                } catch (_) {}
              }
              var baseName = require("path").basename(article.filename, require("path").extname(article.filename));
              var metaMatch = baseName.match(/^([\u4e00-\u9fa5]+)(\d+)(.+)$/);
              if (metaMatch) {
                article.city = metaMatch[1];
                article.phone = metaMatch[2];
                article.contact = metaMatch[3];
              }
              return [article];
            })();
        if (!parsed.length) throw new Error("Article parse returned no publishable article");
        throwIfStopped();

        var publishResult = await adapter.publishArticle(parsed[0], {
          autoSubmit: opts.autoSubmit !== false,
          interactive: opts.interactive,
          timeoutMs: opts.timeoutMs
        });
        results.push({ task: task, status: publishResult === "pending" ? "pending" : "success", result: publishResult });
      } catch (error) {
        var isStopError = error && error.message && error.message.indexOf("Stop requested") !== -1;
        results.push({ task: task, status: isStopError ? "skipped" : "failed", error: error.message });
        if (isStopError) break;
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
      skipped: results.filter(function(item) { return item.status === "skipped"; }).length,
      results: results
    };
  }

  return { scanQueue: scanQueue, buildSelectedPlan: buildSelectedPlan, submitSelectedPlanSerially: submitSelectedPlanSerially,
    resolveSubmissionFile: function(sourcePlatformId, filename) { return resolvePlatformSubmissionFile(rootDir, platforms, sourcePlatformId, filename); } };
}

module.exports = { createPlatformWorkbenchService };

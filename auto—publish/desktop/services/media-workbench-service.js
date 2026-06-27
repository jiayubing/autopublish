const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const { detectDocxImages, convertArticle } = require("../../src/platforms/media/article-converter");
const { MediaClient } = require("../../src/platforms/media/media-client");
const { resolveApiKey } = require("../../src/platforms/media/config");
const { SubmissionOrderStore } = require("../../src/platforms/media/submission-order-store");

function firstTextLine(raw) {
  var lines = String(raw || "").split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/^#+\s*/, "").trim();
    if (line && line !== "---") return line;
  }
  return "";
}

function normalizePrice(value) {
  if (value == null || value === "") return 0;
  var n = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function isSafeFilename(filename) {
  return typeof filename === "string" &&
    filename.trim() === filename &&
    filename !== "" &&
    path.basename(filename) === filename &&
    !path.isAbsolute(filename) &&
    filename.indexOf("/") === -1 &&
    filename.indexOf("\\") === -1;
}

function readPreviewSource(filePath) {
  var ext = path.extname(filePath).toLowerCase();
  if (ext === ".docx") {
    return mammoth.extractRawText({ buffer: fs.readFileSync(filePath) }).then(function(result) {
      return String(result && result.value || "");
    });
  }
  if (ext === ".txt" || ext === ".md") {
    return Promise.resolve(fs.readFileSync(filePath, "utf-8"));
  }
  return Promise.reject(new Error("unsupported file type: " + ext));
}

function createMediaWorkbenchService(opts) {
  var options = opts || {};
  var inputDir = options.inputDir;
  var draftStore = options.draftStore || { get: function() { return null; } };
  var stopRequested = false;

  async function readAutoTitle(filePath) {
    var ext = path.extname(filePath).toLowerCase();
    if (ext === ".docx") {
      try {
        var result = await mammoth.extractRawText({ buffer: fs.readFileSync(filePath) });
        return firstTextLine(result && result.value);
      } catch (_) { return ""; }
    }
    if (ext === ".txt" || ext === ".md") {
      return firstTextLine(fs.readFileSync(filePath, "utf-8"));
    }
    return "";
  }

  async function scanArticles() {
    if (!fs.existsSync(inputDir)) return [];
    var filenames = fs.readdirSync(inputDir).filter(function(name) {
      if (name.indexOf("~$") === 0) return false;
      if (name === ".gitkeep") return false;
      return name.endsWith(".docx") || name.endsWith(".txt") || name.endsWith(".md");
    });
    var articles = [];
    for (var i = 0; i < filenames.length; i++) {
      var filename = filenames[i];
      var filePath = path.join(inputDir, filename);
      var draft = draftStore.get(filename) || {};
      var imageInfo = path.extname(filename).toLowerCase() === ".docx"
        ? detectDocxImages(filePath) : { hasImages: false, imageCount: 0 };
      var autoTitle = await readAutoTitle(filePath) || path.basename(filename, path.extname(filename));
      articles.push({
        filename: filename, filePath: filePath,
        title: draft.title || autoTitle, autoTitle: autoTitle,
        remark: draft.remark || "",
        hasImages: imageInfo.hasImages, imageCount: imageInfo.imageCount,
        ignoreImages: !!draft.ignoreImages,
        selectedResources: draft.selectedResources || []
      });
    }
    return articles;
  }

  async function previewArticle(filename) {
    if (!isSafeFilename(filename)) {
      throw new Error("unsafe preview filename");
    }

    var filePath = path.join(inputDir, filename);
    if (path.dirname(filePath) !== path.resolve(inputDir)) {
      throw new Error("unsafe preview filename");
    }
    if (!fs.existsSync(filePath)) {
      throw new Error("preview file not found");
    }

    var ext = path.extname(filename).toLowerCase();
    if (ext !== ".txt" && ext !== ".md" && ext !== ".docx") {
      throw new Error("unsupported file type: " + ext);
    }

    var draft = draftStore.get(filename) || {};
    var content = await readPreviewSource(filePath);
    if (ext === ".txt" || ext === ".md") {
      content = String(content || "").trim();
    }
    var title = draft.title || firstTextLine(content) || path.basename(filename, ext);

    return {
      filename: filename,
      title: title,
      content: content,
      resourceId: draft.resourceId || "",
      resourceName: draft.resourceName || "",
      selectedResources: draft.selectedResources || []
    };
  }

  function expandSubmissionTasks(articles) {
    var tasks = [];
    for (var i = 0; i < articles.length; i++) {
      var article = articles[i];
      var resources = article.selectedResources || [];
      for (var j = 0; j < resources.length; j++) {
        var resource = resources[j];
        tasks.push({
          taskId: article.filename + "::" + resource.resourceId,
          status: "pending", article: article, resource: resource
        });
      }
    }
    return tasks;
  }

  function buildConfirmationSummary(articles) {
    var blockers = [];
    var resourceCount = 0;
    var estimatedTotalPrice = 0;
    for (var i = 0; i < articles.length; i++) {
      var article = articles[i];
      if (!article.title) blockers.push(article.filename + " is missing a title");
      if (article.hasImages && !article.ignoreImages) blockers.push(article.filename + " contains images and ignoreImages is not enabled");
      var resources = article.selectedResources || [];
      if (resources.length === 0) blockers.push(article.filename + " has no selected media resources");
      resourceCount += resources.length;
      for (var j = 0; j < resources.length; j++) {
        estimatedTotalPrice += normalizePrice(resources[j].price);
      }
    }
    return { articleCount: articles.length, resourceCount: resourceCount, taskCount: resourceCount, estimatedTotalPrice: estimatedTotalPrice, blockers: blockers };
  }

  function requestStop() { stopRequested = true; }

  async function submitTasksSerially(articles, injected) {
    stopRequested = false;
    var deps = injected || {};
    var client = deps.client || new MediaClient({ apiKey: resolveApiKey(null) });
    var orderStore = deps.orderStore || new SubmissionOrderStore();
    var tasks = expandSubmissionTasks(articles);
    var results = [];
    for (var i = 0; i < tasks.length; i++) {
      var task = tasks[i];
      if (stopRequested) {
        task.status = "skipped";
        results.push({ taskId: task.taskId, status: "skipped", reason: "stop requested" });
        continue;
      }
      try {
        var converted = await convertArticle(task.article.filePath);
        var response = await client.sendArticle({
          resourceId: task.resource.resourceId,
          title: task.article.title,
          content: converted.html,
          remark: task.article.remark || "",
          thirdId: task.article.filename + "::" + task.resource.resourceId
        });
        var record = {
          taskId: task.taskId, article: task.article, resource: task.resource,
          result: response, submittedAt: new Date().toISOString()
        };
        await orderStore.record({
          command: "submit", dryRun: false,
          params: {
            resource_id: task.resource.resourceId,
            title: task.article.title,
            content_file: task.article.filePath,
            remark: task.article.remark || "",
            third_id: task.article.filename + "::" + task.resource.resourceId
          },
          result: { success: true, data: record }
        });
        results.push({ taskId: task.taskId, status: "success", response: response });
      } catch (error) {
        await orderStore.record({
          command: "submit", dryRun: false,
          params: {
            resource_id: task.resource && task.resource.resourceId,
            title: task.article && task.article.title,
            content_file: task.article && task.article.filePath
          },
          result: { success: false, error: error.message }
        });
        results.push({ taskId: task.taskId, status: "failed", error: error.message });
      }
    }
    return {
      ok: results.filter(function(item) { return item.status === "success"; }).length,
      fail: results.filter(function(item) { return item.status === "failed"; }).length,
      skipped: results.filter(function(item) { return item.status === "skipped"; }).length,
      results: results
    };
  }

  return {
    scanArticles: scanArticles, previewArticle: previewArticle,
    expandSubmissionTasks: expandSubmissionTasks,
    buildConfirmationSummary: buildConfirmationSummary,
    submitTasksSerially: submitTasksSerially, requestStop: requestStop
  };
}

module.exports = { createMediaWorkbenchService };

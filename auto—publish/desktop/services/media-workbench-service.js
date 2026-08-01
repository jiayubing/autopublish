const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const { detectDocxImages } = require("../../src/platforms/media/article-converter");
const { resolvePublicationTarget } = require("../../src/publication/publication-targets");

function firstTextLine(raw) {
  var lines = String(raw || "").split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/^#+\s*/, "").trim();
    if (line && line !== "---") return line;
  }
  return "";
}

function requireCanonicalPrice(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100000000
  )
    throw submissionInputError();
  return value;
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

function submissionInputError() {
  var error = new Error("Invalid submission input");
  error.code = "SUBMISSION_INPUT_INVALID";
  return error;
}

function publicationTargetFor(resource) {
  return resolvePublicationTarget({ mediaResourceId: String(resource && resource.resourceId || "") });
}

function resourceSummary(article, resource) {
  return {
    filename: article.filename,
    title: article.title || "",
    resourceId: String(resource.resourceId),
    resourceName: resource.name || resource.resourceName || "",
    price: requireCanonicalPrice(resource.price),
    targetKey: publicationTargetFor(resource).targetKey,
    status: "available"
  };
}

function resolveSubmissionFile(inputDir, filename) {
  if (!isSafeFilename(filename)) throw submissionInputError();
  var ext = path.extname(filename).toLowerCase();
  if ([".md", ".txt", ".docx"].indexOf(ext) === -1) throw submissionInputError();
  var resolvedInputDir = path.resolve(inputDir);
  var filePath = path.resolve(resolvedInputDir, filename);
  if (path.dirname(filePath) !== resolvedInputDir) throw submissionInputError();
  var stat;
  try { stat = fs.lstatSync(filePath); } catch (_) { throw submissionInputError(); }
  if (!stat.isFile() || stat.isSymbolicLink()) throw submissionInputError();
  return filePath;
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
    var filePath = resolveSubmissionFile(inputDir, filename);
    var ext = path.extname(filename).toLowerCase();

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
    var blockedResources = [];
    var submitableResources = [];
    var items = [];
    for (var i = 0; i < articles.length; i++) {
      var article = articles[i];
      if (!article.title) blockers.push(article.filename + " is missing a title");
      if (article.hasImages && !article.ignoreImages) blockers.push(article.filename + " contains images and ignoreImages is not enabled");
      var resources = article.selectedResources || [];
      if (resources.length === 0) blockers.push(article.filename + " has no selected media resources");
      resourceCount += resources.length;
      var articleItems = [];
      for (var j = 0; j < resources.length; j++) {
        var resourceItem = resourceSummary(article, resources[j]);
        articleItems.push(resourceItem);
        if (resourceItem.status === "available") {
          estimatedTotalPrice += resourceItem.price;
          submitableResources.push(resourceItem);
        } else {
          blockedResources.push(resourceItem);
        }
      }
      items.push({ filename: article.filename, title: article.title || "", resources: articleItems });
    }
    return {
      articleCount: articles.length,
      resourceCount: resourceCount,
      taskCount: resourceCount,
      submitableTaskCount: submitableResources.length,
      queueableTaskCount: submitableResources.length,
      submitableResourceCount: submitableResources.length,
      queueableResourceCount: submitableResources.length,
      blockedTaskCount: blockedResources.length,
      blockedResourceCount: blockedResources.length,
      estimatedTotalPrice: estimatedTotalPrice,
      totalEstimatedCost: estimatedTotalPrice,
      actualPrice: estimatedTotalPrice,
      blockers: blockers,
      blockedResources: blockedResources,
      blockedTasks: blockedResources,
      submitableResources: submitableResources,
      queueableResources: submitableResources,
      items: items
    };
  }

  return {
    scanArticles: scanArticles, previewArticle: previewArticle,
    expandSubmissionTasks: expandSubmissionTasks,
    buildConfirmationSummary: buildConfirmationSummary,
    resolveSubmissionFile: function(filename) { return resolveSubmissionFile(inputDir, filename); }
  };
}

module.exports = { createMediaWorkbenchService };

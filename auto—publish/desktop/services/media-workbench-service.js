const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const { detectDocxImages } = require("../../src/platforms/media/article-converter");
const { resolveArticleIdentity } = require("../../src/publication/article-identity");
const { resolvePublicationTarget } = require("../../src/publication/publication-targets");

const BLOCKED_PUBLICATION_STATUSES = ["queued", "submitting", "submitted", "published", "uncertain"];

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

function submissionInputError() {
  var error = new Error("Invalid submission input");
  error.code = "SUBMISSION_INPUT_INVALID";
  return error;
}

function resolveWorkspaceRoot(options, inputDir) {
  var paths = options.paths || {};
  return options.workspaceRoot || paths.workspaceRoot || paths.contentLibrary || paths.root ||
    (paths.data ? path.resolve(paths.data, "..", "..") : null) ||
    (paths.submissionRecords ? path.resolve(paths.submissionRecords, "..", "..") : null) ||
    null;
}

function readIdentityContent(article) {
  if (typeof article.content === "string") return article.content;
  if (!article.filePath) return "";
  try {
    var ext = path.extname(article.filePath).toLowerCase();
    if (ext === ".txt" || ext === ".md") return fs.readFileSync(article.filePath, "utf-8");
    if (ext === ".docx") return fs.readFileSync(article.filePath).toString("base64");
  } catch (_) {}
  return "";
}

function resolveMediaArticleIdentity(article) {
  var value = article || {};
  if (value.articleIdentity && typeof value.articleIdentity === "object") {
    return value.articleIdentity;
  }
  if (typeof value.articleKey === "string" && value.articleKey.trim()) {
    return {
      articleKey: value.articleKey,
      clientId: value.clientId || "media",
      articleId: value.articleId === undefined ? null : value.articleId,
      contentHash: value.contentHash === undefined ? null : value.contentHash
    };
  }
  var identityInput = {
    clientId: value.clientId || "media",
    title: value.title || value.filename,
    content: readIdentityContent(value) || value.filename || ""
  };
  if (value.articleId !== undefined && value.articleId !== null) identityInput.articleId = value.articleId;
  return resolveArticleIdentity(identityInput);
}

function publicationTargetFor(resource) {
  return resolvePublicationTarget({ mediaResourceId: String(resource && resource.resourceId || "") });
}

function latestAttempt(record) {
  return record && Array.isArray(record.attempts) && record.attempts.length
    ? record.attempts[record.attempts.length - 1] : null;
}

function findPublication(ledger, article, resource) {
  if (!ledger) return null;
  var identity = resolveMediaArticleIdentity(article);
  var target = publicationTargetFor(resource);
  return ledger.list().filter(function(record) {
    return record.articleKey === identity.articleKey && record.targetKey === target.targetKey;
  })[0] || null;
}

function publicationBlock(record) {
  if (!record || BLOCKED_PUBLICATION_STATUSES.indexOf(record.status) === -1) return null;
  return {
    publicationId: record.publicationId,
    attemptId: latestAttempt(record) && latestAttempt(record).attemptId,
    status: record.status,
    reasonCode: record.status === "uncertain" ? "PUBLICATION_UNCERTAIN" : "PUBLICATION_DUPLICATE"
  };
}

function resourceSummary(article, resource, ledger) {
  var result = {
    filename: article.filename,
    title: article.title || "",
    resourceId: String(resource.resourceId),
    resourceName: resource.name || resource.resourceName || "",
    price: normalizePrice(resource.price),
    targetKey: publicationTargetFor(resource).targetKey
  };
  var existing = findPublication(ledger, article, resource);
  var block = publicationBlock(existing);
  if (block) Object.assign(result, block);
  else result.status = "available";
  return result;
}

function safeArticleSnapshot(article) {
  return {
    filename: article && article.filename || "",
    title: article && article.title || ""
  };
}

function responseData(response) {
  var data = response && response.data;
  return data && typeof data === "object" ? data : {};
}

function orderNidFromResponse(response) {
  var data = responseData(response);
  var nested = data.data && typeof data.data === "object" ? data.data : {};
  return data.order_nid || data.orderNid || nested.order_nid || nested.orderNid || response && (response.order_nid || response.orderNid) || null;
}

function isExplicitRejectionResponse(response) {
  if (!response || typeof response !== "object") return true;
  var data = responseData(response);
  var code = response.code !== undefined ? response.code : data.code;
  var status = response.status !== undefined ? response.status : data.status;
  if (response.success === false || response.ok === false || data.success === false || data.ok === false) return true;
  if (Number.isFinite(Number(code)) && Number(code) >= 400) return true;
  if (Number.isFinite(Number(status)) && Number(status) >= 400) return true;
  return false;
}

function isExplicitRejectionError(error) {
  if (!error) return false;
  if (typeof error.code === "string" && /REJECT|DENY|FORBIDDEN|INVALID/.test(error.code.toUpperCase())) return true;
  if (Number.isFinite(Number(error.status)) && Number(error.status) >= 400 && Number(error.status) < 500) return true;
  return /API\s*请求失败|明确拒绝|rejected|forbidden|denied/i.test(String(error.message || ""));
}

function errorOutcome(error) {
  if (isExplicitRejectionError(error)) {
    return { status: "failed", errorCode: "MEDIA_API_REJECTED" };
  }
  return { status: "uncertain", errorCode: "MEDIA_RESULT_UNKNOWN" };
}

function thirdIdFor(publication, fallback) {
  if (!publication) return fallback;
  return "publication:" + publication.publicationId + ":attempt:" + publication.attemptId;
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
  var workspacePaths = options.paths;
  var clientProvider = typeof options.clientProvider === "function" ? options.clientProvider : null;
  var publicationLedger = options.publicationLedger || null;
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
        var resourceItem = resourceSummary(article, resources[j], publicationLedger);
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

  function requestStop() { stopRequested = true; }

  return {
    scanArticles: scanArticles, previewArticle: previewArticle,
    expandSubmissionTasks: expandSubmissionTasks,
    buildConfirmationSummary: buildConfirmationSummary,
    requestStop: requestStop,
    resolveSubmissionFile: function(filename) { return resolveSubmissionFile(inputDir, filename); }
  };
}

module.exports = { createMediaWorkbenchService };

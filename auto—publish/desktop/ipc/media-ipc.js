const path = require("path");
const { MediaResourceStore } = require("../../src/platforms/media/media-resource-store");
const { MediaPoolStore } = require("../../src/platforms/media/media-pool-store");
const { MediaDraftStore } = require("../../src/platforms/media/media-draft-store");
const { SubmissionOrderStore } = require("../../src/platforms/media/submission-order-store");
const { createMediaOrderService } = require("../services/media-order-service");
const { createMediaWorkbenchService } = require("../services/media-workbench-service");
const { createMediaResourceService } = require("../services/media-resource-service");
const { wrap } = require("../services/ipc-response");
const { validateMediaSubmission, validateDraft, inputError } = require("../services/submission-boundary");

function resolveMediaInputDir(deps) {
  if (deps.paths && deps.paths.mediaInput) return deps.paths.mediaInput;
  return path.join(deps.rootDir || path.resolve(__dirname, "..", ".."), "input", "media");
}

function registerMediaIpc(deps) {
  var ipcMain = deps.ipcMain;
  var mediaResourceStore = new MediaResourceStore({ paths: deps.paths });
  var mediaPoolStore = new MediaPoolStore({ paths: deps.paths });
  var mediaDraftStore = new MediaDraftStore({ paths: deps.paths });
  var submissionOrderStore = deps.orderStore || new SubmissionOrderStore({ paths: deps.paths });
  function clientProvider() {
    if (typeof deps.mediaClientProvider === "function") return deps.mediaClientProvider();
    if (deps.platformSettingsService) {
      var runtime = deps.platformSettingsService.getAdapterForRuntime("media");
      if (!runtime.adapter || typeof runtime.adapter.createClient !== "function") {
        var adapterError = new Error("付费媒体配置未设置");
        adapterError.code = "MEDIA_CONFIG_NOT_SET";
        throw adapterError;
      }
      return runtime.adapter.createClient(runtime.config);
    }
    var adapterError = new Error("付费媒体配置未设置");
    adapterError.code = "MEDIA_CONFIG_NOT_SET";
    throw adapterError;
  }
  var mediaResourceService = createMediaResourceService({
    resourceStore: mediaResourceStore,
    poolStore: mediaPoolStore,
    clientProvider: clientProvider
  });
  var mediaOrderService = createMediaOrderService({ paths: deps.paths, clientProvider: clientProvider });
  var mediaWorkbenchService = createMediaWorkbenchService({
    inputDir: resolveMediaInputDir(deps),
    draftStore: mediaDraftStore,
    paths: deps.paths,
    orderStore: submissionOrderStore,
    clientProvider: clientProvider
  });

  ipcMain.handle("media:refresh-resources", function(event, opts) {
    return wrap(function() {
      return mediaResourceService.refreshResources(opts || {});
    });
  });

  ipcMain.handle("media:get-resource-page", function(event, opts) {
    return wrap(function() {
      return mediaResourceService.getCachedResourcePage(opts || {});
    });
  });

  ipcMain.handle("media:search-resource-page", function(event, opts) {
    return wrap(function() {
      return mediaResourceService.searchResourcePage(opts || {});
    });
  });

  ipcMain.handle("media:get-pool", function() {
    return wrap(function() {
      return mediaResourceService.getPool();
    });
  });

  ipcMain.handle("media:add-to-pool", function(event, resource) {
    return wrap(function() {
      return mediaResourceService.addToPool(resource);
    });
  });

  ipcMain.handle("media:remove-from-pool", function(event, resourceId) {
    return wrap(function() {
      return mediaResourceService.removeFromPool(resourceId);
    });
  });

  ipcMain.handle("media:get-balance", function() {
    return wrap(function() {
      return mediaResourceService.getBalance();
    });
  });

  ipcMain.handle("media:get-drafts", function() {
    return wrap(function() {
      return mediaDraftStore.getAll();
    });
  });

  function resolveDraftFilename(filename) {
    mediaWorkbenchService.resolveSubmissionFile(filename);
    return filename;
  }

  async function resolveSubmissions(submissions) {
    if (!Array.isArray(submissions) || !submissions.length) throw inputError();
    var pool = mediaPoolStore.getAll();
    var cached = mediaResourceStore.getAll();
    var known = (Array.isArray(pool) ? pool : []).concat(cached && Array.isArray(cached.resources) ? cached.resources : []);
    var resourceById = {};
    known.forEach(function(resource) {
      var resourceId = resource && (resource.resourceId || resource.id || resource.resource_id);
      if (resourceId != null) resourceById[String(resourceId)] = {
        resourceId: String(resourceId), name: resource.name || resource.title || resource.resourceName || "", price: resource.price
      };
    });
    var articles = await mediaWorkbenchService.scanArticles();
    return submissions.map(function(value) {
      var submission = validateMediaSubmission(value);
      var filePath = mediaWorkbenchService.resolveSubmissionFile(submission.filename);
      var draft = mediaDraftStore.get(submission.filename) || {};
      if (submission.draftRevision && submission.draftRevision !== draft.updatedAt) throw inputError();
      var resources = submission.resourceIds.map(function(resourceId) {
        if (!resourceById[resourceId]) throw inputError();
        return resourceById[resourceId];
      });
      var scanned = articles.filter(function(article) { return article.filename === submission.filename; })[0] || {};
      return Object.assign({}, scanned, {
        filename: submission.filename, filePath: filePath,
        title: draft.title || scanned.title || path.basename(submission.filename, path.extname(submission.filename)),
        remark: draft.remark || "", ignoreImages: !!draft.ignoreImages, selectedResources: resources
      });
    });
  }

  ipcMain.handle("media:get-draft", function(event, filename) {
    return wrap(function() {
      resolveDraftFilename(filename);
      return mediaDraftStore.get(filename);
    });
  });

  ipcMain.handle("media:set-draft", function(event, filename, draft) {
    return wrap(function() {
      resolveDraftFilename(filename);
      mediaDraftStore.set(filename, validateDraft(draft));
    });
  });

  ipcMain.handle("media:remove-draft", function(event, filename) {
    return wrap(function() {
      resolveDraftFilename(filename);
      mediaDraftStore.remove(filename);
    });
  });

  ipcMain.handle("media:scan-articles", function() {
    return wrap(function() {
      return mediaWorkbenchService.scanArticles();
    });
  });

  ipcMain.handle("media:preview-article", function(event, filename) {
    return wrap(function() {
      return mediaWorkbenchService.previewArticle(filename);
    });
  });

  ipcMain.handle("media:build-confirmation", function(event, articles) {
    return wrap(async function() {
      return mediaWorkbenchService.buildConfirmationSummary(await resolveSubmissions(articles));
    });
  });

  ipcMain.handle("media:submit-selected", function(event, articles) {
    return wrap(async function() {
      return mediaWorkbenchService.submitTasksSerially(await resolveSubmissions(articles));
    });
  });

  ipcMain.handle("media:stop-submit", function() {
    return wrap(function() {
      mediaWorkbenchService.requestStop();
      return { stopped: true };
    });
  });

  ipcMain.handle("media:get-orders", function() {
    return wrap(function() {
      return mediaOrderService.listOrderViews();
    });
  });

  ipcMain.handle("media:sync-order", function(event, orderNid) {
    return wrap(function() {
      return mediaOrderService.syncOrder(orderNid);
    });
  });
}

module.exports = { registerMediaIpc };

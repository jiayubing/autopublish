const path = require("path");
const {
  MediaResourceStore,
} = require("../../src/platforms/media/media-resource-store");
const {
  MediaPoolStore,
} = require("../../src/platforms/media/media-pool-store");
const {
  MediaDraftStore,
} = require("../../src/platforms/media/media-draft-store");
const { createMediaOrderService } = require("../services/media-order-service");
const {
  createMediaWorkbenchService,
} = require("../services/media-workbench-service");
const {
  createMediaResourceService,
} = require("../services/media-resource-service");
const { wrap } = require("../services/ipc-response");
const {
  validateMediaSubmission,
  validateDraft,
  inputError,
} = require("../services/submission-boundary");

function finitePrice(value) {
  var price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : 0;
}

function optionalSubmissionPrice(value) {
  if (value === undefined || value === null || value === "") return undefined;
  var price = Number(value);
  return Number.isFinite(price) && price >= 0 && price <= 100000000
    ? price
    : undefined;
}

function safeResource(value) {
  var resource = value || {};
  var result = {
    resourceId: String(
      resource.resourceId || resource.id || resource.resource_id || "",
    ),
    name: String(
      resource.name || resource.title || resource.resourceName || "",
    ),
    price: finitePrice(resource.price),
    type: resource.type === "video" ? "video" : "image",
    createdAt: String(resource.createdAt || resource.updatedAt || ""),
  };
  ["url", "duration", "resolution", "size"].forEach(function (key) {
    if (typeof resource[key] === "string") result[key] = resource[key];
  });
  return result;
}

function safeDraft(filename, value) {
  var draft = value || {};
  var result = {
    filename: String(filename || draft.filename || ""),
    title: String(draft.title || ""),
    remark: String(draft.remark || ""),
    ignoreImages: !!draft.ignoreImages,
    selectedResources: Array.isArray(draft.selectedResources)
      ? draft.selectedResources.map(safeResource)
      : [],
  };
  if (typeof draft.updatedAt === "string") result.updatedAt = draft.updatedAt;
  return result;
}

function safeArticleSummary(value) {
  var article = value || {};
  return {
    filename: String(article.filename || ""),
    title: String(article.title || ""),
    autoTitle: String(article.autoTitle || article.title || ""),
    remark: String(article.remark || ""),
    hasImages: !!article.hasImages,
    imageCount:
      Number.isSafeInteger(article.imageCount) && article.imageCount >= 0
        ? article.imageCount
        : 0,
    ignoreImages: !!article.ignoreImages,
    selectedResources: Array.isArray(article.selectedResources)
      ? article.selectedResources.map(safeResource)
      : [],
  };
}

function safeArticlePreview(value) {
  var article = value || {};
  return {
    filename: String(article.filename || ""),
    title: String(article.title || ""),
    content: String(article.content || ""),
    selectedResources: Array.isArray(article.selectedResources)
      ? article.selectedResources.map(safeResource)
      : [],
  };
}

function safeResourcePage(value) {
  var page = value || {};
  return {
    items: Array.isArray(page.items) ? page.items.map(safeResource) : [],
    total: Number.isSafeInteger(page.total) && page.total >= 0 ? page.total : 0,
    page: Number.isSafeInteger(page.page) && page.page > 0 ? page.page : 1,
    pageSize:
      Number.isSafeInteger(page.pageSize) && page.pageSize > 0
        ? page.pageSize
        : 50,
    totalPages:
      Number.isSafeInteger(page.totalPages) && page.totalPages >= 0
        ? page.totalPages
        : 0,
    hasPrev: !!page.hasPrev,
    hasNext: !!page.hasNext,
  };
}

function safePoolPage(value) {
  var page = safeResourcePage(value);
  page.memberResourceIds = Array.isArray(value && value.memberResourceIds)
    ? value.memberResourceIds
        .filter(function (resourceId) {
          return typeof resourceId === "string";
        })
        .slice(0, 100)
    : [];
  return page;
}

function safeRefreshResult(value) {
  var result = value || {};
  return {
    status: result.truncated ? "truncated" : "complete",
    complete: result.complete === true,
    truncated: result.truncated === true,
    truncationReason:
      typeof result.truncationReason === "string"
        ? result.truncationReason
        : null,
    pageCount:
      Number.isSafeInteger(result.pageCount) && result.pageCount >= 0
        ? result.pageCount
        : 0,
    resourceCount:
      Number.isSafeInteger(result.resourceCount) && result.resourceCount >= 0
        ? result.resourceCount
        : 0,
    diagnostics: (Array.isArray(result.diagnostics)
      ? result.diagnostics
      : []
    ).map(function (value) {
      var diagnostic = {
        code: String((value && value.code) || "MEDIA_RESOURCE_DIAGNOSTIC"),
      };
      ["page", "count", "loadedCount"].forEach(function (key) {
        if (Number.isSafeInteger(value && value[key]) && value[key] >= 0)
          diagnostic[key] = value[key];
      });
      return diagnostic;
    }),
    refreshedAt: String(result.refreshedAt || new Date().toISOString()),
  };
}

function safePreflightItem(value) {
  var item = value || {};
  var result = {
    filename: String(item.filename || ""),
    title: String(item.title || ""),
    resourceId: String(item.resourceId || ""),
    resourceName: String(item.resourceName || ""),
    price: finitePrice(item.price),
    status: String(item.status || "available"),
  };
  if (typeof item.reasonCode === "string") result.reasonCode = item.reasonCode;
  if (typeof item.publicationId === "string")
    result.publicationId = item.publicationId;
  return result;
}

function safePreflight(value) {
  var result = value || {};
  var submitable = Array.isArray(result.submitableResources)
    ? result.submitableResources
    : Array.isArray(result.queueableResources)
      ? result.queueableResources
      : [];
  var blocked = Array.isArray(result.blockedResources)
    ? result.blockedResources
    : [];
  return {
    articleCount: Number.isSafeInteger(result.articleCount)
      ? result.articleCount
      : 0,
    resourceCount: Number.isSafeInteger(result.resourceCount)
      ? result.resourceCount
      : submitable.length + blocked.length,
    submitableResourceCount: Number.isSafeInteger(
      result.submitableResourceCount,
    )
      ? result.submitableResourceCount
      : submitable.length,
    blockedResourceCount: Number.isSafeInteger(result.blockedResourceCount)
      ? result.blockedResourceCount
      : blocked.length,
    estimatedTotalPrice: finitePrice(result.estimatedTotalPrice),
    actualPrice: finitePrice(
      result.actualPrice === undefined
        ? result.estimatedTotalPrice
        : result.actualPrice,
    ),
    blockers: (Array.isArray(result.blockers) ? result.blockers : []).map(
      String,
    ),
    blockedResources: blocked.map(safePreflightItem),
    submitableResources: submitable.map(safePreflightItem),
  };
}

const BLOCKED_MEDIA_PUBLICATION_STATUSES = new Set([
  "queued",
  "submitting",
  "submitted",
  "published",
  "uncertain",
]);

async function applyOperationalPublicationBlocks(summary, articles, deps) {
  if (
    !deps.operationalStore ||
    typeof deps.operationalStore.listPublicationRecords !== "function" ||
    !deps.platformWorkbenchService ||
    typeof deps.platformWorkbenchService.prepareMediaPublicationCommands !==
      "function"
  ) {
    return summary;
  }
  var commands =
    await deps.platformWorkbenchService.prepareMediaPublicationCommands(
      articles,
    );
  var articleIds = Array.from(
    new Set(
      commands
        .map(function (command) {
          return command.articleId;
        })
        .filter(Boolean),
    ),
  );
  if (!articleIds.length) return summary;
  var records = deps.operationalStore.listPublicationRecords({
    articleIds: articleIds,
  });
  var blockedByTarget = new Map();
  (Array.isArray(records) ? records : []).forEach(function (record) {
    if (!record || !BLOCKED_MEDIA_PUBLICATION_STATUSES.has(record.status))
      return;
    blockedByTarget.set(
      String(record.articleId) + "\0" + String(record.targetKey),
      record,
    );
  });
  var commandBySelection = new Map();
  commands.forEach(function (command) {
    var filename =
      command &&
      command.postProcessingPayload &&
      command.postProcessingPayload.filename;
    var resourceId =
      command && command.target && command.target.mediaResourceId;
    if (filename && resourceId)
      commandBySelection.set(
        String(filename) + "\0" + String(resourceId),
        command,
      );
  });
  var submitableResources = [];
  var blockedResources = Array.isArray(summary.blockedResources)
    ? summary.blockedResources.slice()
    : [];
  (Array.isArray(summary.submitableResources)
    ? summary.submitableResources
    : []
  ).forEach(function (item) {
    var command = commandBySelection.get(
      String(item.filename) + "\0" + String(item.resourceId),
    );
    var targetKey =
      command && command.target && command.target.mediaResourceId
        ? "media-resource:" + command.target.mediaResourceId
        : null;
    var record =
      command && targetKey
        ? blockedByTarget.get(String(command.articleId) + "\0" + targetKey)
        : null;
    if (!record) {
      submitableResources.push(item);
      return;
    }
    blockedResources.push(
      Object.assign({}, item, {
        status: record.status,
        reasonCode:
          record.status === "uncertain"
            ? "PUBLICATION_UNCERTAIN"
            : "PUBLICATION_DUPLICATE",
        publicationId: record.publicationId,
      }),
    );
  });
  var actualPrice = submitableResources.reduce(function (total, item) {
    return total + finitePrice(item.price);
  }, 0);
  return Object.assign({}, summary, {
    submitableResourceCount: submitableResources.length,
    blockedResourceCount: blockedResources.length,
    estimatedTotalPrice: actualPrice,
    actualPrice: actualPrice,
    submitableResources: submitableResources,
    blockedResources: blockedResources,
  });
}

function safeOrder(value) {
  var order = value || {};
  var result = {
    title: String(order.title || ""),
    filename: String(order.filename || ""),
    orderNid: String(order.orderNid || ""),
    statusCode: String(order.statusCode || ""),
    statusLabel: String(order.statusLabel || ""),
    submittedAt: String(order.submittedAt || ""),
    publishedAt: String(order.publishedAt || ""),
    resourceId: String(order.resourceId || ""),
    resourceName: String(order.resourceName || ""),
    price: String(order.price || ""),
    orderUrl: String(order.orderUrl || ""),
  };
  ["publicationId", "attemptId", "publicationStatus", "errorCode"].forEach(
    function (key) {
      if (typeof order[key] === "string") result[key] = order[key];
    },
  );
  return result;
}

function resolveMediaInputDir(deps) {
  if (deps.paths && deps.paths.mediaInput) return deps.paths.mediaInput;
  return path.join(
    deps.rootDir || path.resolve(__dirname, "..", ".."),
    "input",
    "media",
  );
}

function registerMediaIpc(deps) {
  var ipcMain = deps.ipcMain;
  var mediaResourceStore = new MediaResourceStore({ paths: deps.paths });
  var mediaPoolStore = new MediaPoolStore({ paths: deps.paths });
  var mediaDraftStore = new MediaDraftStore({ paths: deps.paths });
  function clientProvider() {
    if (typeof deps.mediaClientProvider === "function")
      return deps.mediaClientProvider();
    if (deps.platformSettingsService) {
      var runtime = deps.platformSettingsService.getAdapterForRuntime("media");
      if (
        !runtime.adapter ||
        typeof runtime.adapter.createClient !== "function"
      ) {
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
    clientProvider: clientProvider,
  });
  var mediaOrderService = createMediaOrderService({
    paths: deps.paths,
    clientProvider: clientProvider,
    operationalStore: deps.operationalStore,
    openExternal: deps.openExternal,
  });
  var mediaWorkbenchService = createMediaWorkbenchService({
    inputDir: resolveMediaInputDir(deps),
    draftStore: mediaDraftStore,
    paths: deps.paths,
    clientProvider: clientProvider,
  });

  ipcMain.handle("media:refresh-resources", function (event, opts) {
    return wrap(function () {
      return Promise.resolve(
        mediaResourceService.refreshResources(opts || {}),
      ).then(safeRefreshResult);
    });
  });

  ipcMain.handle("media:get-resource-page", function (event, opts) {
    return wrap(function () {
      return safeResourcePage(
        mediaResourceService.getCachedResourcePage(opts || {}),
      );
    });
  });

  ipcMain.handle("media:search-resource-page", function (event, opts) {
    return wrap(function () {
      return safeResourcePage(
        mediaResourceService.searchResourcePage(opts || {}),
      );
    });
  });

  ipcMain.handle("media:get-pool", function (event, opts) {
    return wrap(function () {
      return safePoolPage(mediaResourceService.getPoolPage(opts || {}));
    });
  });

  ipcMain.handle("media:add-to-pool", function (event, resource) {
    return wrap(function () {
      return {
        resource: safeResource(mediaResourceService.addToPool(resource)),
      };
    });
  });

  ipcMain.handle("media:remove-from-pool", function (event, resourceId) {
    return wrap(function () {
      mediaResourceService.removeFromPool(resourceId);
      return { completed: true };
    });
  });

  ipcMain.handle("media:get-balance", function () {
    return wrap(function () {
      return mediaResourceService.getBalance();
    });
  });

  ipcMain.handle("media:get-drafts", function () {
    return wrap(function () {
      var drafts = mediaDraftStore.getAll();
      return {
        items: Object.keys(drafts).map(function (filename) {
          return safeDraft(filename, drafts[filename]);
        }),
      };
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
    var known = (Array.isArray(pool) ? pool : []).concat(
      cached && Array.isArray(cached.resources) ? cached.resources : [],
    );
    var resourceById = {};
    known.forEach(function (resource) {
      var resourceId =
        resource &&
        (resource.resourceId || resource.id || resource.resource_id);
      if (resourceId != null) {
        var selectedResource = {
          resourceId: String(resourceId),
          name: resource.name || resource.title || resource.resourceName || "",
        };
        var submissionPrice = optionalSubmissionPrice(resource.price);
        if (submissionPrice !== undefined)
          selectedResource.price = submissionPrice;
        resourceById[String(resourceId)] = selectedResource;
      }
    });
    var articles = await mediaWorkbenchService.scanArticles();
    return submissions.map(function (value) {
      var submission = validateMediaSubmission(value);
      var filePath = mediaWorkbenchService.resolveSubmissionFile(
        submission.filename,
      );
      var draft = mediaDraftStore.get(submission.filename) || {};
      if (
        submission.draftRevision &&
        submission.draftRevision !== draft.updatedAt
      )
        throw inputError();
      var resources = submission.resourceIds.map(function (resourceId) {
        if (!resourceById[resourceId]) throw inputError();
        return resourceById[resourceId];
      });
      var scanned =
        articles.filter(function (article) {
          return article.filename === submission.filename;
        })[0] || {};
      return Object.assign({}, scanned, {
        filename: submission.filename,
        filePath: filePath,
        title:
          draft.title ||
          scanned.title ||
          path.basename(submission.filename, path.extname(submission.filename)),
        remark: draft.remark || "",
        ignoreImages: !!draft.ignoreImages,
        selectedResources: resources,
      });
    });
  }

  ipcMain.handle("media:get-draft", function (event, filename) {
    return wrap(function () {
      resolveDraftFilename(filename);
      var draft = mediaDraftStore.get(filename);
      return { draft: draft ? safeDraft(filename, draft) : null };
    });
  });

  ipcMain.handle("media:set-draft", function (event, filename, draft) {
    return wrap(function () {
      resolveDraftFilename(filename);
      mediaDraftStore.set(filename, validateDraft(draft));
      return { completed: true };
    });
  });

  ipcMain.handle("media:remove-draft", function (event, filename) {
    return wrap(function () {
      resolveDraftFilename(filename);
      mediaDraftStore.remove(filename);
      return { completed: true };
    });
  });

  ipcMain.handle("media:scan-articles", function () {
    return wrap(function () {
      return Promise.resolve(mediaWorkbenchService.scanArticles()).then(
        function (items) {
          return { items: items.map(safeArticleSummary) };
        },
      );
    });
  });

  ipcMain.handle("media:preview-article", function (event, filename) {
    return wrap(function () {
      return Promise.resolve(
        mediaWorkbenchService.previewArticle(filename),
      ).then(function (article) {
        return { article: safeArticlePreview(article) };
      });
    });
  });

  ipcMain.handle("media:build-confirmation", function (event, articles) {
    return wrap(async function () {
      var prepared = await resolveSubmissions(articles);
      var summary = mediaWorkbenchService.buildConfirmationSummary(prepared);
      return safePreflight(
        await applyOperationalPublicationBlocks(summary, prepared, deps),
      );
    });
  });

  ipcMain.handle("media:submit-selected", function (event, articles) {
    return wrap(async function () {
      const prepared = await resolveSubmissions(articles);
      if (
        !deps.mediaPublicationSubmissionService ||
        typeof deps.mediaPublicationSubmissionService.submit !== "function"
      ) {
        const error = new Error("Publication workflow is unavailable");
        error.code = "PUBLICATION_WORKFLOW_UNAVAILABLE";
        throw error;
      }
      const execution =
        await deps.mediaPublicationSubmissionService.submit(prepared);
      const result = {
        batchId: execution.batchId,
        ok: execution.results.filter(
          (item) => item.status === "published" || item.status === "submitted",
        ).length,
        fail: execution.results.filter((item) => item.status === "failed")
          .length,
        uncertain: execution.results.filter(
          (item) => item.status === "uncertain",
        ).length,
        skipped: 0,
        results: execution.results,
      };
      if (typeof deps.invalidateData === "function")
        deps.invalidateData("MEDIA_SUBMIT_COMPLETED");
      return {
        batchId: String(result.batchId || ""),
        publishedCount: result.ok,
        failedCount: result.fail,
        uncertainCount: result.uncertain,
        skippedCount: result.skipped,
      };
    });
  });

  ipcMain.handle("media:stop-submit", function () {
    return wrap(function () {
      mediaWorkbenchService.requestStop();
      return { stopped: true };
    });
  });

  ipcMain.handle("media:get-orders", function () {
    return wrap(function () {
      return { items: mediaOrderService.listOrderViews().map(safeOrder) };
    });
  });

  ipcMain.handle("media:sync-order", function (event, orderNid) {
    return wrap(async function () {
      await mediaOrderService.syncOrder(orderNid);
      var order = mediaOrderService.listOrderViews().filter(function (item) {
        return String(item.orderNid) === String(orderNid);
      })[0];
      if (!order) {
        var error = new Error("Order projection is unavailable");
        error.code = "IPC_INTERNAL";
        throw error;
      }
      return { order: safeOrder(order) };
    });
  });

  ipcMain.handle("media:open-published-url", function (event, orderNid) {
    return wrap(function () {
      return mediaOrderService.openPublishedUrl(orderNid);
    });
  });
}

module.exports = { registerMediaIpc };

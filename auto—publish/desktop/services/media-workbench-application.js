const path = require("path");
const { MediaResourceStore } = require("../../src/platforms/media/media-resource-store");
const { MediaPoolStore } = require("../../src/platforms/media/media-pool-store");
const { MediaDraftStore } = require("../../src/platforms/media/media-draft-store");
const { createMediaOrderService } = require("./media-order-service");
const { createMediaWorkbenchService } = require("./media-workbench-service");
const { createMediaResourceService } = require("./media-resource-service");
const {
  validateMediaSubmission,
  validateDraft,
  inputError,
} = require("./submission-boundary");
const {
  finiteMediaPrice,
  projectMediaResource,
  projectMediaDraft,
  projectMediaArticleSummary,
  projectMediaArticlePreview,
  projectMediaResourcePage,
  projectMediaPoolPage,
  projectMediaRefreshResult,
  projectMediaPreflight,
  projectMediaOrder,
} = require("../ipc/contracts/media-contracts");

const BLOCKED_PUBLICATION_STATUSES = new Set([
  "queued",
  "submitting",
  "submitted",
  "published",
  "uncertain",
]);

function resolveMediaInputDir(values) {
  if (values.paths && values.paths.mediaInput) return values.paths.mediaInput;
  return path.join(
    values.rootDir || path.resolve(__dirname, "..", ".."),
    "input",
    "media",
  );
}

function createMediaClientProvider(values) {
  if (typeof values.mediaClientProvider === "function")
    return values.mediaClientProvider;
  return function () {
    if (!values.platformSettingsService) {
      const error = new Error("付费媒体配置未设置");
      error.code = "MEDIA_CONFIG_NOT_SET";
      throw error;
    }
    const runtime = values.platformSettingsService.getAdapterForRuntime("media");
    if (!runtime || !runtime.adapter || typeof runtime.adapter.createClient !== "function") {
      const error = new Error("付费媒体配置未设置");
      error.code = "MEDIA_CONFIG_NOT_SET";
      throw error;
    }
    return runtime.adapter.createClient(runtime.config);
  };
}

function applyPublicationBlocks(summary, articles, values) {
  if (
    !values.operationalStore ||
    typeof values.operationalStore.listPublicationRecords !== "function" ||
    !values.platformWorkbenchService ||
    typeof values.platformWorkbenchService.prepareMediaPublicationCommands !== "function"
  )
    return Promise.resolve(summary);

  return Promise.resolve(
    values.platformWorkbenchService.prepareMediaPublicationCommands(articles),
  ).then(function (commands) {
    const articleIds = Array.from(
      new Set(
        commands
          .map((command) => command && command.articleId)
          .filter(Boolean),
      ),
    );
    if (!articleIds.length) return summary;

    const records = values.operationalStore.listPublicationRecords({ articleIds });
    const blockedByTarget = new Map();
    (Array.isArray(records) ? records : []).forEach(function (record) {
      if (!record || !BLOCKED_PUBLICATION_STATUSES.has(record.status)) return;
      blockedByTarget.set(
        String(record.articleId) + "\0" + String(record.targetKey),
        record,
      );
    });
    const commandBySelection = new Map();
    commands.forEach(function (command) {
      const filename = command && command.postProcessingPayload && command.postProcessingPayload.filename;
      const resourceId = command && command.target && command.target.mediaResourceId;
      if (filename && resourceId)
        commandBySelection.set(String(filename) + "\0" + String(resourceId), command);
    });

    const submitableResources = [];
    const blockedResources = Array.isArray(summary.blockedResources)
      ? summary.blockedResources.slice()
      : [];
    (Array.isArray(summary.submitableResources) ? summary.submitableResources : []).forEach(function (item) {
      const command = commandBySelection.get(
        String(item.filename) + "\0" + String(item.resourceId),
      );
      const targetKey = command && command.target && command.target.mediaResourceId
        ? "media-resource:" + command.target.mediaResourceId
        : null;
      const record = command && targetKey
        ? blockedByTarget.get(String(command.articleId) + "\0" + targetKey)
        : null;
      if (!record) {
        submitableResources.push(item);
        return;
      }
      blockedResources.push(Object.assign({}, item, {
        status: record.status,
        reasonCode: record.status === "uncertain"
          ? "PUBLICATION_UNCERTAIN"
          : "PUBLICATION_DUPLICATE",
        publicationId: record.publicationId,
      }));
    });
    const actualPrice = submitableResources.reduce(function (total, item) {
      return total + finiteMediaPrice(item.price);
    }, 0);
    return Object.assign({}, summary, {
      submitableResourceCount: submitableResources.length,
      blockedResourceCount: blockedResources.length,
      estimatedTotalPrice: actualPrice,
      actualPrice,
      submitableResources,
      blockedResources,
    });
  });
}

function createMediaWorkbenchApplication(options) {
  const values = options || {};
  const clientProvider = createMediaClientProvider(values);
  const resourceStore = values.resourceStore || new MediaResourceStore({ paths: values.paths });
  const poolStore = values.poolStore || new MediaPoolStore({ paths: values.paths });
  const draftStore = values.draftStore || new MediaDraftStore({ paths: values.paths });
  const resourceService = values.mediaResourceService || createMediaResourceService({
    resourceStore,
    poolStore,
    clientProvider,
  });
  const orderService = values.mediaOrderService || createMediaOrderService({
    paths: values.paths,
    clientProvider,
    operationalStore: values.operationalStore,
    openExternal: values.openExternal,
  });
  const workbenchService = values.mediaWorkbenchService || createMediaWorkbenchService({
    inputDir: resolveMediaInputDir(values),
    draftStore,
    paths: values.paths,
    clientProvider,
  });

  async function resolveSubmissions(submissions) {
    if (!Array.isArray(submissions) || !submissions.length) throw inputError();
    const pool = poolStore.getAll();
    const cached = resourceStore.getAll();
    const known = (Array.isArray(pool) ? pool : []).concat(
      cached && Array.isArray(cached.resources) ? cached.resources : [],
    );
    const resourceById = {};
    known.forEach(function (resource) {
      const resourceId = resource && (resource.resourceId || resource.id || resource.resource_id);
      if (resourceId == null) return;
      const selectedResource = {
        resourceId: String(resourceId),
        name: resource.name || resource.title || resource.resourceName || "",
      };
      const price = finiteMediaPrice(resource.price);
      if (price !== undefined) selectedResource.price = price;
      resourceById[String(resourceId)] = selectedResource;
    });
    const articles = await workbenchService.scanArticles();
    return submissions.map(function (value) {
      const submission = validateMediaSubmission(value);
      const filePath = workbenchService.resolveSubmissionFile(submission.filename);
      const draft = draftStore.get(submission.filename) || {};
      if (submission.draftRevision && submission.draftRevision !== draft.updatedAt)
        throw inputError();
      const resources = submission.resourceIds.map(function (resourceId) {
        if (!resourceById[resourceId]) throw inputError();
        return resourceById[resourceId];
      });
      const scanned = articles.filter((article) => article.filename === submission.filename)[0] || {};
      return Object.assign({}, scanned, {
        filename: submission.filename,
        filePath,
        title: draft.title || scanned.title || path.basename(submission.filename, path.extname(submission.filename)),
        remark: draft.remark || "",
        ignoreImages: draft.ignoreImages === true,
        selectedResources: resources,
      });
    });
  }

  return Object.freeze({
    refreshResources: (input) => Promise.resolve(resourceService.refreshResources(input || {})).then(projectMediaRefreshResult),
    getResourcePage: (input) => projectMediaResourcePage(resourceService.getCachedResourcePage(input || {})),
    searchResourcePage: (input) => projectMediaResourcePage(resourceService.searchResourcePage(input || {})),
    getPool: (input) => projectMediaPoolPage(resourceService.getPoolPage(input || {})),
    addToPool: (resource) => ({ resource: projectMediaResource(resourceService.addToPool(resource)) }),
    removeFromPool: (resourceId) => {
      resourceService.removeFromPool(resourceId);
      return { completed: true };
    },
    getBalance: () => resourceService.getBalance(),
    getDrafts: () => {
      const drafts = draftStore.getAll();
      return {
        items: Object.keys(drafts).map((filename) => projectMediaDraft(filename, drafts[filename])),
      };
    },
    getDraft: (filename) => {
      workbenchService.resolveSubmissionFile(filename);
      const draft = draftStore.get(filename);
      return { draft: draft ? projectMediaDraft(filename, draft) : null };
    },
    setDraft: (filename, draft) => {
      workbenchService.resolveSubmissionFile(filename);
      draftStore.set(filename, validateDraft(draft));
      return { completed: true };
    },
    scanArticles: () => Promise.resolve(workbenchService.scanArticles()).then((items) => ({
      items: items.map(projectMediaArticleSummary),
    })),
    previewArticle: (filename) => Promise.resolve(workbenchService.previewArticle(filename)).then((article) => ({
      article: projectMediaArticlePreview(article),
    })),
    buildConfirmation: async (submissions) => {
      const articles = await resolveSubmissions(submissions);
      const summary = workbenchService.buildConfirmationSummary(articles);
      return projectMediaPreflight(await applyPublicationBlocks(summary, articles, values));
    },
    submitSelected: async (submissions) => {
      const prepared = await resolveSubmissions(submissions);
      if (!values.mediaPublicationSubmissionService || typeof values.mediaPublicationSubmissionService.submit !== "function") {
        const error = new Error("Publication workflow is unavailable");
        error.code = "PUBLICATION_WORKFLOW_UNAVAILABLE";
        throw error;
      }
      const execution = await values.mediaPublicationSubmissionService.submit(prepared);
      const results = Array.isArray(execution && execution.results) ? execution.results : [];
      if (typeof values.invalidateData === "function") values.invalidateData("MEDIA_SUBMIT_COMPLETED");
      return {
        batchId: String((execution && execution.batchId) || ""),
        publishedCount: results.filter((item) => ["published", "submitted"].includes(item.status)).length,
        failedCount: results.filter((item) => item.status === "failed").length,
        uncertainCount: results.filter((item) => item.status === "uncertain").length,
        skippedCount: 0,
      };
    },
    getOrders: () => ({ items: orderService.listOrderViews().map(projectMediaOrder) }),
    syncOrder: async (orderNid) => {
      await orderService.syncOrder(orderNid);
      const order = orderService.listOrderViews().filter((item) => String(item.orderNid) === String(orderNid))[0];
      if (!order) {
        const error = new Error("Order projection is unavailable");
        error.code = "IPC_INTERNAL";
        throw error;
      }
      return { order: projectMediaOrder(order) };
    },
    openPublishedUrl: (orderNid) => orderService.openPublishedUrl(orderNid),
  });
}

module.exports = { createMediaWorkbenchApplication };

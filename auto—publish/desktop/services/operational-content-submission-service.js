"use strict";

// Content files remain portable queue copies. Batch execution state belongs to
// OperationalStore; this service deliberately never creates a JSON batch or
// publication ledger.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  articleMarkdown,
  writePairAtomic,
} = require("./submission-file-helpers");
const {
  evaluateArticleSubmissionEligibility,
} = require("../../src/content/article-submission-eligibility");
const {
  inspectSubmissionPair,
} = require("../../src/diagnostics/submission-pair-inspector");

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}
function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function safeName(value) {
  return (
    String(value || "article")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/^[. -]+|[. -]+$/g, "")
      .slice(0, 80) || "article"
  );
}

function createOperationalContentSubmissionService(options) {
  const value = options || {};
  if (!value.operationalStore) throw fail("OPERATIONAL_STORE_REQUIRED");
  const root = path.resolve(value.workspaceRoot || process.cwd());
  const contentStore = value.contentStore;
  if (!contentStore) throw fail("CONTENT_STORE_REQUIRED");
  const inputRoot = path.resolve(
    (value.paths && value.paths.input) ||
      path.join(root, ".autopublish", "input"),
  );
  const cancellationPlans = new Map();
  function allPlatforms() {
    return Array.isArray(value.platforms)
      ? value.platforms.slice()
      : require("../../src/core/platforms").loadPlatforms();
  }
  function platforms() {
    return allPlatforms()
      .filter(
        (platform) =>
          !platform.publicationTarget ||
          platform.publicationTarget.kind === "platform",
      )
      .map((platform) => ({
        id: platform.id,
        displayName: platform.displayName,
        scanDir: platform.scanDir || platform.id,
        contentQueueImport: platform.contentQueueImport === true,
        publicationTarget: platform.publicationTarget || { kind: "platform" },
      }));
  }
  function listPlatforms() {
    return platforms().map((platform) => ({
      id: platform.id,
      displayName: platform.displayName || platform.id,
      scanDir: platform.scanDir || platform.id,
      contentQueueImport: platform.contentQueueImport === true,
    }));
  }
  function regularFile(filename) {
    try {
      const stat = fs.lstatSync(filename);
      return stat.isFile() && !stat.isSymbolicLink();
    } catch (_) {
      return false;
    }
  }
  function prepareMediaExport(input) {
    if (
      !input ||
      input.confirmed !== true ||
      typeof input.clientId !== "string" ||
      !input.clientId.trim() ||
      typeof input.generatedArticleId !== "string" ||
      !input.generatedArticleId.trim()
    )
      throw fail(
        "CONTENT_EXPORT_CONFIRMATION_REQUIRED",
        "Manual confirmation is required",
      );
    if (input.targetPlatform !== "media" || input.mediaResourceId !== undefined)
      throw fail(
        "CONTENT_EXPORT_TARGET_INVALID",
        "Paid-media staging does not select a media resource",
      );
    const platform = allPlatforms().find(
      (candidate) =>
        candidate.id === "media" && candidate.contentQueueImport === true,
    );
    if (!platform)
      throw fail(
        "CONTENT_EXPORT_TARGET_INVALID",
        "Paid-media staging is unavailable",
      );
    let article;
    try {
      article = contentStore.getArticle(
        input.clientId,
        input.generatedArticleId,
      );
    } catch (_) {
      throw fail(
        "CONTENT_SUBMISSION_ARTICLE_NOT_FOUND",
        "Selected article was not found",
      );
    }
    const eligibility = evaluateArticleSubmissionEligibility(article, {
      targetPlatform: { id: "media", contentQueueImport: true },
    });
    if (!eligibility.eligible)
      throw fail("CONTENT_EXPORT_NOT_READY", eligibility.reasons.join("、"));
    const markdown = articleMarkdown(article);
    const contentHash = hash(markdown);
    const filename = safeName(article.title) + "-" + article.id + ".md";
    const directory = path.join(inputRoot, platform.scanDir || "media");
    const filePath = path.join(directory, filename);
    const sidecarPath = filePath + ".submission.json";
    const mainExists = fs.existsSync(filePath);
    const sidecarExists = fs.existsSync(sidecarPath);
    let status = "queueable";
    if (mainExists || sidecarExists) {
      let sidecar = null;
      try {
        sidecar = regularFile(sidecarPath)
          ? JSON.parse(fs.readFileSync(sidecarPath, "utf8"))
          : null;
      } catch (_) {
        sidecar = null;
      }
      const matches =
        regularFile(filePath) &&
        regularFile(sidecarPath) &&
        fs.readFileSync(filePath, "utf8") === markdown &&
        sidecar &&
        sidecar.version === 2 &&
        sidecar.clientId === article.clientId &&
        sidecar.generatedArticleId === article.id &&
        sidecar.targetPlatform === "media" &&
        sidecar.contentHash === contentHash;
      status = matches ? "idempotent" : "conflict";
    }
    return {
      article,
      markdown,
      contentHash,
      filename,
      directory,
      filePath,
      sidecarPath,
      status,
    };
  }
  function previewExport(input) {
    const prepared = prepareMediaExport(input);
    return {
      filename: prepared.filename,
      targetPlatform: "media",
      contentHash: prepared.contentHash,
      markdown: prepared.markdown,
      status: prepared.status,
    };
  }
  function exportArticle(input) {
    const prepared = prepareMediaExport(input);
    if (prepared.status === "conflict")
      throw fail(
        "CONTENT_EXPORT_CONFLICT",
        "Paid-media queue copy conflicts with the selected article",
      );
    if (prepared.status === "queueable") {
      fs.mkdirSync(prepared.directory, { recursive: true });
      const sidecar = {
        version: 2,
        generatedArticleId: prepared.article.id,
        clientId: prepared.article.clientId,
        targetPlatform: "media",
        targetPlatformId: "media",
        filename: prepared.filename,
        contentHash: prepared.contentHash,
        status: "queued",
        exportedAt: new Date().toISOString(),
      };
      writePairAtomic(
        prepared.filePath,
        prepared.markdown,
        prepared.sidecarPath,
        JSON.stringify(sidecar, null, 2) + "\n",
      );
    }
    if (typeof value.onDataInvalidated === "function")
      value.onDataInvalidated("CONTENT_EXPORT_QUEUED");
    return {
      filename: prepared.filename,
      targetPlatform: "media",
      contentHash: prepared.contentHash,
      markdown: prepared.markdown,
      status: prepared.status,
      idempotent: prepared.status === "idempotent",
    };
  }
  function assertInput(input, confirmed) {
    if (
      !input ||
      typeof input !== "object" ||
      typeof input.clientId !== "string" ||
      !input.clientId.trim() ||
      !Array.isArray(input.articleIds) ||
      !input.articleIds.length ||
      !Array.isArray(input.targetPlatformIds) ||
      !input.targetPlatformIds.length
    )
      throw fail(
        "CONTENT_SUBMISSION_BATCH_INPUT_INVALID",
        "Batch selection is invalid",
      );
    if (confirmed && input.confirmed !== true)
      throw fail(
        "CONTENT_SUBMISSION_CONFIRMATION_REQUIRED",
        "Batch confirmation is required",
      );
    if (
      !input.accountProfiles ||
      typeof input.accountProfiles !== "object" ||
      Array.isArray(input.accountProfiles) ||
      input.targetPlatformIds.some(
        (platformId) =>
          typeof input.accountProfiles[platformId] !== "string" ||
          !input.accountProfiles[platformId].trim(),
      )
    )
      throw fail(
        "ACCOUNT_PROFILE_REQUIRED",
        "A platform account profile is required",
      );
    return input;
  }
  function item(article, platform, platformId, accountProfileId) {
    const markdown = articleMarkdown(article);
    const filename = safeName(article.title) + "-" + article.id + ".md";
    const filePath = path.join(
      inputRoot,
      platform.scanDir || platform.id,
      filename,
    );
    return {
      articleId: article.id,
      targetPlatformId: platformId,
      accountProfileId,
      filename,
      filePath,
      sidecarPath: filePath + ".submission.json",
      contentHash: hash(markdown),
      markdown,
      status: "queueable",
    };
  }
  function previewBatch(input) {
    const request = assertInput(input, false);
    const byId = new Map(
      platforms().map((platform) => [platform.id, platform]),
    );
    const items = [];
    const missingArticleIds = [];
    const unsupportedPlatformIds = [];
    for (const articleId of request.articleIds) {
      let article;
      try {
        article = contentStore.getArticle(request.clientId, articleId);
      } catch (_) {
        missingArticleIds.push(articleId);
        continue;
      }
      for (const platformId of request.targetPlatformIds) {
        const platform = byId.get(platformId);
        const accountProfileId = request.accountProfiles[platformId];
        if (!platform || platform.contentQueueImport !== true) {
          if (!unsupportedPlatformIds.includes(platformId))
            unsupportedPlatformIds.push(platformId);
          items.push({
            articleId,
            targetPlatformId: platformId,
            accountProfileId,
            status: "excluded",
          });
          continue;
        }
        const eligibility = evaluateArticleSubmissionEligibility(article, {
          targetPlatform: { id: platformId, contentQueueImport: true },
        });
        if (!eligibility.eligible) {
          items.push({
            articleId,
            targetPlatformId: platformId,
            accountProfileId,
            status: "blocked",
            reasonCodes: eligibility.reasonCodes,
            reasons: eligibility.reasons,
          });
          continue;
        }
        items.push(item(article, platform, platformId, accountProfileId));
      }
    }
    return {
      clientId: request.clientId,
      articleIds: request.articleIds.slice(),
      targetPlatformIds: request.targetPlatformIds.slice(),
      accountProfiles: Object.assign({}, request.accountProfiles),
      totalTaskCount:
        request.articleIds.length * request.targetPlatformIds.length,
      queueableTaskCount: items.filter((x) => x.status === "queueable").length,
      idempotentCount: 0,
      alreadyQueuedCount: 0,
      blockedPublishedCount: 0,
      blockedUncertainCount: 0,
      blockedContentCount: items.filter((x) => x.status === "blocked").length,
      conflictCount: 0,
      missingArticleIds,
      unsupportedPlatformIds,
      items,
    };
  }
  function toPublicBatch(batch) {
    const first = batch.items.find(
      (stored) => stored.payload && typeof stored.payload.clientId === "string",
    );
    return {
      id: batch.batchId,
      batchId: batch.batchId,
      clientId: (first && first.payload.clientId) || null,
      status: batch.status,
      revision: batch.revision,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      items: batch.items.map((stored) =>
        Object.assign(
          {
            itemId: stored.itemId,
            articleId: stored.articleId,
            targetKey: stored.targetKey,
            status: stored.status,
            revision: stored.revision,
          },
          stored.payload || {},
        ),
      ),
    };
  }
  function createBatch(input) {
    const preview = previewBatch(assertInput(input, true));
    if (preview.missingArticleIds.length)
      throw fail(
        "CONTENT_SUBMISSION_ARTICLE_NOT_FOUND",
        "Selected article was not found",
      );
    const queued = preview.items.filter(
      (candidate) => candidate.status === "queueable",
    );
    const batchId = `batch-${crypto.randomUUID()}`;
    const created = value.operationalStore.createSubmissionBatch({
      batchId,
      items: queued.map((candidate) => ({
        articleId: candidate.articleId,
        target: {
          kind: "platform",
          platformId: candidate.targetPlatformId,
          accountProfileId: candidate.accountProfileId,
        },
        payload: {
          clientId: preview.clientId,
          targetPlatformId: candidate.targetPlatformId,
          accountProfileId: candidate.accountProfileId,
          sourcePlatformId: candidate.targetPlatformId,
          filename: candidate.filename,
          contentHash: candidate.contentHash,
        },
      })),
    });
    try {
      queued.forEach((candidate, index) => {
        fs.mkdirSync(path.dirname(candidate.filePath), { recursive: true });
        const sidecar = {
          version: 2,
          submissionBatchId: created.batchId,
          generatedArticleId: candidate.articleId,
          clientId: preview.clientId,
          targetPlatform: candidate.targetPlatformId,
          targetPlatformId: candidate.targetPlatformId,
          accountProfileId: candidate.accountProfileId,
          filename: candidate.filename,
          contentHash: candidate.contentHash,
          status: "queued",
          queuedAt: new Date().toISOString(),
        };
        writePairAtomic(
          candidate.filePath,
          candidate.markdown,
          candidate.sidecarPath,
          JSON.stringify(sidecar, null, 2) + "\n",
        );
        candidate.itemId = created.items[index].itemId;
      });
    } catch (error) {
      queued.forEach((candidate) => {
        try {
          fs.unlinkSync(candidate.sidecarPath);
        } catch (_) {}
        try {
          fs.unlinkSync(candidate.filePath);
        } catch (_) {}
      });
      throw error;
    }
    if (typeof value.onDataInvalidated === "function")
      value.onDataInvalidated("SUBMISSION_BATCH_CREATED");
    return Object.assign({}, preview, {
      batchId: created.batchId,
      createdCount: queued.length,
      idempotentCount: 0,
      items: queued.map((candidate) => {
        const copy = Object.assign({}, candidate);
        delete copy.markdown;
        return copy;
      }),
    });
  }
  function listBatches(clientId) {
    return value.operationalStore
      .listSubmissionBatches(clientId === undefined ? {} : { clientId })
      .map(toPublicBatch);
  }
  function getBatch(batchId) {
    return toPublicBatch(value.operationalStore.getSubmissionBatch(batchId));
  }
  function queuePaths(payload) {
    const platform = platforms().find(
      (candidate) =>
        candidate.id === payload.targetPlatformId &&
        candidate.contentQueueImport === true,
    );
    if (
      !platform ||
      typeof payload.filename !== "string" ||
      !payload.filename ||
      path.basename(payload.filename) !== payload.filename ||
      path.isAbsolute(payload.filename)
    )
      throw fail("CONTENT_SUBMISSION_QUEUE_ITEM_INVALID");
    const directory = path.resolve(inputRoot, platform.scanDir || platform.id);
    const filePath = path.resolve(directory, payload.filename);
    if (path.dirname(filePath) !== directory)
      throw fail("CONTENT_SUBMISSION_QUEUE_ITEM_INVALID");
    return { filePath, sidecarPath: filePath + ".submission.json" };
  }
  function previewCancelBatch(input) {
    if (!input || typeof input.batchId !== "string" || !input.batchId)
      throw fail("CONTENT_SUBMISSION_BATCH_INPUT_INVALID");
    const batch = value.operationalStore.getSubmissionBatch(input.batchId);
    const allowed = batch.items.filter(
      (candidate) =>
        candidate.status === "queued" &&
        candidate.payload &&
        candidate.payload.filename,
    );
    const planId = `cancel-${crypto.randomUUID()}`;
    cancellationPlans.set(planId, {
      batchId: batch.batchId,
      revision: batch.revision,
      itemIds: allowed.map((candidate) => candidate.itemId),
    });
    return {
      batchId: batch.batchId,
      planId,
      allowedCount: allowed.length,
      items: allowed.map((candidate) => ({
        itemId: candidate.itemId,
        articleId: candidate.articleId,
        targetPlatformId: candidate.payload.targetPlatformId,
        accountProfileId: candidate.payload.accountProfileId,
      })),
    };
  }
  function cancelBatch(input) {
    if (
      !input ||
      input.confirmed !== true ||
      typeof input.batchId !== "string" ||
      typeof input.planId !== "string"
    )
      throw fail("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED");
    const plan = cancellationPlans.get(input.planId);
    if (!plan || plan.batchId !== input.batchId)
      throw fail("SUBMISSION_ACTION_PLAN_INVALID");
    const current = value.operationalStore.getSubmissionBatch(input.batchId);
    if (current.revision !== plan.revision)
      throw fail("SUBMISSION_ACTION_STALE");
    let cancelledCount = 0;
    let idempotentCount = 0;
    for (const itemId of plan.itemIds) {
      const item = current.items.find(
        (candidate) => candidate.itemId === itemId,
      );
      if (!item) continue;
      const outcome = value.operationalStore.cancelQueuedSubmissionItem({
        batchId: current.batchId,
        itemId,
      });
      if (outcome.idempotent) {
        idempotentCount += 1;
        continue;
      }
      const files = queuePaths(item.payload || {});
      try {
        if (fs.existsSync(files.sidecarPath)) fs.unlinkSync(files.sidecarPath);
        if (fs.existsSync(files.filePath)) fs.unlinkSync(files.filePath);
      } catch (error) {
        throw fail(
          "CONTENT_SUBMISSION_QUEUE_REMOVE_FAILED",
          "Queue copy could not be removed",
        );
      }
      cancelledCount += 1;
    }
    cancellationPlans.delete(input.planId);
    if (typeof value.onDataInvalidated === "function")
      value.onDataInvalidated("SUBMISSION_BATCH_CANCELLED");
    return {
      batchId: current.batchId,
      cancelledCount,
      idempotentCount,
      batchStatus: value.operationalStore.getSubmissionBatch(current.batchId)
        .status,
      changedScopes: [
        "articleManagement",
        "articleAttention",
        "platformQueue",
      ],
    };
  }
  const CLEANED_STATUSES = new Set([
    "failed-cleaned",
    "published-cleaned",
    "cancelled-cleaned",
  ]);
  function publicationRecords(articleIds) {
    try {
      return value.operationalStore.listPublicationRecords({
        articleIds: Array.from(new Set(articleIds)),
      });
    } catch (_) {
      return [];
    }
  }
  function latestAttempt(record) {
    return record && Array.isArray(record.attempts) && record.attempts.length
      ? record.attempts[record.attempts.length - 1]
      : null;
  }
  function recordFor(records, stored) {
    const payload = stored.payload || {};
    if (payload.attemptId) {
      const byAttempt = records.find(
        (record) =>
          Array.isArray(record.attempts) &&
          record.attempts.some(
            (attempt) => attempt.attemptId === payload.attemptId,
          ),
      );
      if (byAttempt) return byAttempt;
    }
    return (
      records.find((record) => record.targetKey === stored.targetKey) || null
    );
  }
  function batchClientId(batch) {
    const item = batch.items.find(
      (candidate) =>
        candidate.payload && typeof candidate.payload.clientId === "string",
    );
    return (item && item.payload.clientId) || null;
  }
  function safeQueuePaths(payload) {
    const paths = queuePaths(payload || {});
    const directory = path.resolve(path.dirname(paths.filePath));
    if (
      path.basename(paths.filePath) !== payload.filename ||
      path.dirname(path.resolve(paths.filePath)) !== directory
    )
      throw fail(
        "SUBMISSION_QUEUE_CHANGED",
        "Submission queue path is invalid",
      );
    return paths;
  }
  function itemView(batch, stored, records) {
    const payload = stored.payload || {};
    const targetPlatformId =
      payload.targetPlatformId ||
      (/^platform:([^:]+)/.exec(stored.targetKey || "") || [])[1] ||
      null;
    const record = recordFor(records, stored);
    const latest = latestAttempt(record);
    const rawStatus = stored.status;
    let status = rawStatus;
    if (rawStatus === "completed")
      status =
        (record && record.status) || payload.outcomeStatus || "completed";
    if (rawStatus === "failed")
      status = (record && record.status) || payload.outcomeStatus || "failed";
    if (rawStatus === "failed-cleaned") status = "failed";
    if (rawStatus === "published-cleaned") status = "published";
    if (rawStatus === "cancelled-cleaned") status = "cancelled";
    let files = null;
    try {
      files = safeQueuePaths(Object.assign({}, payload, { targetPlatformId }));
    } catch (_) {}
    const item = Object.assign({}, payload, {
      itemId: stored.itemId,
      batchId: batch.batchId,
      clientId: payload.clientId || batchClientId(batch),
      articleId: stored.articleId,
      targetPlatformId,
      accountProfileId: payload.accountProfileId || null,
      publicationId:
        payload.publicationId || (record && record.publicationId) || null,
      attemptId: payload.attemptId || (latest && latest.attemptId) || null,
      status,
      storedStatus: rawStatus,
      contentHash: payload.contentHash || null,
      filePath: (files && files.filePath) || null,
      sidecarPath: (files && files.sidecarPath) || null,
    });
    const pair = files
      ? inspectSubmissionPair(
          item,
          { id: batch.batchId, clientId: item.clientId },
          undefined,
          { rootDir: root },
        )
      : {
          pairState: "identity_conflict",
          identityMatched: false,
          contentMatched: false,
          mainExists: false,
          sidecarExists: false,
          unsafePath: true,
        };
    return Object.assign(item, { record, latest, pair });
  }
  function batchViews(batch) {
    const records = publicationRecords(
      batch.items.map((item) => item.articleId),
    );
    return batch.items.map((item) => itemView(batch, item, records));
  }
  function selectionKey(item) {
    return item.clientId + "\0" + item.articleId;
  }
  function normalizeSelections(value) {
    const input = value && (value.selections || value.articles);
    if (!Array.isArray(input) || !input.length)
      throw fail("CONTENT_INPUT_INVALID", "At least one article is required");
    const seen = new Set();
    return input.map((item) => {
      if (
        !item ||
        typeof item.clientId !== "string" ||
        !item.clientId.trim() ||
        typeof item.articleId !== "string" ||
        !item.articleId.trim()
      )
        throw fail("CONTENT_INPUT_INVALID", "Article selection is invalid");
      const result = { clientId: item.clientId, articleId: item.articleId };
      if (seen.has(selectionKey(result)))
        throw fail(
          "CONTENT_INPUT_INVALID",
          "Article selection contains duplicates",
        );
      seen.add(selectionKey(result));
      return result;
    });
  }
  function allItemViews() {
    return value.operationalStore.listSubmissionBatches().flatMap(batchViews);
  }
  function findItemView(action) {
    if (!action || typeof action.batchId !== "string" || !action.batchId)
      return null;
    let batch;
    try {
      batch = value.operationalStore.getSubmissionBatch(action.batchId);
    } catch (_) {
      return null;
    }
    return (
      batchViews(batch).find(
        (item) =>
          (!action.itemId || item.itemId === action.itemId) &&
          (!action.articleId || item.articleId === action.articleId) &&
          (!action.targetPlatformId ||
            item.targetPlatformId === action.targetPlatformId) &&
          (!action.publicationId ||
            item.publicationId === action.publicationId) &&
          (!action.attemptId || item.attemptId === action.attemptId),
      ) || null
    );
  }
  function publicItem(item) {
    return {
      itemId: item.itemId,
      clientId: item.clientId,
      articleId: item.articleId,
      batchId: item.batchId,
      targetPlatformId: item.targetPlatformId,
      accountProfileId: item.accountProfileId,
      publicationId: item.publicationId,
      attemptId: item.attemptId,
      contentHash: item.contentHash,
      status: item.status,
      storedStatus: item.storedStatus,
      pairState: item.pair.pairState,
      identityMatched: item.pair.identityMatched,
      contentMatched: item.pair.contentMatched,
      mainExists: item.pair.mainExists,
      sidecarExists: item.pair.sidecarExists,
    };
  }
  function actionFingerprint(item, action) {
    return hash(
      JSON.stringify({
        action: action.action,
        itemId: item.itemId,
        batchId: item.batchId,
        articleId: item.articleId,
        targetPlatformId: item.targetPlatformId,
        publicationId: item.publicationId,
        attemptId: item.attemptId,
        status: item.status,
        storedStatus: item.storedStatus,
        revision: item.revision,
        contentHash: item.contentHash,
        pairState: item.pair.pairState,
        identityMatched: item.pair.identityMatched,
        contentMatched: item.pair.contentMatched,
        recordStatus: (item.record && item.record.status) || null,
        latestStatus: (item.latest && item.latest.status) || null,
      }),
    );
  }
  function evaluation(item, action, allowed, reasonCode) {
    const fingerprint = item ? actionFingerprint(item, action) : null;
    return {
      allowed: allowed === true,
      action: (action && action.action) || null,
      reasonCode: reasonCode || null,
      bindingFingerprint: fingerprint,
      entry: item || null,
    };
  }
  function pairReason(item) {
    if (!item || item.pair.unsafePath) return "SUBMISSION_QUEUE_CHANGED";
    if (item.pair.pairState === "identity_conflict")
      return "SUBMISSION_IDENTITY_CONFLICT";
    if (item.pair.pairState === "content_changed")
      return "SUBMISSION_CONTENT_CHANGED";
    if (["main_absent", "sidecar_absent"].includes(item.pair.pairState))
      return "SUBMISSION_QUEUE_CHANGED";
    if (
      item.pair.pairState === "both_absent" &&
      item.pair.identityMatched !== true
    )
      return "SUBMISSION_IDENTITY_CONFLICT";
    return null;
  }
  function evaluateItemAction(action) {
    if (
      !action ||
      ![
        "cancel",
        "cleanup",
        "cleanupPublishedLocal",
        "cleanupCancelledLocal",
      ].includes(action.action)
    )
      return evaluation(null, action, false, "SUBMISSION_ACTION_INVALID");
    const item = findItemView(action);
    if (!item)
      return evaluation(null, action, false, "SUBMISSION_QUEUE_ITEM_NOT_FOUND");
    const currentFingerprint = actionFingerprint(item, action);
    if (
      action.evaluationFingerprint &&
      action.evaluationFingerprint !== currentFingerprint
    )
      return evaluation(item, action, false, "SUBMISSION_ACTION_STALE");
    const pairFailure = pairReason(item);
    if (pairFailure) return evaluation(item, action, false, pairFailure);
    if (action.action === "cancel") {
      if (item.storedStatus === "cancelled")
        return evaluation(item, action, true, null);
      if (item.storedStatus !== "queued" || item.status !== "queued")
        return evaluation(
          item,
          action,
          false,
          item.storedStatus === "claimed"
            ? "ARTICLE_SUBMISSION_ACTIVE"
            : "PUBLICATION_STATUS_NOT_QUEUED",
        );
      if (
        item.record &&
        (item.record.status !== "queued" ||
          (item.latest && item.latest.status !== "queued"))
      )
        return evaluation(item, action, false, "PUBLICATION_REMOTE_STARTED");
      return evaluation(item, action, true, null);
    }
    const expected =
      action.action === "cleanup"
        ? "failed"
        : action.action === "cleanupPublishedLocal"
          ? "published"
          : "cancelled";
    const desired =
      action.action === "cleanup"
        ? "failed-cleaned"
        : action.action === "cleanupPublishedLocal"
          ? "published-cleaned"
          : "cancelled-cleaned";
    if (item.storedStatus === desired)
      return evaluation(item, action, true, null);
    if (item.status !== expected)
      return evaluation(
        item,
        action,
        false,
        ["queued", "claimed", "submitting", "submitted", "uncertain"].includes(
          item.status,
        )
          ? "ARTICLE_SUBMISSION_ACTIVE"
          : "PUBLICATION_STATUS_NOT_FAILED",
      );
    if (
      action.action === "cleanupPublishedLocal" &&
      (!item.record || item.record.status !== "published")
    )
      return evaluation(item, action, false, "PUBLICATION_ATTEMPT_MISMATCH");
    if (
      action.action === "cleanup" &&
      item.record &&
      item.record.status !== "failed"
    )
      return evaluation(item, action, false, "PUBLICATION_STATUS_NOT_FAILED");
    if (
      action.action === "cleanupCancelledLocal" &&
      item.storedStatus !== "cancelled"
    )
      return evaluation(item, action, false, "PUBLICATION_ATTEMPT_MISMATCH");
    if (
      action.attemptId &&
      item.attemptId &&
      action.attemptId !== item.attemptId
    )
      return evaluation(item, action, false, "PUBLICATION_ATTEMPT_MISMATCH");
    return evaluation(item, action, true, null);
  }
  function removePair(item) {
    [item.sidecarPath, item.filePath].forEach((filename) => {
      if (!filename) return;
      try {
        fs.unlinkSync(filename);
      } catch (error) {
        if (!error || error.code !== "ENOENT")
          throw fail(
            "CONTENT_SUBMISSION_QUEUE_REMOVE_FAILED",
            "Queue copy could not be removed",
          );
      }
    });
  }
  function fileState(filename) {
    try {
      const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink())
        return { exists: true, kind: "unsafe" };
      return {
        exists: true,
        kind: "file",
        hash: hash(fs.readFileSync(filename)),
      };
    } catch (error) {
      if (error && error.code === "ENOENT")
        return { exists: false, kind: "absent" };
      return {
        exists: true,
        kind: "unknown",
        errorCode: (error && error.code) || "EIO",
      };
    }
  }
  function pairManifest(item) {
    return {
      main: fileState(item.filePath),
      sidecar: fileState(item.sidecarPath),
    };
  }
  function sameFileState(actual, expected) {
    if (
      !actual ||
      !expected ||
      actual.exists !== expected.exists ||
      actual.kind !== expected.kind
    )
      return false;
    return !actual.exists || actual.hash === expected.hash;
  }
  function operationStagePaths(operationId) {
    const directory = path.join(
      inputRoot,
      ".submission-operations",
      hash(operationId),
    );
    return {
      directory,
      main: path.join(directory, "main.queue-copy"),
      sidecar: path.join(directory, "sidecar.json"),
    };
  }
  function assertSafeOperationDirectory(directory, label) {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      operationConflict(label + " is unsafe");
  }
  function assertOperationStageRoot(staged, allowMissing) {
    const parent = path.resolve(inputRoot, ".submission-operations");
    const expected = path.resolve(parent, path.basename(staged.directory));
    if (
      expected !== path.resolve(staged.directory) ||
      path.dirname(expected) !== parent
    )
      operationConflict("Submission operation staging path is invalid");
    if (fs.existsSync(inputRoot))
      assertSafeOperationDirectory(inputRoot, "Submission input root");
    if (fs.existsSync(parent)) {
      assertSafeOperationDirectory(parent, "Submission operation root");
      const inputReal = fs.realpathSync(inputRoot);
      const parentReal = fs.realpathSync(parent);
      if (path.dirname(parentReal) !== inputReal)
        operationConflict("Submission operation root escapes its parent");
    }
    if (!fs.existsSync(staged.directory)) {
      if (!allowMissing)
        operationConflict("Submission operation staging directory is missing");
      return false;
    }
    assertSafeOperationDirectory(
      staged.directory,
      "Submission operation staging directory",
    );
    const parentReal = fs.realpathSync(parent);
    const stageReal = fs.realpathSync(staged.directory);
    if (path.dirname(stageReal) !== parentReal)
      operationConflict(
        "Submission operation staging directory escapes its parent",
      );
    return true;
  }
  function ensureOperationStageRoot(staged) {
    assertOperationStageRoot(staged, true);
    const parent = path.dirname(staged.directory);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent);
    assertSafeOperationDirectory(parent, "Submission operation root");
    if (!fs.existsSync(staged.directory)) fs.mkdirSync(staged.directory);
    assertOperationStageRoot(staged, false);
  }
  function operationIdFor(action) {
    return typeof action.operationId === "string" && action.operationId
      ? action.operationId
      : `submission-action:${action.batchId}:${action.itemId}:${action.action}`;
  }
  function operationConflict(message) {
    throw fail(
      "SUBMISSION_ACTION_OPERATION_CONFLICT",
      message || "Submission action operation evidence is not valid",
    );
  }
  function checkpointOperation(operationId, state, payload) {
    if (
      typeof value.operationalStore.checkpointSubmissionItemAction !==
      "function"
    )
      throw fail(
        "SUBMISSION_ACTION_PROTOCOL_UNAVAILABLE",
        "Submission action recovery protocol is unavailable",
      );
    return value.operationalStore.checkpointSubmissionItemAction({
      operationId,
      state,
      payload,
    });
  }
  function operationRecord(operationId) {
    if (typeof value.operationalStore.getSubmissionItemAction !== "function")
      throw fail(
        "SUBMISSION_ACTION_PROTOCOL_UNAVAILABLE",
        "Submission action recovery protocol is unavailable",
      );
    return value.operationalStore.getSubmissionItemAction({ operationId });
  }
  function stageFile(source, target, expected, staged) {
    assertOperationStageRoot(staged, true);
    const sourceState = fileState(source);
    const targetState = fileState(target);
    if (
      targetState.kind === "unsafe" ||
      targetState.kind === "unknown" ||
      (targetState.exists && targetState.hash !== expected.hash)
    )
      operationConflict("Submission operation staging is corrupted");
    if (targetState.exists) {
      if (sourceState.exists)
        operationConflict(
          "Submission queue copy exists in both source and staging",
        );
      return;
    }
    if (
      !sourceState.exists ||
      sourceState.kind !== "file" ||
      sourceState.hash !== expected.hash
    )
      operationConflict(
        "Submission queue copy no longer matches its checkpoint",
      );
    ensureOperationStageRoot(staged);
    try {
      fs.renameSync(source, target);
    } catch (error) {
      throw fail(
        "CONTENT_SUBMISSION_QUEUE_STAGE_FAILED",
        "Queue copy could not be staged",
      );
    }
  }
  function assertOperationTopology(item, operation, staged, before) {
    if (assertOperationStageRoot(staged, true)) {
      const entries = fs.readdirSync(staged.directory);
      if (
        entries.some(
          (entry) => !["main.queue-copy", "sidecar.json"].includes(entry),
        )
      )
        operationConflict(
          "Submission operation staging contains an unexpected entry",
        );
    }
    const sourceMain = fileState(item.filePath);
    const sourceSidecar = fileState(item.sidecarPath);
    const stagedMain = fileState(staged.main);
    const stagedSidecar = fileState(staged.sidecar);
    const sourcePair =
      sameFileState(sourceMain, before.main) &&
      sameFileState(sourceSidecar, before.sidecar) &&
      !stagedMain.exists &&
      !stagedSidecar.exists;
    const mainMoved =
      sameFileState(stagedMain, before.main) &&
      sameFileState(sourceSidecar, before.sidecar) &&
      !sourceMain.exists &&
      !stagedSidecar.exists;
    const bothMoved =
      sameFileState(stagedMain, before.main) &&
      sameFileState(stagedSidecar, before.sidecar) &&
      !sourceMain.exists &&
      !sourceSidecar.exists;
    const stateAppliedCleanup =
      !sourceMain.exists &&
      !sourceSidecar.exists &&
      (!stagedMain.exists || sameFileState(stagedMain, before.main)) &&
      (!stagedSidecar.exists || sameFileState(stagedSidecar, before.sidecar));
    if (operation.state === "prepared" && !sourcePair && !mainMoved)
      operationConflict(
        "Submission queue pair is only partially or externally changed",
      );
    if (operation.state === "main_staged" && !mainMoved && !bothMoved)
      operationConflict(
        "Submission queue pair staging checkpoint is not proven",
      );
    if (["sidecar_staged", "staged"].includes(operation.state) && !bothMoved)
      operationConflict(
        "Submission queue pair staging checkpoint is not proven",
      );
    if (operation.state === "state_applied" && !stateAppliedCleanup)
      operationConflict("Submission queue cleanup checkpoint is not proven");
    if (
      operation.state === "complete" &&
      (stagedMain.exists ||
        stagedSidecar.exists ||
        sourceMain.exists ||
        sourceSidecar.exists)
    )
      operationConflict(
        "Completed submission operation has unexpected queue residue",
      );
  }
  function stageOperation(item, operation) {
    const before = operation && operation.payload && operation.payload.before;
    if (!before)
      operationConflict("Submission operation checkpoint is incomplete");
    const staged = operationStagePaths(operation.operationId);
    const mainExpected = before.main;
    const sidecarExpected = before.sidecar;
    if (
      !mainExpected.exists ||
      mainExpected.kind !== "file" ||
      !sidecarExpected.exists ||
      sidecarExpected.kind !== "file"
    )
      operationConflict(
        "Submission queue pair was not complete at operation prepare",
      );
    assertOperationTopology(item, operation, staged, before);
    if (
      ![
        "main_staged",
        "sidecar_staged",
        "staged",
        "state_applied",
        "complete",
      ].includes(operation.state)
    ) {
      stageFile(item.filePath, staged.main, mainExpected, staged);
      operation = checkpointOperation(
        operation.operationId,
        "main_staged",
        Object.assign({}, operation.payload, { stage: "main_staged" }),
      );
    }
    if (
      !["sidecar_staged", "staged", "state_applied", "complete"].includes(
        operation.state,
      )
    ) {
      stageFile(item.sidecarPath, staged.sidecar, sidecarExpected, staged);
      operation = checkpointOperation(
        operation.operationId,
        "sidecar_staged",
        Object.assign({}, operation.payload, { stage: "sidecar_staged" }),
      );
    }
    if (!["staged", "state_applied", "complete"].includes(operation.state))
      operation = checkpointOperation(
        operation.operationId,
        "staged",
        Object.assign({}, operation.payload, { stage: "staged" }),
      );
    const currentStage = {
      main: fileState(staged.main),
      sidecar: fileState(staged.sidecar),
    };
    if (
      !sameFileState(currentStage.main, mainExpected) ||
      !sameFileState(currentStage.sidecar, sidecarExpected) ||
      fileState(item.filePath).exists ||
      fileState(item.sidecarPath).exists
    )
      operationConflict(
        "Submission operation staging postcondition is not proven",
      );
    return { operation, staged };
  }
  function cleanupOperationStage(operation, staged, before) {
    assertOperationStageRoot(staged, true);
    for (const [key, filename] of [
      ["main", staged.main],
      ["sidecar", staged.sidecar],
    ]) {
      assertOperationStageRoot(staged, true);
      const state = fileState(filename);
      if (state.exists) {
        if (!sameFileState(state, before[key]))
          operationConflict(
            "Submission operation staging changed before cleanup",
          );
        try {
          fs.unlinkSync(filename);
        } catch (error) {
          throw fail(
            "CONTENT_SUBMISSION_QUEUE_STAGE_CLEANUP_FAILED",
            "Submission operation staging could not be cleaned",
          );
        }
      }
    }
    try {
      if (
        assertOperationStageRoot(staged, true) &&
        fs.readdirSync(staged.directory).length === 0
      )
        fs.rmdirSync(staged.directory);
    } catch (_) {}
  }
  function resumeItemAction(action, item, operation) {
    const desired =
      action.action === "cancel"
        ? "cancelled"
        : action.action === "cleanupPublishedLocal"
          ? "published-cleaned"
          : action.action === "cleanupCancelledLocal"
            ? "cancelled-cleaned"
            : "failed-cleaned";
    const before = operation.payload && operation.payload.before;
    const staged = operationStagePaths(operation.operationId);
    if (
      assertOperationStageRoot(staged, true) &&
      fs
        .readdirSync(staged.directory)
        .some((entry) => !["main.queue-copy", "sidecar.json"].includes(entry))
    )
      operationConflict(
        "Submission operation staging contains an unexpected entry",
      );
    if (operation.state === "complete") {
      if (
        fileState(item.filePath).exists ||
        fileState(item.sidecarPath).exists ||
        fileState(staged.main).exists ||
        fileState(staged.sidecar).exists
      )
        operationConflict(
          "Completed submission operation has unexpected queue residue",
        );
      return {
        action: action.action,
        status: desired,
        idempotent: true,
        batchId: item.batchId,
        itemId: item.itemId,
        publicationId: item.publicationId,
        attemptId: item.attemptId,
        changedScopes: [],
        domainHandled: true,
      };
    }
    if (operation.state === "state_applied") {
      if (!before || !before.main || !before.sidecar)
        operationConflict("Submission operation checkpoint is incomplete");
      assertOperationTopology(item, operation, staged, before);
      if (item.storedStatus !== desired)
        operationConflict(
          "Submission item terminal state does not match its operation",
        );
      cleanupOperationStage(operation, staged, before);
      checkpointOperation(
        operation.operationId,
        "complete",
        Object.assign({}, operation.payload, { stage: "complete" }),
      );
      return {
        action: action.action,
        status: desired,
        idempotent: true,
        batchId: item.batchId,
        itemId: item.itemId,
        publicationId: item.publicationId,
        attemptId: item.attemptId,
        changedScopes: [],
        domainHandled: true,
      };
    }
    const stagedResult = stageOperation(item, operation);
    operation = stagedResult.operation;
    let result;
    if (action.action === "cancel")
      result = value.operationalStore.cancelQueuedSubmissionItem({
        batchId: item.batchId,
        itemId: item.itemId,
        operationId: operation.operationId,
      });
    else
      result = value.operationalStore.markSubmissionItemCleaned({
        batchId: item.batchId,
        itemId: item.itemId,
        fromStatus:
          item.storedStatus === "completed" ? "completed" : item.storedStatus,
        action: action.action,
        operationId: operation.operationId,
      });
    cleanupOperationStage(operation, stagedResult.staged, before);
    checkpointOperation(
      operation.operationId,
      "complete",
      Object.assign({}, operation.payload, { stage: "complete" }),
    );
    notify(
      action.action === "cancel"
        ? "SUBMISSION_QUEUE_CANCELLED"
        : "SUBMISSION_QUEUE_CLEANED",
    );
    return {
      action: action.action,
      status: result.status,
      idempotent: result.idempotent === true,
      batchId: item.batchId,
      itemId: item.itemId,
      publicationId: item.publicationId,
      attemptId: item.attemptId,
      physicalFilesAlreadyAbsent: true,
      changedScopes: [
        "articleManagement",
        "articleAttention",
        "platformQueue",
      ],
      domainHandled: true,
    };
  }
  function notify(reasonCode) {
    if (typeof value.onDataInvalidated === "function")
      value.onDataInvalidated(reasonCode);
  }
  function applyItemAction(action) {
    const item = findItemView(action);
    if (!item)
      throw fail(
        "SUBMISSION_QUEUE_ITEM_NOT_FOUND",
        "Submission queue item was not found",
      );
    const stableOperationId = operationIdFor(action);
    let operation = operationRecord(stableOperationId);
    if (!operation) {
      const checked = evaluateItemAction(action);
      if (!checked.allowed)
        throw fail(
          checked.reasonCode || "SUBMISSION_QUEUE_CHANGED",
          "Submission item action is no longer valid",
        );
      const before = pairManifest(item);
      operation = value.operationalStore.prepareSubmissionItemAction({
        operationId: stableOperationId,
        batchId: item.batchId,
        itemId: item.itemId,
        action: action.action,
        expectedStatus: item.storedStatus,
        expectedFingerprint: checked.bindingFingerprint,
        payload: { before, stage: "prepared" },
      });
    } else if (
      operation.batchId !== item.batchId ||
      operation.itemId !== item.itemId ||
      operation.action !== action.action ||
      (action.evaluationFingerprint &&
        operation.expectedFingerprint !== action.evaluationFingerprint)
    )
      operationConflict();
    return resumeItemAction(
      Object.assign({}, action, { operationId: stableOperationId }),
      item,
      operation,
    );
  }
  function submissionAction(item, action) {
    const safe = publicItem(item);
    return Object.assign(safe, {
      action,
      evaluationFingerprint: actionFingerprint(item, { action }),
    });
  }
  function previewArticleRemovalImpact(input) {
    const selections = normalizeSelections(input);
    const selected = new Set(selections.map(selectionKey));
    const views = allItemViews().filter((item) =>
      selected.has(selectionKey(item)),
    );
    const queuedToCancel = [];
    const failedToClean = [];
    const publishedToClean = [];
    const cancelledToClean = [];
    const blockedItems = [];
    const items = views.map((item) => {
      const safe = publicItem(item);
      if (
        ["submitting", "submitted", "uncertain", "claimed"].includes(
          item.status,
        )
      )
        blockedItems.push(
          Object.assign(safe, { reasonCode: "ARTICLE_SUBMISSION_ACTIVE" }),
        );
      else if (item.status === "queued") {
        const checked = evaluateItemAction(
          Object.assign({}, safe, { action: "cancel" }),
        );
        if (checked.allowed)
          queuedToCancel.push(submissionAction(item, "cancel"));
        else
          blockedItems.push(
            Object.assign(safe, {
              reasonCode: checked.reasonCode || "SUBMISSION_QUEUE_CHANGED",
            }),
          );
      } else if (item.status === "failed") {
        const checked = evaluateItemAction(
          Object.assign({}, safe, { action: "cleanup" }),
        );
        if (checked.allowed)
          failedToClean.push(submissionAction(item, "cleanup"));
        else
          blockedItems.push(
            Object.assign(safe, {
              reasonCode: checked.reasonCode || "SUBMISSION_QUEUE_CHANGED",
            }),
          );
      } else if (item.status === "published") {
        const checked = evaluateItemAction(
          Object.assign({}, safe, { action: "cleanupPublishedLocal" }),
        );
        if (checked.allowed)
          publishedToClean.push(
            submissionAction(item, "cleanupPublishedLocal"),
          );
        else
          blockedItems.push(
            Object.assign(safe, {
              reasonCode: checked.reasonCode || "SUBMISSION_IDENTITY_CONFLICT",
            }),
          );
      } else if (item.status === "cancelled") {
        const checked = evaluateItemAction(
          Object.assign({}, safe, { action: "cleanupCancelledLocal" }),
        );
        if (checked.allowed)
          cancelledToClean.push(
            submissionAction(item, "cleanupCancelledLocal"),
          );
        else
          blockedItems.push(
            Object.assign(safe, {
              reasonCode: checked.reasonCode || "SUBMISSION_IDENTITY_CONFLICT",
            }),
          );
      } else if (!CLEANED_STATUSES.has(item.storedStatus))
        blockedItems.push(
          Object.assign(safe, { reasonCode: "SUBMISSION_QUEUE_CHANGED" }),
        );
      return Object.assign(safe, { sourceArticleState: "active" });
    });
    return {
      selections,
      articleCount: selections.length,
      items,
      queuedToCancel,
      failedToClean,
      publishedToClean,
      cancelledToClean,
      blockedItems,
      queuedToCancelCount: queuedToCancel.length,
      failedToCleanCount: failedToClean.length,
      publishedToCleanCount: publishedToClean.length,
      cancelledToCleanCount: cancelledToClean.length,
      terminalCleanupCount:
        failedToClean.length +
        publishedToClean.length +
        cancelledToClean.length,
      canCommit: blockedItems.length === 0,
    };
  }
  function reconcileArticleRemovalAction(action, operationId) {
    if (
      !action ||
      typeof action.batchId !== "string" ||
      typeof action.articleId !== "string"
    )
      return {
        status: "unknown",
        reasonCode: "QUEUE_ACTION_IDENTITY_INVALID",
        operationId,
      };
    const item = findItemView(action);
    if (!item)
      return {
        status: "unknown",
        reasonCode: "SUBMISSION_QUEUE_ITEM_NOT_FOUND",
        operationId,
      };
    const expectedFingerprint = action.evaluationFingerprint || null;
    const currentFingerprint = actionFingerprint(item, {
      action: action.action,
    });
    let operation = null;
    try {
      operation = operationRecord(operationId);
    } catch (error) {
      return {
        status: "unknown",
        operationId,
        reasonCode:
          (error && error.code) || "SUBMISSION_ACTION_PROTOCOL_UNAVAILABLE",
      };
    }
    if (
      operation &&
      (operation.batchId !== item.batchId ||
        operation.itemId !== item.itemId ||
        operation.action !== action.action ||
        (expectedFingerprint &&
          operation.expectedFingerprint !== expectedFingerprint))
    )
      return {
        status: "unknown",
        operationId,
        reasonCode: "SUBMISSION_ACTION_OPERATION_CONFLICT",
      };
    const terminal =
      action.action === "cancel"
        ? item.storedStatus === "cancelled"
        : action.action === "cleanup"
          ? item.storedStatus === "failed-cleaned"
          : action.action === "cleanupPublishedLocal"
            ? item.storedStatus === "published-cleaned"
            : item.storedStatus === "cancelled-cleaned";
    if (terminal) {
      if (operation && operation.state === "state_applied") {
        try {
          const before = operation.payload && operation.payload.before;
          if (!before || operation.expectedFingerprint !== expectedFingerprint)
            return {
              status: "unknown",
              operationId,
              reasonCode: "QUEUE_OPERATION_FINGERPRINT_CONFLICT",
            };
          assertOperationTopology(
            item,
            operation,
            operationStagePaths(operation.operationId),
            before,
          );
        } catch (error) {
          return {
            status: "unknown",
            operationId,
            reasonCode:
              (error && error.code) || "QUEUE_OPERATION_RESULT_UNPROVABLE",
          };
        }
        return {
          status: "cleanup_pending",
          operationId,
          result: {
            idempotent: true,
            status: item.storedStatus,
            itemId: item.itemId,
          },
        };
      }
      if (operation && operation.state === "complete")
        return {
          status: "completed",
          operationId,
          result: {
            idempotent: true,
            status: item.storedStatus,
            itemId: item.itemId,
          },
        };
      return {
        status: "unknown",
        operationId,
        reasonCode: "QUEUE_OPERATION_RESULT_UNPROVABLE",
      };
    }
    const expectedStatus =
      action.action === "cancel"
        ? "queued"
        : action.action === "cleanup"
          ? "failed"
          : action.action === "cleanupPublishedLocal"
            ? "published"
            : "cancelled";
    if (
      item.storedStatus === expectedStatus &&
      ((operation && operation.expectedFingerprint === expectedFingerprint) ||
        (!operation && expectedFingerprint === currentFingerprint))
    )
      return {
        status: "retryable",
        operationId,
        reasonCode: "QUEUE_OPERATION_NOT_COMPLETED",
      };
    return {
      status: "unknown",
      operationId,
      reasonCode: "QUEUE_OPERATION_RESULT_UNPROVABLE",
    };
  }
  function buildSubmissionActionPlan(input) {
    if (!input || typeof input.batchId !== "string" || !input.batchId)
      throw fail(
        "CONTENT_SUBMISSION_BATCH_INPUT_INVALID",
        "Batch id is required",
      );
    if (input.action && input.action !== "cancel")
      throw fail("SUBMISSION_ACTION_INVALID", "Submission action is invalid");
    const batch = value.operationalStore.getSubmissionBatch(input.batchId);
    const action = input.action || "cancel";
    const items = batchViews(batch).map((item) => {
      const safe = publicItem(item);
      const checked = evaluateItemAction(Object.assign({}, safe, { action }));
      return Object.assign(safe, {
        action,
        allowed: checked.allowed,
        reasonCode: checked.reasonCode,
        fingerprint: checked.bindingFingerprint,
      });
    });
    const revision = hash(
      JSON.stringify({
        batchId: batch.batchId,
        revision: batch.revision,
        items,
      }),
    );
    const planId = hash(
      JSON.stringify({
        batchId: batch.batchId,
        action,
        revision,
        items: items.map((item) => [
          item.itemId,
          item.allowed,
          item.fingerprint,
        ]),
      }),
    );
    cancellationPlans.set(planId, {
      batchId: batch.batchId,
      revision: batch.revision,
      itemIds: items.filter((item) => item.allowed).map((item) => item.itemId),
    });
    return {
      batchId: batch.batchId,
      clientId: batchClientId(batch),
      action,
      revision,
      planId,
      fingerprint: planId,
      items,
      allowedCount: items.filter((item) => item.allowed).length,
      blockedCount: items.filter((item) => !item.allowed).length,
    };
  }
  function reconcileBatch(batchId) {
    const batch = value.operationalStore.getSubmissionBatch(batchId);
    const items = batchViews(batch).map(publicItem);
    return { batch: Object.assign(toPublicBatch(batch), { items }), items };
  }
  function previewCancelBatch(input) {
    const plan = buildSubmissionActionPlan({
      batchId: input && input.batchId,
      action: "cancel",
    });
    return {
      batchId: plan.batchId,
      planId: plan.planId,
      allowedCount: plan.allowedCount,
      blockedCount: plan.blockedCount,
      items: plan.items,
    };
  }
  function cancelBatch(input) {
    if (
      !input ||
      input.confirmed !== true ||
      typeof input.batchId !== "string" ||
      typeof input.planId !== "string"
    )
      throw fail("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED");
    const plan = cancellationPlans.get(input.planId);
    if (!plan || plan.batchId !== input.batchId)
      throw fail("SUBMISSION_ACTION_PLAN_INVALID");
    const current = value.operationalStore.getSubmissionBatch(input.batchId);
    if (current.revision !== plan.revision)
      throw fail("SUBMISSION_ACTION_STALE");
    let cancelledCount = 0;
    let idempotentCount = 0;
    let skippedCount = 0;
    for (const itemId of plan.itemIds) {
      const item = batchViews(current).find(
        (candidate) => candidate.itemId === itemId,
      );
      if (!item) {
        skippedCount += 1;
        continue;
      }
      try {
        const result = applyItemAction({
          action: "cancel",
          batchId: item.batchId,
          itemId: item.itemId,
          articleId: item.articleId,
          targetPlatformId: item.targetPlatformId,
          operationId: operationIdFor({
            action: "cancel",
            batchId: item.batchId,
            itemId: item.itemId,
          }),
          evaluationFingerprint: actionFingerprint(item, { action: "cancel" }),
        });
        if (result.idempotent) idempotentCount += 1;
        else cancelledCount += 1;
      } catch (_) {
        skippedCount += 1;
      }
    }
    cancellationPlans.delete(input.planId);
    if (cancelledCount || idempotentCount) notify("SUBMISSION_BATCH_CANCELLED");
    const after = value.operationalStore.getSubmissionBatch(input.batchId);
    return {
      batchId: after.batchId,
      planId: input.planId,
      cancelledCount,
      idempotentCount,
      skippedCount,
      batchStatus: after.status,
      changedScopes:
        cancelledCount || idempotentCount
          ? [
              "articleManagement",
              "articleAttention",
              "platformQueue",
            ]
          : [],
      items: after.items,
    };
  }
  function previewCleanupFailedItems(input) {
    const batch = value.operationalStore.getSubmissionBatch(
      input && input.batchId,
    );
    const items = batchViews(batch).map((item) => {
      const checked = evaluateItemAction(
        Object.assign({}, publicItem(item), { action: "cleanup" }),
      );
      return Object.assign(publicItem(item), {
        cleanable: checked.allowed,
        reasonCode: checked.allowed ? null : checked.reasonCode,
      });
    });
    return {
      batchId: batch.batchId,
      cleanableCount: items.filter((item) => item.cleanable).length,
      uncleanableCount: items.filter((item) => !item.cleanable).length,
      items,
    };
  }
  function cleanupFailedItems(input) {
    if (!input || input.confirmed !== true || typeof input.batchId !== "string")
      throw fail("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED");
    const preview = previewCleanupFailedItems(input);
    let cleanedCount = 0;
    let skippedCount = 0;
    preview.items.forEach((item) => {
      if (!item.cleanable) {
        skippedCount += 1;
        return;
      }
      try {
        applyItemAction(
          Object.assign({}, item, {
            action: "cleanup",
            evaluationFingerprint:
              item.actionFingerprint ||
              actionFingerprint(findItemView(item), { action: "cleanup" }),
          }),
        );
        cleanedCount += 1;
      } catch (_) {
        skippedCount += 1;
      }
    });
    return {
      batchId: input.batchId,
      cleanedCount,
      skippedCount,
      items: value.operationalStore.getSubmissionBatch(input.batchId).items,
    };
  }
  function previewTrashedArticleQueueResidue() {
    const items = allItemViews()
      .filter((item) => {
        try {
          return (
            contentStore.isArticleTrashed(item.clientId, item.articleId) &&
            !CLEANED_STATUSES.has(item.storedStatus)
          );
        } catch (_) {
          return false;
        }
      })
      .map((item) => {
        const action =
          item.status === "queued"
            ? "cancel"
            : item.status === "failed"
              ? "cleanup"
              : item.status === "published"
                ? "cleanupPublishedLocal"
                : item.status === "cancelled"
                  ? "cleanupCancelledLocal"
                  : null;
        const checked = action
          ? evaluateItemAction(Object.assign({}, publicItem(item), { action }))
          : { allowed: false, reasonCode: "ARTICLE_SUBMISSION_ACTIVE" };
        return Object.assign(publicItem(item), {
          sourceArticleState: "trashed",
          reasonCode: checked.reasonCode || "SOURCE_ARTICLE_TRASHED",
          repairAction: checked.allowed ? action : null,
          evaluationFingerprint: checked.allowed
            ? checked.bindingFingerprint
            : null,
        });
      });
    return {
      items,
      cleanableItems: items.filter((item) => item.repairAction),
      reportedItems: items.filter((item) => !item.repairAction),
      cleanableCount: items.filter((item) => item.repairAction).length,
      reportedCount: items.filter((item) => !item.repairAction).length,
    };
  }
  function cleanupTrashedArticleQueueResidue(input) {
    if (!input || input.confirmed !== true)
      throw fail("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED");
    const preview = previewTrashedArticleQueueResidue();
    let cleanedCount = 0;
    let failedCount = 0;
    const items = preview.items.map((item) => {
      if (!item.repairAction)
        return {
          itemId: item.itemId,
          articleId: item.articleId,
          status: item.status,
          reasonCode: item.reasonCode || "RESIDUE_NOT_CLEANABLE",
        };
      try {
        const result = applyItemAction(
          Object.assign({}, item, {
            action: item.repairAction,
            evaluationFingerprint: item.evaluationFingerprint,
          }),
        );
        cleanedCount += 1;
        return {
          itemId: item.itemId,
          articleId: item.articleId,
          status: "cleaned",
          action: item.repairAction,
          resultStatus: result.status,
        };
      } catch (error) {
        failedCount += 1;
        return {
          itemId: item.itemId,
          articleId: item.articleId,
          status: item.status,
          action: item.repairAction,
          reasonCode:
            (error && error.code) || "SUBMISSION_RESIDUE_CLEANUP_FAILED",
        };
      }
    });
    const after = previewTrashedArticleQueueResidue();
    if (cleanedCount) notify("TRASHED_QUEUE_RESIDUE_RESOLVED");
    return {
      status: failedCount ? "failed" : cleanedCount ? "completed" : "no-op",
      cleanedCount,
      failedCount,
      remainingCount: after.items.length,
      cleanableCount: after.cleanableCount,
      reportedCount: after.reportedCount,
      items,
      remainingItems: after.items.map((item) => ({
        itemId: item.itemId,
        articleId: item.articleId,
        status: item.status,
        reasonCode: item.reasonCode || null,
      })),
    };
  }
  function inspectPair(input) {
    const item = findItemView(input);
    if (!item) throw fail("SUBMISSION_QUEUE_ITEM_NOT_FOUND");
    return item.pair;
  }
  function listArchiveFailures() {
    try {
      return value.operationalStore
        .listPostProcessingAttention()
        .map((item) =>
          Object.assign({}, item, {
            reasonCode: "PUBLISHED_LOCAL_ARCHIVE_FAILED",
          }),
        );
    } catch (_) {
      return [];
    }
  }
  function isSubmissionItemExecutable(action) {
    return evaluateItemAction(Object.assign({}, action, { action: "cancel" }))
      .allowed;
  }
  function failedPublicationRetryPlan(input) {
    const publicationId = input && input.publicationId;
    if (typeof publicationId !== "string" || !publicationId)
      throw fail("PUBLICATION_RETRY_INPUT_INVALID");
    const record = value.operationalStore.listPublicationRecords({ publicationIds: [publicationId] })[0];
    const attempt = record && Array.isArray(record.attempts) && record.attempts.length
      ? record.attempts[record.attempts.length - 1]
      : null;
    if (!record || record.status !== "failed" || !attempt || attempt.status !== "failed")
      return { publicationId, requiresConfirmation: true, eligible: false, reasonCode: "PUBLICATION_RETRY_NOT_ELIGIBLE" };
    const matches = value.operationalStore.listSubmissionBatches({}).flatMap((batch) =>
      batch.items
        .filter((item) => item.status === "failed" && item.articleId === record.articleId && item.targetKey === record.targetKey && item.payload && item.payload.attemptId === attempt.attemptId)
        .map((item) => ({ batch, item })),
    );
    if (matches.length !== 1)
      return { publicationId, requiresConfirmation: true, eligible: false, reasonCode: "PUBLICATION_RETRY_BATCH_ITEM_REQUIRED" };
    const { batch, item } = matches[0];
    const payload = item.payload || {};
    let articleValue;
    try { articleValue = contentStore.getArticle(payload.clientId, item.articleId); }
    catch (_) { return { publicationId, requiresConfirmation: true, eligible: false, reasonCode: "CONTENT_SUBMISSION_ARTICLE_NOT_FOUND" }; }
    if (!evaluateArticleSubmissionEligibility(articleValue).eligible)
      return { publicationId, requiresConfirmation: true, eligible: false, reasonCode: "CONTENT_EXPORT_NOT_READY" };
    let paths;
    try { paths = queuePaths(payload); }
    catch (_) { return { publicationId, requiresConfirmation: true, eligible: false, reasonCode: "CONTENT_SUBMISSION_QUEUE_ITEM_INVALID" }; }
    if (!regularFile(paths.filePath) || !regularFile(paths.sidecarPath) || hash(fs.readFileSync(paths.filePath)) !== payload.contentHash)
      return { publicationId, requiresConfirmation: true, eligible: false, reasonCode: "CONTENT_SUBMISSION_QUEUE_ITEM_CHANGED" };
    let sidecar;
    try { sidecar = JSON.parse(fs.readFileSync(paths.sidecarPath, "utf8")); }
    catch (_) { sidecar = null; }
    if (!sidecar || sidecar.submissionBatchId !== batch.batchId || sidecar.generatedArticleId !== item.articleId || sidecar.accountProfileId !== payload.accountProfileId || (sidecar.targetPlatformId || sidecar.targetPlatform) !== payload.targetPlatformId)
      return { publicationId, requiresConfirmation: true, eligible: false, reasonCode: "CONTENT_SUBMISSION_QUEUE_ITEM_CHANGED" };
    return {
      publicationId,
      requiresConfirmation: true,
      eligible: typeof value.retryFailedPublication === "function",
      reasonCode: typeof value.retryFailedPublication === "function" ? null : "PUBLICATION_RETRY_REQUIRES_WORKFLOW",
      task: {
        publicationId,
        batchId: batch.batchId,
        itemId: item.itemId,
        filename: payload.filename,
        sourcePlatformId: payload.sourcePlatformId,
        targetPlatformId: payload.targetPlatformId,
        accountProfileId: payload.accountProfileId,
      },
    };
  }
  function previewRetryFailedPublication(input) {
    const plan = failedPublicationRetryPlan(input);
    const result = Object.assign({}, plan);
    delete result.task;
    return result;
  }
  async function retryFailedPublication(input) {
    if (!input || input.confirmed !== true)
      throw fail("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED");
    const plan = failedPublicationRetryPlan(input);
    if (!plan.eligible) throw fail(plan.reasonCode || "PUBLICATION_RETRY_NOT_ELIGIBLE");
    const result = await value.retryFailedPublication(plan.task);
    notify("PUBLICATION_RETRIED");
    return result;
  }
  return Object.freeze({
    previewExport,
    exportArticle,
    listPlatforms,
    previewBatch,
    createBatch,
    listBatches,
    getBatch,
    buildSubmissionActionPlan,
    previewCancelBatch,
    cancelBatch,
    reconcileBatch,
    previewCleanupFailedItems,
    cleanupFailedItems,
    previewArticleRemovalImpact,
    cancelArticleSubmissionItem: (action) =>
      applyItemAction(Object.assign({}, action, { action: "cancel" })),
    cleanupArticleSubmissionItem: (action) =>
      applyItemAction(Object.assign({}, action, { action: "cleanup" })),
    cleanupPublishedArticleLocal: (action) =>
      applyItemAction(
        Object.assign({}, action, { action: "cleanupPublishedLocal" }),
      ),
    cleanupCancelledArticleLocal: (action) =>
      applyItemAction(
        Object.assign({}, action, { action: "cleanupCancelledLocal" }),
      ),
    reconcileArticleRemovalAction,
    inspectSubmissionPair: inspectPair,
    evaluateItemAction,
    isSubmissionItemExecutable,
    previewTrashedArticleQueueResidue,
    cleanupTrashedArticleQueueResidue,
    previewRetryFailedPublication,
    retryFailedPublication,
    listArchiveFailures,
  });
}

module.exports = { createOperationalContentSubmissionService };

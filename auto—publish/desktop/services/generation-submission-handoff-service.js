const crypto = require("crypto");
const { evaluateArticleSubmissionEligibility } = require("../../src/content/article-submission-eligibility");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

function handoffError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertId(value, label) {
  if (typeof value !== "string" || !value.trim() || !/^[A-Za-z0-9_.:-]+$/.test(value)) throw handoffError("HANDOFF_INPUT_INVALID", `${label} is invalid`);
  return value;
}
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function latestRevision(batch) { return batch && (batch.revision || batch.updatedAt || batch.version || batch.id); }

function assertInputShape(input, commit) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw handoffError("HANDOFF_INPUT_INVALID", "Handoff input is invalid");
  const allowed = commit
    ? ["generationBatchId", "platformId", "accountProfileId", "previewToken", "confirmed"]
    : ["generationBatchId", "platformId", "accountProfileId"];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw handoffError("HANDOFF_INPUT_INVALID", "Handoff input is invalid");
  return input;
}

function createGenerationSubmissionHandoffService(options) {
  const opts = options || {};
  const generationBatchService = opts.generationBatchService;
  const contentStore = opts.contentStore;
  const regularQueueApplication = opts.regularQueueApplication;
  if (!generationBatchService || typeof generationBatchService.get !== "function" || !contentStore || typeof contentStore.findByGenerationTaskId !== "function" || !regularQueueApplication ||
      typeof regularQueueApplication.previewRegularQueueAdmission !== "function" ||
      typeof regularQueueApplication.admitRegularQueueItems !== "function") {
    throw handoffError("HANDOFF_SERVICE_INVALID", "Generation submission handoff dependencies are incomplete");
  }
  const tokens = new Map();
  const completedClients = new Map();

  function targetPlatforms() {
    if (Array.isArray(opts.targetPlatforms)) return opts.targetPlatforms.slice();
    return [];
  }

  function normalizeTarget(value) {
    if (typeof value !== "string" || !value.trim()) throw handoffError("HANDOFF_TARGET_REQUIRED", "A submission target is required");
    const platformId = assertId(value.trim(), "platform id");
    const available = new Map(targetPlatforms().map((item) => [item.id, item]));
    const platform = available.get(platformId) || { id: platformId, contentQueueImport: false };
    if (platform.contentQueueImport !== true) throw handoffError("HANDOFF_TARGET_UNSUPPORTED", "Submission target does not support queue import");
    return { platformId, platform };
  }

  function getBatch(generationBatchId) {
    const batch = generationBatchService.get(assertId(generationBatchId, "generation batch id"));
    if (!batch || !["completed", "stopped"].includes(batch.status)) throw handoffError("HANDOFF_BATCH_NOT_TERMINAL", "Generation batch must be completed or stopped before submission handoff");
    return batch;
  }

  function findArticle(task, generationIndex) {
    let article = null;
    try {
      const result = (generationIndex || contentStore).findByGenerationTaskId(task.id);
      if (result.kind === "many") return { article: null, reasonCode: "HANDOFF_ARTICLE_IDENTITY_CONFLICT" };
      article = result.kind === "one" ? result.article : null;
    } catch (error) {
      reportDiagnostic({
        code: "HANDOFF_ARTICLE_LOOKUP_FAILED",
        module: "generation-submission-handoff",
        category: "storage",
        operationId: "generation-handoff-article-read",
        metadata: {
          operation: "article-read",
          phase: "resolve",
          outcome: "failed",
          errorCode: error && typeof error.code === "string" && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code)
            ? error.code
            : "ARTICLE_LOOKUP_FAILED"
        }
      });
      throw handoffError("HANDOFF_ARTICLE_LOOKUP_FAILED", "Generated article could not be read for submission handoff");
    }
    if (!article && task.articleId && generationIndex && typeof generationIndex.findByArticleId === "function") {
      const byArticle = generationIndex.findByArticleId(task.articleId);
      if (byArticle.kind === "many") return { article: null, reasonCode: "HANDOFF_ARTICLE_IDENTITY_CONFLICT" };
      article = byArticle.kind === "one" ? byArticle.article : null;
    }
    if (!article || article.clientId !== task.clientId || (task.articleId && article.id !== task.articleId) || article.generationTaskId !== task.id || (article.generationBatchId && task.generationBatchId && article.generationBatchId !== task.generationBatchId)) {
      return { article: null, reasonCode: "HANDOFF_ARTICLE_IDENTITY_CONFLICT" };
    }
    return { article, reasonCode: null };
  }

  function articleFingerprint(article) {
    if (typeof contentStore.fingerprintArticle === "function") return contentStore.fingerprintArticle(article);
    return hash(article);
  }

  function resolveArticles(batch) {
    const generationIndex = typeof contentStore.createGenerationTaskIndex === "function" ? contentStore.createGenerationTaskIndex() : contentStore;
    const entries = [];
    (batch.tasks || []).filter((task) => task && task.status === "succeeded").forEach((task) => {
      const found = findArticle(Object.assign({}, task, { generationBatchId: batch.id }), generationIndex);
      const eligibility = found.article ? evaluateArticleSubmissionEligibility(found.article) : null;
      entries.push({ task, article: found.article, eligibility, reasonCode: found.reasonCode || (eligibility && !eligibility.eligible ? eligibility.reasonCodes[0] : null), fingerprint: found.article ? articleFingerprint(found.article) : null });
    });
    const identities = new Map();
    entries.forEach((entry) => {
      if (!entry.article || typeof entry.article.id !== "string" || typeof entry.article.clientId !== "string") return;
      const identity = `${entry.article.clientId}\u0000${entry.article.id}`;
      const previous = identities.get(identity);
      if (previous) {
        previous.reasonCode = "HANDOFF_ARTICLE_IDENTITY_CONFLICT";
        entry.reasonCode = "HANDOFF_ARTICLE_IDENTITY_CONFLICT";
      } else {
        identities.set(identity, entry);
      }
    });
    return entries;
  }

  function normalizeAccountProfile(value) {
    if (typeof value !== "string" || !value.trim()) {
      throw handoffError("ACCOUNT_PROFILE_REQUIRED", "A platform account profile is required");
    }
    return assertId(value.trim(), "account profile id");
  }

  function baseFingerprint(batch, platformId, accountProfileId, entries) {
    return hash({ batchId: batch.id, revision: latestRevision(batch), platformId, accountProfileId, articles: entries.map((entry) => ({ taskId: entry.task.id, clientId: entry.task.clientId, articleId: entry.article && entry.article.id || entry.task.articleId || null, fingerprint: entry.fingerprint, reasonCode: entry.reasonCode })) });
  }

  function safeItem(item, platformId) {
    return { articleId: item.articleId, targetPlatformId: platformId, status: item.status, reasonCode: item.reasonCode || null };
  }

  function admissionCounts(preview) {
    const blockedPublishedReasons = new Set(["ARTICLE_PUBLISHED_IMMUTABLE"]);
    const blockedUncertainReasons = new Set([
      "PUBLICATION_UNCERTAIN",
      "PUBLICATION_STATUS_UNKNOWN",
      "SUBMISSION_STATUS_UNKNOWN",
      "MEDIA_ORDER_MISSING",
      "ORDER_STATUS_UNKNOWN",
    ]);
    let blockedPublishedCount = 0;
    let blockedUncertainCount = 0;
    for (const item of preview.items || []) {
      if (item.status !== "conflict") continue;
      if (blockedPublishedReasons.has(item.reasonCode)) blockedPublishedCount += 1;
      else if (blockedUncertainReasons.has(item.reasonCode)) blockedUncertainCount += 1;
    }
    return {
      blockedPublishedCount,
      blockedUncertainCount,
      blockedContentCount: preview.missingCount || 0,
      conflictCount: Math.max(
        0,
        (preview.conflictCount || 0) - blockedPublishedCount - blockedUncertainCount,
      ),
    };
  }

  function admissionInput(group, platformId, accountProfileId) {
    return {
      articleRefs: group.entries.map((entry) => ({
        clientId: entry.article.clientId,
        articleId: entry.article.id,
      })),
      platformId,
      accountProfileId,
    };
  }

  function buildPreview(input) {
    const target = normalizeTarget(input.platformId);
    const accountProfileId = normalizeAccountProfile(input.accountProfileId);
    const batch = getBatch(input.generationBatchId);
    const entries = resolveArticles(batch);
    const valid = entries.filter((entry) => entry.article && entry.eligibility?.eligible && !entry.reasonCode);
    const invalidArticles = entries.filter((entry) => !entry.article || !entry.eligibility?.eligible || entry.reasonCode).map((entry) => ({ clientId: entry.task.clientId, articleId: entry.task.articleId || entry.article?.id || null, taskId: entry.task.id, reasonCode: entry.reasonCode || "HANDOFF_ARTICLE_NOT_READY" }));
    const byClient = new Map();
    valid.forEach((entry) => {
      const group = byClient.get(entry.article.clientId) || { clientId: entry.article.clientId, articleIds: [], entries: [] };
      group.articleIds.push(entry.article.id);
      group.entries.push(entry);
      byClient.set(entry.article.clientId, group);
    });
    const clientGroups = [];
    let queueableTaskCount = 0;
    let idempotentCount = 0;
    let blockedPublishedCount = 0;
    let blockedUncertainCount = 0;
    let conflictCount = invalidArticles.filter((item) => item.reasonCode === "HANDOFF_ARTICLE_IDENTITY_CONFLICT").length;
    let blockedContentCount = invalidArticles.length - conflictCount;
    const admissionPreviews = new Map();
    byClient.forEach((group) => {
      const admissionPreview = regularQueueApplication.previewRegularQueueAdmission(
        admissionInput(group, target.platformId, accountProfileId),
      );
      const counts = admissionCounts(admissionPreview);
      admissionPreviews.set(group.clientId, admissionPreview);
      queueableTaskCount += admissionPreview.queueableCount || 0;
      idempotentCount += admissionPreview.idempotentCount || 0;
      blockedPublishedCount += counts.blockedPublishedCount;
      blockedUncertainCount += counts.blockedUncertainCount;
      conflictCount += counts.conflictCount;
      blockedContentCount += counts.blockedContentCount;
      clientGroups.push({
        clientId: group.clientId,
        articleCount: group.articleIds.length,
        queueableTaskCount: admissionPreview.queueableCount || 0,
        idempotentCount: admissionPreview.idempotentCount || 0,
        blockedPublishedCount: counts.blockedPublishedCount,
        blockedUncertainCount: counts.blockedUncertainCount,
        blockedContentCount: counts.blockedContentCount,
        conflictCount: counts.conflictCount,
        items: (admissionPreview.items || [])
          .filter((item) => item.status !== "queueable" && item.status !== "idempotent")
          .map((item) => safeItem(item, target.platformId))
      });
    });
    const fingerprint = baseFingerprint(batch, target.platformId, accountProfileId, entries);
    const previewToken = `handoff:${crypto.randomUUID()}`;
    tokens.set(previewToken, { fingerprint, generationBatchId: batch.id, platformId: target.platformId, accountProfileId, batchRevision: latestRevision(batch) });
    const result = {
      generationBatchId: batch.id,
      batchRevision: latestRevision(batch),
      previewToken,
      articleCount: valid.length,
      clientCount: byClient.size,
      platformId: target.platformId,
      accountProfileId,
      estimatedTaskCount: valid.length,
      queueableTaskCount,
      idempotentCount,
      blockedPublishedCount,
      blockedUncertainCount,
      blockedContentCount,
      conflictCount,
      unavailableArticleCount: invalidArticles.length,
      invalidArticles,
      clientGroups
    };
    // Keep the full entries only inside the application service. The property
    // is non-enumerable so IPC/renderer DTOs cannot receive article bodies.
    Object.defineProperty(result, "__entries", { value: entries, enumerable: false });
    Object.defineProperty(result, "__admissionPreviews", { value: admissionPreviews, enumerable: false });
    return result;
  }

  function preview(input) {
    return buildPreview(assertInputShape(input, false));
  }

  function commit(input) {
    assertInputShape(input, true);
    if (!input || input.confirmed !== true || typeof input.previewToken !== "string") throw handoffError("HANDOFF_CONFIRMATION_REQUIRED", "Generation submission handoff confirmation is required");
    const stored = tokens.get(input.previewToken);
    if (!stored) throw handoffError("HANDOFF_PREVIEW_STALE", "Generation submission preview has expired");
    const platformId = normalizeTarget(input.platformId).platformId;
    const accountProfileId = normalizeAccountProfile(input.accountProfileId);
    if (platformId !== stored.platformId || accountProfileId !== stored.accountProfileId) throw handoffError("HANDOFF_PREVIEW_STALE", "Generation submission preview is stale; run preflight again");
    const current = buildPreview({ generationBatchId: stored.generationBatchId, platformId: stored.platformId, accountProfileId: stored.accountProfileId });
    const batch = getBatch(stored.generationBatchId);
    const currentEntries = current.__entries || [];
    if (baseFingerprint(batch, stored.platformId, stored.accountProfileId, currentEntries) !== stored.fingerprint) throw handoffError("HANDOFF_PREVIEW_STALE", "Generation submission preview is stale; run preflight again");
    const completed = completedClients.get(input.previewToken) || new Set();
    let createdCount = 0;
    let idempotentCount = 0;
    const failedClientGroups = [];
    current.clientGroups.forEach((group) => {
      if (completed.has(group.clientId)) {
        idempotentCount += group.idempotentCount;
        return;
      }
      try {
        const admissionPreview = current.__admissionPreviews.get(group.clientId);
        const queueableRefs = (admissionPreview && admissionPreview.items || [])
          .filter((item) => item.status === "queueable")
          .map((item) => item.articleRef);
        if (queueableRefs.length) {
          const result = regularQueueApplication.admitRegularQueueItems({
            articleRefs: queueableRefs,
            platformId: stored.platformId,
            accountProfileId: stored.accountProfileId,
          });
          createdCount += result.admittedCount || 0;
          idempotentCount += result.idempotentCount || 0;
        } else if (admissionPreview) {
          idempotentCount += admissionPreview.idempotentCount || 0;
        }
        completed.add(group.clientId);
      } catch (error) {
        failedClientGroups.push({ clientId: group.clientId, code: error && error.code || "HANDOFF_CLIENT_GROUP_FAILED" });
      }
    });
    completedClients.set(input.previewToken, completed);
    return {
      generationBatchId: stored.generationBatchId,
      createdCount,
      idempotentCount,
      blockedCount: current.blockedPublishedCount + current.blockedUncertainCount + current.blockedContentCount,
      conflictCount: current.conflictCount,
      failedClientGroups,
      completedClientGroups: [...completed],
      clientGroups: current.clientGroups.map((group) => ({ clientId: group.clientId, articleCount: group.articleCount, queueableTaskCount: group.queueableTaskCount, idempotentCount: group.idempotentCount })),
      changedScopes: ["articleManagement", "platformQueue", "articleAttention"]
    };
  }

  return { preview, commit };
}

module.exports = { createGenerationSubmissionHandoffService };

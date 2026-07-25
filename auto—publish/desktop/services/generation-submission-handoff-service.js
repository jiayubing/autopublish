const crypto = require("crypto");
const { evaluateArticleSubmissionEligibility } = require("../../src/content/article-submission-eligibility");

function handoffError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clone(value) { return value === undefined ? value : JSON.parse(JSON.stringify(value)); }
function assertId(value, label) {
  if (typeof value !== "string" || !value.trim() || !/^[A-Za-z0-9_.:-]+$/.test(value)) throw handoffError("HANDOFF_INPUT_INVALID", `${label} is invalid`);
  return value;
}
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function latestRevision(batch) { return batch && (batch.revision || batch.updatedAt || batch.version || batch.id); }

function createGenerationSubmissionHandoffService(options) {
  const opts = options || {};
  const generationBatchService = opts.generationBatchService;
  const articleStore = opts.articleStore;
  const submissionService = opts.contentSubmissionService;
  if (!generationBatchService || typeof generationBatchService.get !== "function" || !articleStore || !submissionService ||
      typeof submissionService.previewBatch !== "function" || typeof submissionService.createBatch !== "function") {
    throw handoffError("HANDOFF_SERVICE_INVALID", "Generation submission handoff dependencies are incomplete");
  }
  const tokens = new Map();
  const completedClients = new Map();

  function targetPlatforms() {
    if (Array.isArray(opts.targetPlatforms)) return opts.targetPlatforms.slice();
    if (typeof submissionService.listPlatforms === "function") return submissionService.listPlatforms();
    return [];
  }

  function normalizeTargets(value) {
    if (!Array.isArray(value) || !value.length) throw handoffError("HANDOFF_TARGET_REQUIRED", "At least one submission target is required");
    const targets = [...new Set(value.map((item) => assertId(item, "target platform id")))];
    const available = new Map(targetPlatforms().map((item) => [item.id, item]));
    const platforms = targets.map((id) => available.get(id) || { id, contentQueueImport: false });
    if (platforms.some((platform) => platform.contentQueueImport !== true)) throw handoffError("HANDOFF_TARGET_UNSUPPORTED", "Submission target does not support queue import");
    return { ids: targets, platforms };
  }

  function getBatch(generationBatchId) {
    const batch = generationBatchService.get(assertId(generationBatchId, "generation batch id"));
    if (!batch || !["completed", "stopped"].includes(batch.status)) throw handoffError("HANDOFF_BATCH_NOT_TERMINAL", "Generation batch must be completed or stopped before submission handoff");
    return batch;
  }

  function findArticle(task) {
    let article = null;
    if (typeof articleStore.findByGenerationTaskId === "function") {
      try {
        const matches = articleStore.findByGenerationTaskId(task.id);
        if (Array.isArray(matches)) {
          if (matches.length !== 1) return { article: null, reasonCode: "HANDOFF_ARTICLE_IDENTITY_CONFLICT" };
          article = matches[0];
        } else {
          article = matches;
        }
      } catch (_) { article = null; }
    }
    if (!article && task.articleId && typeof articleStore.getArticle === "function") {
      try { article = articleStore.getArticle(task.clientId, task.articleId); } catch (_) { article = null; }
    }
    if (!article || article.clientId !== task.clientId || (task.articleId && article.id !== task.articleId) || article.generationTaskId !== task.id || (article.generationBatchId && task.generationBatchId && article.generationBatchId !== task.generationBatchId)) {
      return { article: null, reasonCode: "HANDOFF_ARTICLE_IDENTITY_CONFLICT" };
    }
    return { article, reasonCode: null };
  }

  function articleFingerprint(article) {
    return hash({ id: article.id, clientId: article.clientId, generationTaskId: article.generationTaskId || null, generationBatchId: article.generationBatchId || null, status: article.status, title: article.title, content: article.content, source: article.source, materialSnapshots: article.materialSnapshots, researchSnapshots: article.researchSnapshots, templateSnapshot: article.templateSnapshot });
  }

  function resolveArticles(batch) {
    const entries = [];
    (batch.tasks || []).filter((task) => task && task.status === "succeeded").forEach((task) => {
      const found = findArticle(Object.assign({}, task, { generationBatchId: batch.id }));
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

  function normalizeAccountProfiles(targets, value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== targets.ids.length || targets.ids.some((id) => typeof value[id] !== "string" || !value[id].trim())) {
      throw handoffError("ACCOUNT_PROFILE_REQUIRED", "A platform account profile is required");
    }
    return Object.fromEntries(targets.ids.map((id) => [id, value[id].trim()]));
  }

  function baseFingerprint(batch, targets, accountProfiles, entries) {
    return hash({ batchId: batch.id, revision: latestRevision(batch), targetPlatformIds: targets.ids.slice().sort(), accountProfiles, articles: entries.map((entry) => ({ taskId: entry.task.id, clientId: entry.task.clientId, articleId: entry.article && entry.article.id || entry.task.articleId || null, fingerprint: entry.fingerprint, reasonCode: entry.reasonCode })) });
  }

  function safeItem(item) {
    return { articleId: item.articleId, targetPlatformId: item.targetPlatformId, status: item.status, reasonCode: item.reasonCode || null };
  }

  function buildPreview(input) {
    const targets = normalizeTargets(input.targetPlatformIds);
    const accountProfiles = normalizeAccountProfiles(targets, input.accountProfiles);
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
    byClient.forEach((group) => {
      const submissionPreview = submissionService.previewBatch({ clientId: group.clientId, articleIds: group.articleIds, targetPlatformIds: targets.ids, accountProfiles });
      queueableTaskCount += submissionPreview.queueableTaskCount || 0;
      idempotentCount += submissionPreview.idempotentCount || 0;
      blockedPublishedCount += submissionPreview.blockedPublishedCount || 0;
      blockedUncertainCount += submissionPreview.blockedUncertainCount || 0;
      conflictCount += submissionPreview.conflictCount || 0;
      blockedContentCount += submissionPreview.blockedContentCount || 0;
      clientGroups.push({
        clientId: group.clientId,
        articleCount: group.articleIds.length,
        queueableTaskCount: submissionPreview.queueableTaskCount || 0,
        idempotentCount: submissionPreview.idempotentCount || 0,
        blockedPublishedCount: submissionPreview.blockedPublishedCount || 0,
        blockedUncertainCount: submissionPreview.blockedUncertainCount || 0,
        blockedContentCount: submissionPreview.blockedContentCount || 0,
        conflictCount: submissionPreview.conflictCount || 0,
        items: (submissionPreview.items || []).filter((item) => item.status !== "queueable" && item.status !== "idempotent").map(safeItem)
      });
    });
    const fingerprint = baseFingerprint(batch, targets, accountProfiles, entries);
    const previewToken = `handoff:${crypto.randomUUID()}`;
    tokens.set(previewToken, { fingerprint, generationBatchId: batch.id, targetPlatformIds: targets.ids.slice(), accountProfiles, batchRevision: latestRevision(batch), entries: valid.map((entry) => ({ clientId: entry.task.clientId, articleId: entry.article.id })) });
    return {
      generationBatchId: batch.id,
      batchRevision: latestRevision(batch),
      previewToken,
      articleCount: valid.length,
      clientCount: byClient.size,
      targetPlatformIds: targets.ids.slice(),
      accountProfiles: Object.assign({}, accountProfiles),
      estimatedTaskCount: valid.length * targets.ids.length,
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
  }

  function preview(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw handoffError("HANDOFF_INPUT_INVALID", "Handoff input is invalid");
    return buildPreview(input);
  }

  function commit(input) {
    if (!input || input.confirmed !== true || typeof input.previewToken !== "string") throw handoffError("HANDOFF_CONFIRMATION_REQUIRED", "Generation submission handoff confirmation is required");
    const stored = tokens.get(input.previewToken);
    if (!stored) throw handoffError("HANDOFF_PREVIEW_STALE", "Generation submission preview has expired");
    const committedProfiles = normalizeAccountProfiles({ ids: stored.targetPlatformIds }, input.accountProfiles);
    if (JSON.stringify(committedProfiles) !== JSON.stringify(stored.accountProfiles)) throw handoffError("HANDOFF_PREVIEW_STALE", "Generation submission preview is stale; run preflight again");
    const current = buildPreview({ generationBatchId: stored.generationBatchId, targetPlatformIds: stored.targetPlatformIds, accountProfiles: stored.accountProfiles });
    const batch = getBatch(stored.generationBatchId);
    const currentEntries = resolveArticles(batch);
    if (baseFingerprint(batch, { ids: stored.targetPlatformIds }, stored.accountProfiles, currentEntries) !== stored.fingerprint) throw handoffError("HANDOFF_PREVIEW_STALE", "Generation submission preview is stale; run preflight again");
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
        const result = submissionService.createBatch({ clientId: group.clientId, articleIds: stored.entries.filter((entry) => entry.clientId === group.clientId && entry.articleId).map((entry) => entry.articleId), targetPlatformIds: stored.targetPlatformIds.slice(), accountProfiles: Object.assign({}, stored.accountProfiles), confirmed: true });
        createdCount += result.createdCount || 0;
        idempotentCount += result.idempotentCount || 0;
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
      changedScopes: ["articleManagement", "platformQueue", "navigationSummary", "articleAttention"]
    };
  }

  return { preview, previewGenerationSubmissionHandoff: preview, commit, commitGenerationSubmissionHandoff: commit };
}

module.exports = { createGenerationSubmissionHandoffService };

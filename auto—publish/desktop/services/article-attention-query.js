const crypto = require("node:crypto");
const { deriveAttentionPolicy, MESSAGES } = require("./article-attention-policy");
const { evaluateArticleSubmissionEligibility } = require("../../src/content/article-submission-eligibility");

const ATTENTION_KINDS = Object.freeze({
  MISSING_PAIR_FINALIZE: "missing_pair_finalize",
  QUEUE_PAIR_CONFLICT: "queue_pair_conflict",
  REMOVAL_AUTO_RECOVERY: "removal_auto_recovery",
  REMOVAL_NEEDS_REPAIR: "removal_needs_repair",
  PUBLICATION_UNCERTAIN: "publication_uncertain",
  PUBLISHED_ARCHIVE_FAILED: "published_archive_failed",
  FAILED_SUBMISSION: "failed_submission"
});

function clone(value) {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function stableId(kind, value) {
  const identity = [
    kind,
    value.clientId || "",
    value.articleId || "",
    value.targetPlatformId || value.platformId || "",
    value.batchId || "",
    value.publicationId || "",
    value.attemptId || "",
    value.filename || "",
    value.transactionId || ""
  ].join("\u0000");
  return `${kind}:${crypto.createHash("sha256").update(identity, "utf8").digest("hex").slice(0, 24)}`;
}

function safeText(value, maxLength) {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().slice(0, maxLength || 200);
}

function normalizeRevision(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : fallback;
}

function createArticleAttentionQuery(options) {
  const opts = options || {};
  const readers = opts.readers || {};
  const hasAuthoritativeRevision = typeof opts.getRevision === "function";
  let fallbackRevision = 1;
  let cachedSnapshot = null;

  function reader(name, fallback) {
    return typeof readers[name] === "function" ? readers[name] : fallback;
  }

  function readResidue() {
    const value = reader("listResidues", function() {
      if (opts.contentSubmissionService && typeof opts.contentSubmissionService.previewTrashedArticleQueueResidue === "function") {
        return opts.contentSubmissionService.previewTrashedArticleQueueResidue();
      }
      return { items: [], cleanableItems: [], reportedItems: [] };
    })();
    return value && typeof value === "object" ? value : { items: [], cleanableItems: [], reportedItems: [] };
  }

  function readTransactions() {
    const value = reader("listTransactions", function() {
      if (opts.articleRemovalService && typeof opts.articleRemovalService.listArticleRemovalTransactions === "function") {
        return opts.articleRemovalService.listArticleRemovalTransactions();
      }
      return [];
    })();
    return Array.isArray(value) ? value : [];
  }

  function readOperationalPublications() {
    if (opts.operationalStore && typeof opts.operationalStore.listPublicationAttention === "function") return opts.operationalStore.listPublicationAttention();
    return [];
  }

  function readOperationalPostProcessing() {
    if (opts.operationalStore && typeof opts.operationalStore.listPostProcessingAttention === "function") return opts.operationalStore.listPostProcessingAttention();
    return [];
  }

  function readArchiveFailures() {
    const value = reader("listArchiveFailures", function() {
      if (opts.contentSubmissionService && typeof opts.contentSubmissionService.listArchiveFailures === "function") return opts.contentSubmissionService.listArchiveFailures();
      return [];
    })();
    return Array.isArray(value) ? value : [];
  }

  function articleLookup(item) {
    const value = item || {};
    const getArticle = reader("getArticle", null);
    if (getArticle && value.clientId && value.articleId) {
      try {
        const article = getArticle(value.clientId, value.articleId);
        if (article && typeof article === "object") return { exists: true, status: article.status || null, title: article.title || null, submissionEligible: evaluateArticleSubmissionEligibility(article).eligible };
      } catch (_) {}
    }
    const getTrashedArticle = reader("getTrashedArticle", null);
    if (getTrashedArticle && value.clientId && value.articleId) {
      try {
        const trashed = getTrashedArticle(value.clientId, value.articleId);
        const tombstone = trashed && trashed.tombstone ? trashed.tombstone : trashed;
        return { exists: false, removed: true, status: "removed", title: tombstone && (tombstone.titleSnapshot || tombstone.title) || null };
      } catch (_) {}
    }
    const getTrashedTombstone = reader("getTrashedTombstone", null);
    if (getTrashedTombstone && value.clientId && value.articleId) {
      try {
        const tombstone = getTrashedTombstone(value.clientId, value.articleId);
        return { exists: false, removed: true, status: "removed", title: tombstone && (tombstone.titleSnapshot || tombstone.title) || null };
      } catch (_) {}
    }
    return { exists: value.articleExists === true, status: value.articleStatus || null, title: null };
  }

  function titleFor(item, articleState) {
    const snapshot = safeText(item && (item.titleSnapshot || item.title), 200);
    return snapshot || safeText(articleState && articleState.title, 200);
  }

  function platformCapabilities() {
    let value = null;
    try { value = reader("platformCapabilities", function() { return null; })(); } catch (_) { value = null; }
    if (!value && opts.contentSubmissionService && typeof opts.contentSubmissionService.listPlatforms === "function") {
      try { value = opts.contentSubmissionService.listPlatforms(); } catch (_) { value = null; }
    }
    const result = new Map();
    if (Array.isArray(value)) value.forEach(function(platform) { if (platform && platform.id) result.set(platform.id, platform); });
    else if (value && typeof value === "object") Object.keys(value).forEach(function(id) { result.set(id, value[id]); });
    return result;
  }

  function domainCapabilities(kind) {
    const service = opts.contentSubmissionService;
    const removal = opts.articleRemovalService;
    const archive = opts.archiveActionPort || opts.archiveService;
    return Object.assign({
      canCleanup: !!(service && typeof service.cleanupArticleSubmissionItem === "function"),
      canFinalize: !!(service && typeof service.cleanupArticleSubmissionItem === "function"),
      canRetryRemoval: !!(removal && typeof removal.retryArticleRemovalTransaction === "function"),
      canRetryFailedPublication: !!(service && typeof service.previewRetryFailedPublication === "function" && typeof service.retryFailedPublication === "function"),
      canReconcile: !!(opts.publicationWorkflow && typeof opts.publicationWorkflow.reconcile === "function"),
      canRetryArchive: !!(archive && typeof archive.retryArchive === "function"),
      canOpenPublication: true,
      canInspect: true,
      canOpenArticle: true
    }, opts.capabilities && opts.capabilities[kind] || {});
  }

  function makeEntry(kind, item, facts) {
    const value = item || {};
    const articleState = facts.articleState || articleLookup(value);
    const normalizedFacts = Object.assign({}, facts, {
      kind,
      articleStatus: facts.articleStatus || articleState.status || null,
      articleExists: facts.articleExists !== undefined ? facts.articleExists : articleState.exists,
      articleSubmissionEligible: facts.articleSubmissionEligible !== undefined ? facts.articleSubmissionEligible : articleState.submissionEligible,
      articleState
    });
    const policy = deriveAttentionPolicy(normalizedFacts, domainCapabilities(kind));
    const copy = {
      kind,
      attentionId: stableId(kind, value),
      articleId: safeText(value.articleId, 200),
      titleSnapshot: titleFor(value, articleState),
      clientId: safeText(value.clientId, 100),
      platformId: safeText(value.platformId || value.targetPlatformId, 100),
      accountProfileId: safeText(value.accountProfileId, 160),
      displayName: safeText(value.displayName || value.platformName, 100),
      batchId: safeText(value.batchId, 160),
      publicationId: safeText(value.publicationId, 160),
      attemptId: safeText(value.attemptId, 160),
      jobId: safeText(value.jobId, 160),
      transactionId: safeText(value.transactionId || value.id, 160),
      status: safeText(value.status, 80),
      reasonCode: safeText(value.reasonCode || value.errorCode, 128),
      pairState: safeText(value.pairState, 64),
      updatedAt: safeText(value.updatedAt, 64),
      message: policy.message || MESSAGES[kind] || "需处理项需要进一步核对",
      recommendedAction: policy.recommendedAction,
      allowedActions: policy.allowedActions.slice()
    };
    return { item: copy, policy: policy, facts: normalizedFacts };
  }

  function residueEntries() {
    const report = readResidue();
    const items = Array.isArray(report.items) ? report.items : [];
    return items.map(function(item) {
      const pairState = item.pairState || (item.mainExists === false && item.sidecarExists === false ? "both_absent" : null);
      const kind = pairState === "both_absent" && item.repairAction
        ? ATTENTION_KINDS.MISSING_PAIR_FINALIZE
        : item.status === "failed" && item.repairAction && pairState === "intact"
          ? ATTENTION_KINDS.FAILED_SUBMISSION
          : ATTENTION_KINDS.QUEUE_PAIR_CONFLICT;
      const hasBinding = Boolean(item.batchId && item.publicationId && item.attemptId && (item.targetPlatformId || item.platformId));
      const canCleanup = hasBinding && item.repairAction === "cleanup" && ["intact", "both_absent"].includes(pairState) && item.canCleanup !== false;
      return makeEntry(kind, Object.assign({}, item, { pairState: pairState, updatedAt: item.updatedAt || item.checkedAt }), {
        articleStatus: item.articleStatus || (item.sourceArticleState === "removed" ? "removed" : null),
        articleExists: item.articleExists,
        articleState: item.articleState,
        hasQueueBinding: hasBinding,
        hasResidue: true,
        canCleanup: canCleanup,
        canFinalize: kind === ATTENTION_KINDS.MISSING_PAIR_FINALIZE,
        targetSupportsContentQueueImport: true
      });
    });
  }

  function transactionEntries() {
    return readTransactions().filter(function(item) {
      return item && ["pending_auto_recovery", "pending_recovery", "needs_repair"].includes(item.status);
    }).map(function(item) {
      const automatic = ["pending_auto_recovery", "pending_recovery"].includes(item.status) && item.phase !== "needs_repair";
      return makeEntry(automatic ? ATTENTION_KINDS.REMOVAL_AUTO_RECOVERY : ATTENTION_KINDS.REMOVAL_NEEDS_REPAIR, item, {
        hasRemovalTransaction: true,
        canRetryRemoval: !automatic
      });
    });
  }

  function publicationEntries() {
    const platforms = platformCapabilities();
    return readOperationalPublications().filter(function(item) {
      return item && ["uncertain", "failed"].includes(item.status);
    }).map(function(item) {
      const latest = Array.isArray(item.attempts) && item.attempts.length ? item.attempts[item.attempts.length - 1] : null;
      const articleState = articleLookup(item);
      const platform = platforms.get(item.platformId);
      const kind = item.status === "uncertain" ? ATTENTION_KINDS.PUBLICATION_UNCERTAIN : ATTENTION_KINDS.FAILED_SUBMISSION;
      return makeEntry(kind, Object.assign({}, item, {
        platformId: item.platformId,
        targetPlatformId: item.platformId,
        attemptId: item.attemptId || latest && latest.attemptId,
        reasonCode: item.reasonCode || latest && (latest.reasonCode || latest.errorCode),
        updatedAt: item.updatedAt || latest && latest.updatedAt
      }), {
        articleState: articleState,
        articleExists: articleState.exists,
        articleStatus: articleState.status,
        hasQueueBinding: false,
        hasResidue: false,
        hasRemovalTransaction: false,
        targetSupportsContentQueueImport: platform ? platform.contentQueueImport === true : item.contentQueueImport === true,
        canRetryFailedPublication: item.status === "failed",
        canReconcile: item.status === "uncertain"
      });
    });
  }

  function archiveEntries() {
    const operational = readOperationalPostProcessing().map(function(item) {
      return makeEntry(ATTENTION_KINDS.PUBLISHED_ARCHIVE_FAILED, Object.assign({}, item, {
        platformId: item.payload && item.payload.sourcePlatformId,
        filename: item.payload && item.payload.filename,
        batchId: item.payload && item.payload.batchId,
      }), { hasQueueBinding: !!(item.jobId && item.attemptId), canRetryArchive: true });
    });
    return operational.concat(readArchiveFailures().map(function(item) {
      return makeEntry(ATTENTION_KINDS.PUBLISHED_ARCHIVE_FAILED, item, { hasQueueBinding: !!(item.batchId && item.publicationId && item.attemptId && item.targetPlatformId), canRetryArchive: true });
    }));
  }

  function entries() {
    const residues = residueEntries();
    const transactions = transactionEntries();
    const concretePublicationIds = new Set(residues.concat(transactions).map(function(entry) { return entry.item.publicationId; }).filter(Boolean));
    const publications = publicationEntries().filter(function(entry) { return !concretePublicationIds.has(entry.item.publicationId); });
    const all = residues.concat(transactions, publications, archiveEntries());
    const unique = new Map();
    all.forEach(function(entry) {
      if (!entry.policy.included || unique.has(entry.item.attentionId)) return;
      unique.set(entry.item.attentionId, entry);
    });
    return [...unique.values()];
  }

  function currentRevision() {
    return normalizeRevision(opts.getRevision ? opts.getRevision() : null, hasAuthoritativeRevision ? 0 : fallbackRevision);
  }

  function snapshot() {
    const revision = currentRevision();
    if (!cachedSnapshot || cachedSnapshot.revision !== revision) {
      cachedSnapshot = { revision: revision, entries: entries() };
    }
    return cachedSnapshot;
  }

  function list(input) {
    const value = input || {};
    const current = snapshot();
    const filtered = current.entries.filter(function(entry) { return !value.clientId || entry.item.clientId === value.clientId; });
    return {
      revision: current.revision,
      items: filtered.map(function(entry) { return entry.item; }),
      counts: {
        total: filtered.length,
        actionable: filtered.filter(function(entry) { return entry.item.allowedActions.some(function(action) { return action !== "inspect" && action !== "open-publication" && action !== "open-article"; }); }).length
      }
    };
  }

  function get(input) {
    const attentionId = input && input.attentionId;
    if (typeof attentionId !== "string" || !attentionId.trim()) return null;
    const entry = snapshot().entries.find(function(candidate) { return candidate.item.attentionId === attentionId && (!input.clientId || candidate.item.clientId === input.clientId); });
    return entry ? entry.item : null;
  }

  function getPolicy(input) {
    const attentionId = input && input.attentionId;
    if (typeof attentionId !== "string" || !attentionId.trim()) return null;
    const entry = snapshot().entries.find(function(candidate) { return candidate.item.attentionId === attentionId && (!input.clientId || candidate.item.clientId === input.clientId); });
    return entry ? entry.policy : null;
  }

  function invalidate() {
    if (!hasAuthoritativeRevision) fallbackRevision += 1;
    cachedSnapshot = null;
    return currentRevision();
  }

  return { list, get, getPolicy, getRevision: currentRevision, invalidate, kinds: ATTENTION_KINDS };
}

module.exports = { createArticleAttentionQuery, ATTENTION_KINDS };

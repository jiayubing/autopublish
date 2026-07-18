const crypto = require("node:crypto");

const ATTENTION_KINDS = Object.freeze({
  MISSING_PAIR_FINALIZE: "missing_pair_finalize",
  QUEUE_PAIR_CONFLICT: "queue_pair_conflict",
  REMOVAL_NEEDS_REPAIR: "removal_needs_repair",
  PUBLICATION_UNCERTAIN: "publication_uncertain",
  PUBLISHED_ARCHIVE_FAILED: "published_archive_failed",
  FAILED_SUBMISSION: "failed_submission"
});

const COPY = Object.freeze({
  missing_pair_finalize: {
    message: "队列文件已不存在，只差完成记录收尾",
    recommendedAction: "finalize",
    allowedActions: ["finalize"]
  },
  queue_pair_conflict: {
    message: "队列文件与原投稿记录不一致",
    recommendedAction: "inspect",
    allowedActions: ["inspect"]
  },
  removal_needs_repair: {
    message: "删除事务未完成，需要重新预检并继续",
    recommendedAction: "retry",
    allowedActions: ["retry"]
  },
  publication_uncertain: {
    message: "远端结果待确认，请先核对发布详情",
    recommendedAction: "open-publication",
    allowedActions: ["open-publication", "reconcile-published", "reconcile-failed"]
  },
  published_archive_failed: {
    message: "远端已发布，但本地归档待处理",
    recommendedAction: "retry-archive",
    allowedActions: ["retry-archive"]
  },
  failed_submission: {
    message: "投稿明确失败，可查看原因或清理旧队列",
    recommendedAction: "cleanup",
    allowedActions: ["cleanup", "retry", "inspect"]
  }
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
  let localRevision = 1;

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

  function readPublications() {
    const value = reader("listPublications", function() {
      if (opts.publicationLedger && typeof opts.publicationLedger.list === "function") return opts.publicationLedger.list();
      return [];
    })();
    return Array.isArray(value) ? value : [];
  }

  function readArchiveFailures() {
    const value = reader("listArchiveFailures", function() { return []; })();
    return Array.isArray(value) ? value : [];
  }

  function titleFor(item) {
    const snapshot = safeText(item && (item.titleSnapshot || item.title), 200);
    if (snapshot) return snapshot;
    const getArticle = reader("getArticle", null);
    if (getArticle && item && item.clientId && item.articleId) {
      try {
        const article = getArticle(item.clientId, item.articleId);
        return safeText(article && article.title, 200);
      } catch (_) {}
    }
    return null;
  }

  function baseDto(kind, item) {
    const value = item || {};
    const copy = {
      kind,
      attentionId: stableId(kind, value),
      articleId: safeText(value.articleId, 200),
      titleSnapshot: titleFor(value),
      clientId: safeText(value.clientId, 100),
      platformId: safeText(value.platformId || value.targetPlatformId, 100),
      displayName: safeText(value.displayName || value.platformName, 100),
      batchId: safeText(value.batchId, 160),
      publicationId: safeText(value.publicationId, 160),
      attemptId: safeText(value.attemptId, 160),
      transactionId: safeText(value.transactionId || value.id, 160),
      status: safeText(value.status, 80),
      reasonCode: safeText(value.reasonCode || value.errorCode, 128),
      pairState: safeText(value.pairState, 64),
      updatedAt: safeText(value.updatedAt, 64)
    };
    const copyText = COPY[kind] || COPY.queue_pair_conflict;
    copy.message = copyText.message;
    copy.recommendedAction = copyText.recommendedAction;
    copy.allowedActions = copyText.allowedActions.slice();
    return copy;
  }

  function residueItems() {
    const report = readResidue();
    const items = Array.isArray(report.items) ? report.items : [];
    return items.map(function(item) {
      const pairState = item.pairState || (item.mainExists === false && item.sidecarExists === false ? "both_absent" : null);
      const kind = pairState === "both_absent" && item.repairAction
        ? ATTENTION_KINDS.MISSING_PAIR_FINALIZE
        : item.status === "failed" && item.repairAction && pairState === "intact"
          ? ATTENTION_KINDS.FAILED_SUBMISSION
          : ATTENTION_KINDS.QUEUE_PAIR_CONFLICT;
      return baseDto(kind, Object.assign({}, item, {
        pairState: pairState,
        updatedAt: item.updatedAt || item.checkedAt
      }));
    });
  }

  function transactionItems() {
    return readTransactions().filter(function(item) {
      return item && ["pending_auto_recovery", "pending_recovery", "needs_repair"].includes(item.status);
    }).map(function(item) {
      return baseDto(ATTENTION_KINDS.REMOVAL_NEEDS_REPAIR, item);
    });
  }

  function publicationItems() {
    return readPublications().filter(function(item) {
      return item && ["uncertain", "failed"].includes(item.status);
    }).map(function(item) {
      const kind = item.status === "uncertain" ? ATTENTION_KINDS.PUBLICATION_UNCERTAIN : ATTENTION_KINDS.FAILED_SUBMISSION;
      const latest = Array.isArray(item.attempts) && item.attempts.length ? item.attempts[item.attempts.length - 1] : null;
      return baseDto(kind, Object.assign({}, item, {
        platformId: item.platformId,
        targetPlatformId: item.platformId,
        attemptId: item.attemptId || latest && latest.attemptId,
        reasonCode: item.reasonCode || latest && (latest.reasonCode || latest.errorCode),
        updatedAt: item.updatedAt || latest && latest.updatedAt
      }));
    });
  }

  function archiveItems() {
    return readArchiveFailures().map(function(item) {
      return baseDto(ATTENTION_KINDS.PUBLISHED_ARCHIVE_FAILED, item);
    });
  }

  function currentRevision() {
    const external = typeof opts.getRevision === "function" ? opts.getRevision() : null;
    return normalizeRevision(external, localRevision);
  }

  function list(input) {
    const value = input || {};
    const all = residueItems().concat(transactionItems(), publicationItems(), archiveItems());
    const filtered = value.clientId ? all.filter(function(item) { return item.clientId === value.clientId; }) : all;
    const unique = new Map();
    filtered.forEach(function(item) { if (!unique.has(item.attentionId)) unique.set(item.attentionId, item); });
    return {
      revision: currentRevision(),
      items: [...unique.values()],
      counts: {
        total: unique.size,
        actionable: [...unique.values()].filter(function(item) { return item.allowedActions.some(function(action) { return action !== "inspect" && action !== "open-publication"; }); }).length
      }
    };
  }

  function get(input) {
    const attentionId = input && input.attentionId;
    if (typeof attentionId !== "string" || !attentionId.trim()) return null;
    return list({ clientId: input.clientId }).items.find(function(item) { return item.attentionId === attentionId; }) || null;
  }

  function invalidate() { localRevision += 1; return localRevision; }

  return { list, get, getRevision: currentRevision, invalidate, kinds: ATTENTION_KINDS };
}

module.exports = { createArticleAttentionQuery, ATTENTION_KINDS, COPY };

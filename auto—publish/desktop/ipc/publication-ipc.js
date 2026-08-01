const { wrap } = require("../services/ipc-response");

const MAX_ARTICLE_IDS = 2000;

function inputError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateListInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw inputError("PUBLICATION_HISTORY_INPUT_INVALID", "Publication history input is invalid");
  }
  const keys = Object.keys(input);
  if (keys.some((key) => key !== "clientId" && key !== "articleIds")) {
    throw inputError("PUBLICATION_HISTORY_INPUT_INVALID", "Publication history input is invalid");
  }
  if (typeof input.clientId !== "string" || !input.clientId.trim()) {
    throw inputError("PUBLICATION_ARTICLE_ID_INVALID", "Client id is invalid");
  }
  if (!Array.isArray(input.articleIds) || input.articleIds.length > MAX_ARTICLE_IDS) {
    throw inputError("PUBLICATION_ARTICLE_IDS_INVALID", "Article ids are invalid");
  }
  if (input.articleIds.some((articleId) => typeof articleId !== "string" || !/^[A-Za-z0-9_.-]+$/.test(articleId.trim()))) {
    throw inputError("PUBLICATION_ARTICLE_ID_INVALID", "Article ids are invalid");
  }
  return { clientId: input.clientId.trim(), articleIds: input.articleIds.map((articleId) => articleId.trim()) };
}

function validateReconcileInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw inputError("PUBLICATION_RECONCILE_INVALID", "Publication reconciliation input is invalid");
  }
  const keys = Object.keys(input);
  if (keys.some((key) => ["confirmed", "publicationId", "reasonCode", "status"].indexOf(key) === -1)) {
    throw inputError("PUBLICATION_RECONCILE_INVALID", "Publication reconciliation input is invalid");
  }
  if (input.confirmed !== true) {
    throw inputError("PUBLICATION_RECONCILE_CONFIRMATION_REQUIRED", "Publication reconciliation requires confirmation");
  }
  if (typeof input.publicationId !== "string" || !/^[A-Za-z0-9_.-]+$/.test(input.publicationId.trim())) {
    throw inputError("PUBLICATION_ID_INVALID", "Publication id is invalid");
  }
  if (["failed", "published"].indexOf(input.status) === -1 ||
      typeof input.reasonCode !== "string" || !/^[A-Z0-9][A-Z0-9_.:-]{0,127}$/.test(input.reasonCode.trim())) {
    throw inputError("PUBLICATION_RECONCILE_INVALID", "Publication reconciliation decision is invalid");
  }
  return { publicationId: input.publicationId.trim(), status: input.status, reasonCode: input.reasonCode.trim() };
}

function safeRemoteUrl(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch (_) {
    return null;
  }
}

function safeAttempt(attempt) {
  if (!attempt || typeof attempt !== "object") return null;
  return {
    attemptId: typeof attempt.attemptId === "string" ? attempt.attemptId : null,
    status: typeof attempt.status === "string" ? attempt.status : null,
    createdAt: attempt.createdAt || null,
    updatedAt: attempt.updatedAt || null,
    startedAt: attempt.startedAt || null,
    finishedAt: attempt.finishedAt || null,
    remoteId: typeof attempt.remoteId === "string" ? attempt.remoteId : null,
    remoteUrl: safeRemoteUrl(attempt.remoteUrl),
    errorCode: typeof attempt.errorCode === "string" ? attempt.errorCode : null,
    reasonCode: typeof attempt.reasonCode === "string" ? attempt.reasonCode : null
  };
}

function safeRecord(record) {
  const attempts = Array.isArray(record && record.attempts) ? record.attempts.map(safeAttempt).filter(Boolean) : [];
  const latestAttempt = attempts.length ? attempts[attempts.length - 1] : null;
  return {
    version: record.version,
    publicationId: record.publicationId,
    clientId: record.clientId,
    articleId: record.articleId === undefined ? null : record.articleId,
    articleKey: record.articleKey,
    targetKey: record.targetKey,
    platformId: record.platformId || null,
    mediaResourceId: record.mediaResourceId || null,
    displayName: record.displayName || null,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    attempts: attempts,
    attemptId: latestAttempt && latestAttempt.attemptId,
    remoteId: latestAttempt && latestAttempt.remoteId,
    remoteUrl: latestAttempt && latestAttempt.remoteUrl,
    errorCode: latestAttempt && latestAttempt.errorCode,
    reasonCode: latestAttempt && latestAttempt.reasonCode
  };
}

function registerPublicationIpc(deps) {
  const values = deps || {};
  const ledger = values.publicationLedger || null;
  values.ipcMain.handle("publication:reconcile", function(event, input) {
    return wrap(function() {
      const request = validateReconcileInput(input);
      if (!ledger) {
        const error = inputError("PUBLICATION_RECONCILE_EVIDENCE_REQUIRED", "Manual reconciliation needs remote evidence and is not available through this legacy command");
        throw error;
      }
      const record = ledger.reconcile(request.publicationId, {
        status: request.status,
        reasonCode: request.reasonCode
      });
      if (typeof values.invalidateData === "function") values.invalidateData("PUBLICATION_RECONCILED");
      return { record: safeRecord(record) };
    });
  });
}

module.exports = { registerPublicationIpc, validateListInput, validateReconcileInput, safeRecord, safeRemoteUrl };

const KNOWN_SCOPES = new Set([
  "platformQueue", "navigationSummary", "articleAttention", "articleManagement",
  "orders", "contentSources", "mediaWorkbench"
]);

const DEFAULT_SCOPES = ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"];
const POLICY = {
  CONTENT_EXPORT_QUEUED: DEFAULT_SCOPES.concat(["mediaWorkbench"]),
  MEDIA_SUBMIT_COMPLETED: DEFAULT_SCOPES,
  PLATFORM_AUTO_TRASH_APPLIED: DEFAULT_SCOPES,
  PUBLICATION_RECONCILED: DEFAULT_SCOPES,
  ARTICLE_REMOVAL_TRANSACTION_CHANGED: DEFAULT_SCOPES,
  GENERATION_SUBMISSION_HANDOFF_COMMITTED: ["articleManagement", "platformQueue", "navigationSummary", "articleAttention"],
  SUBMISSION_BATCH_CANCELLED: DEFAULT_SCOPES
};

function scopesFor(reasonCode, fallback) {
  const defined = typeof reasonCode === "string" ? POLICY[reasonCode] : null;
  const candidate = defined || fallback || DEFAULT_SCOPES;
  return [...new Set((Array.isArray(candidate) ? candidate : []).filter((scope) => KNOWN_SCOPES.has(scope)))];
}

function createWorkspaceInvalidator(send, initialRevision) {
  let revision = Number.isSafeInteger(initialRevision) && initialRevision >= 0 ? initialRevision : 0;
  function invalidate(reasonCode, fallbackScopes) {
    revision += 1;
    const safeReason = typeof reasonCode === "string" && /^[A-Z0-9_.:-]{1,128}$/.test(reasonCode)
      ? reasonCode : "WORKSPACE_DATA_CHANGED";
    const payload = { revision, scopes: scopesFor(safeReason, fallbackScopes), reasonCode: safeReason };
    if (typeof send === "function") send("workspace:data-invalidated", payload);
    return revision;
  }
  return { invalidate, getRevision: () => revision };
}

module.exports = { KNOWN_SCOPES, DEFAULT_SCOPES, scopesFor, createWorkspaceInvalidator };

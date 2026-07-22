"use strict";

const ALLOWED_SCOPES = Object.freeze([
  "platformQueue", "navigationSummary", "articleAttention", "articleManagement",
  "orders", "contentSources", "mediaWorkbench"
]);

// The reason code is the command's domain fact.  Scopes are a presentation
// concern and deliberately have one owner so mutations cannot drift apart.
const SCOPES_BY_REASON = Object.freeze({
  CONTENT_EXPORT_QUEUED: ["articleManagement", "articleAttention", "navigationSummary", "mediaWorkbench"],
  PUBLICATION_RECONCILED: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"],
  MEDIA_SUBMIT_COMPLETED: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary", "orders"],
  PLATFORM_AUTO_TRASH_APPLIED: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"],
  ARTICLE_REMOVAL_TRANSACTION_CHANGED: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"],
  GENERATION_SUBMISSION_HANDOFF_COMMITTED: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"],
  GENERATION_BATCH_CHANGED: ["articleManagement"],
  CONTENT_SOURCE_CHANGED: ["contentSources"],
  PLATFORM_SUBMIT_COMPLETED: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"],
  PLATFORM_SUBMIT_FAILED: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"],
  PLATFORM_SUBMIT_STOPPED: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"]
});

function safeReasonCode(value) {
  return typeof value === "string" && /^[A-Z0-9_.:-]{1,128}$/.test(value)
    ? value : "WORKSPACE_DATA_CHANGED";
}

function scopesForReason(reasonCode) {
  const code = safeReasonCode(reasonCode);
  if (SCOPES_BY_REASON[code]) return SCOPES_BY_REASON[code].slice();
  if (/^PLATFORM_SUBMIT_/.test(code)) return SCOPES_BY_REASON.PLATFORM_SUBMIT_COMPLETED.slice();
  if (/^ARTICLE_REMOVAL_/.test(code)) return SCOPES_BY_REASON.ARTICLE_REMOVAL_TRANSACTION_CHANGED.slice();
  if (/^GENERATION_/.test(code)) return SCOPES_BY_REASON.GENERATION_BATCH_CHANGED.slice();
  return ["articleManagement", "articleAttention", "navigationSummary"];
}

function createWorkspaceDataInvalidation(options) {
  const opts = options || {};
  let revision = Number.isInteger(opts.initialRevision) && opts.initialRevision >= 0 ? opts.initialRevision : 0;
  const send = typeof opts.sendToRenderer === "function" ? opts.sendToRenderer : function() {};

  function invalidate(reasonCode, legacyReasonCode) {
    // Temporary compatibility for pre-runtime services. New callers provide
    // only a reason code; the supplied scopes are intentionally ignored.
    const code = safeReasonCode(typeof legacyReasonCode === "string" ? legacyReasonCode : reasonCode);
    const scopes = [...new Set(scopesForReason(code).filter((scope) => ALLOWED_SCOPES.includes(scope)))];
    revision += 1;
    send("workspace:data-invalidated", { revision, scopes, reasonCode: code });
    return revision;
  }

  return { invalidate, getRevision: function() { return revision; }, scopesForReason };
}

module.exports = { ALLOWED_SCOPES, SCOPES_BY_REASON, scopesForReason, createWorkspaceDataInvalidation };

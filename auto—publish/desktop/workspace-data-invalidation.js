"use strict";

const { randomUUID } = require("node:crypto");

const ALLOWED_SCOPES = Object.freeze([
  "platformQueue", "articleAttention", "articleManagement",
  "orders", "contentSources", "mediaWorkbench", "submissionCenter"
]);

// The reason code is the command's domain fact.  Scopes are a presentation
// concern and deliberately have one owner so mutations cannot drift apart.
const SCOPES_BY_REASON = Object.freeze({
  SUBMISSION_BATCH_CANCELLED: ["articleManagement", "articleAttention", "platformQueue"],
  SUBMISSION_BATCH_CREATED: ["articleManagement", "articleAttention", "platformQueue"],
  SUBMISSION_QUEUE_CANCELLED: ["articleManagement", "articleAttention", "platformQueue"],
  SUBMISSION_QUEUE_CLEANED: ["articleManagement", "articleAttention", "platformQueue"],
  CONTENT_EXPORT_QUEUED: ["articleManagement", "articleAttention", "platformQueue", "mediaWorkbench"],
  PUBLICATION_RECONCILED: ["articleManagement", "articleAttention", "platformQueue"],
  MEDIA_SUBMIT_COMPLETED: ["articleManagement", "articleAttention", "platformQueue", "orders"],
  PAID_ORDER_RESOLUTION_CHANGED: ["articleManagement", "articleAttention", "orders"],
  PAID_ORDER_OBSERVATION_CHANGED: ["articleManagement", "articleAttention", "orders"],
  PAID_ORDER_STATUS_ANOMALY_RESOLVED: ["articleManagement", "articleAttention", "orders"],
  PLATFORM_AUTO_TRASH_APPLIED: ["articleManagement", "articleAttention", "platformQueue"],
  ARTICLE_REMOVAL_TRANSACTION_CHANGED: ["articleManagement", "articleAttention", "platformQueue"],
  ARTICLE_ATTENTION_RESOLVED: ["articleManagement", "articleAttention", "platformQueue"],
  TRASHED_QUEUE_RESIDUE_RESOLVED: ["articleManagement", "articleAttention", "platformQueue"],
  FAILED_QUEUE_ITEMS_CLEANED: ["articleManagement", "articleAttention", "platformQueue"],
  GENERATION_BATCH_CHANGED: ["articleManagement"],
  GENERATION_BATCH_CREATED: ["articleManagement"],
  GENERATION_BATCH_TERMINAL: ["articleManagement"],
  GENERATION_PENDING_TASKS_CANCELLED: ["articleManagement"],
  ARTICLE_SAVED: ["articleManagement"],
  CONTENT_SOURCE_CHANGED: ["contentSources"],
  CONTENT_QUESTION_CREATED: ["contentSources"],
  CONTENT_QUESTION_UPDATED: ["contentSources"],
  CONTENT_QUESTION_DELETED: ["contentSources"],
  CONTENT_RESEARCH_COLLECTED: ["contentSources"],
  CONTENT_RESEARCH_MANUAL_SAVED: ["contentSources"],
  PLATFORM_SUBMIT_COMPLETED: ["articleManagement", "articleAttention", "platformQueue"],
  PLATFORM_SUBMIT_FAILED: ["articleManagement", "articleAttention", "platformQueue"],
  PLATFORM_SUBMIT_STOPPED: ["articleManagement", "articleAttention", "platformQueue"]
});

function safeReasonCode(value) {
  return typeof value === "string" && /^[A-Z0-9_.:-]{1,128}$/.test(value)
    ? value : "WORKSPACE_DATA_CHANGED";
}

function scopesForReason(reasonCode) {
  const code = safeReasonCode(reasonCode);
  if (SCOPES_BY_REASON[code]) {
    const scopes = SCOPES_BY_REASON[code].slice();
    if (scopes.some((scope) => ["platformQueue", "articleAttention", "orders"].includes(scope)))
      scopes.push("submissionCenter");
    return [...new Set(scopes)];
  }
  return [];
}

function createWorkspaceDataInvalidation(options) {
  const opts = options || {};
  const workspaceRuntimeId = typeof opts.workspaceRuntimeId === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(opts.workspaceRuntimeId)
    ? opts.workspaceRuntimeId : randomUUID();
  let revision = Number.isInteger(opts.initialRevision) && opts.initialRevision >= 0 ? opts.initialRevision : 0;
  const send = typeof opts.sendToRenderer === "function" ? opts.sendToRenderer : function() {};

  function invalidate(reasonCode) {
    const code = safeReasonCode(reasonCode);
    const scopes = [...new Set(scopesForReason(code).filter((scope) => ALLOWED_SCOPES.includes(scope)))];
    revision += 1;
    send("workspace:data-invalidated", {
      schemaVersion: 1,
      workspaceRuntimeId,
      revision,
      scopes,
      reasonCode: code,
    });
    return revision;
  }

  return {
    invalidate,
    getRevision: function() { return revision; },
    getWorkspaceRuntimeId: function() { return workspaceRuntimeId; },
    getRuntimeIdentity: function() {
      return { workspaceRuntimeId, revision };
    },
    scopesForReason,
  };
}

module.exports = { ALLOWED_SCOPES, SCOPES_BY_REASON, scopesForReason, createWorkspaceDataInvalidation };

"use strict";

const { normalizeArticleRef } = require("../../src/content/article-ref");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeDisplayText(value, fallback, maxLength) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maxLength ||
    /[\\/\x00-\x1f\x7f]/.test(value)
  )
    return fallback;
  return value.trim();
}

function createRegularQueueGroupQuery(options) {
  const value = options || {};
  const groupTransitions = value.groupTransitions || null;
  const clientSnapshotResolver = typeof value.clientSnapshotResolver === "function"
    ? value.clientSnapshotResolver
    : function (clientId) {
        return { version: 1, clientId, displayName: clientId };
      };
  const groupImagePublishingSupported =
    typeof value.groupImagePublishingSupported === "function"
      ? value.groupImagePublishingSupported
      : function () { return false; };

  function listRegularQueueGroups(input) {
    if (
      !groupTransitions ||
      typeof groupTransitions.listRegularQueueGroupSnapshots !== "function"
    )
      throw fail("REGULAR_QUEUE_GROUP_QUERY_UNAVAILABLE");
    const requestedClientId = input && typeof input.clientId === "string"
      ? input.clientId
      : null;
    const groups = groupTransitions.listRegularQueueGroupSnapshots({}) || [];
    if (!Array.isArray(groups)) throw fail("REGULAR_QUEUE_GROUP_QUERY_INVALID");
    const clientsById = new Map();

    function clientFor(clientId) {
      if (clientsById.has(clientId)) return clientsById.get(clientId);
      let client = null;
      try {
        client = clientSnapshotResolver(clientId);
      } catch (error) {
        reportDiagnostic({
          code: "REGULAR_QUEUE_CUSTOMER_SUMMARY_READ_FAILED",
          module: "regular-queue-application",
          category: "storage",
          operationId: "regular-queue-group-query",
          metadata: {
            operation: "customer-summary",
            phase: "read",
            outcome: "fallback",
            errorCode:
              error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
                ? error.code
                : "CUSTOMER_READ_FAILED",
          },
        });
      }
      clientsById.set(clientId, client);
      return client;
    }

    function itemFor(raw) {
      if (!plainObject(raw))
        throw fail("REGULAR_QUEUE_ARTICLE_IDENTITY_UNAVAILABLE");
      let articleRef;
      try {
        articleRef = normalizeArticleRef(
          { clientId: raw.clientId, articleId: raw.articleId },
          "REGULAR_QUEUE_ARTICLE_IDENTITY_UNAVAILABLE",
        );
      } catch (_) {
        throw fail("REGULAR_QUEUE_ARTICLE_IDENTITY_UNAVAILABLE");
      }
      const client = clientFor(articleRef.clientId);
      return Object.freeze({
        itemId: raw.itemId,
        batchId: raw.batchId,
        articleId: articleRef.articleId,
        articleRef,
        articleSummary: Object.freeze({
          title: safeDisplayText(raw.articleTitle, "标题不可用", 512),
          customerName: safeDisplayText(
            client && client.displayName,
            "客户信息不可用",
            256,
          ),
        }),
        regularPublicationAttemptId: raw.regularPublicationAttemptId,
        ...(Object.prototype.hasOwnProperty.call(raw, "phase")
          ? { phase: raw.phase }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(raw, "claimUntil")
          ? { claimUntil: raw.claimUntil }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(raw, "position")
          ? { position: raw.position }
          : {}),
      });
    }

    return Object.freeze(
      groups.map((group) => {
        if (!group || !Array.isArray(group.remaining))
          throw fail("REGULAR_QUEUE_GROUP_QUERY_INVALID");
        if (
          !Number.isInteger(group.imageCount) ||
          group.imageCount < 0 ||
          group.imageCount > 5
        )
          throw fail("REGULAR_QUEUE_GROUP_QUERY_INVALID");
        if (
          !Number.isInteger(group.submissionIntervalSeconds) ||
          group.submissionIntervalSeconds < 0 ||
          group.submissionIntervalSeconds > 3600
        )
          throw fail("REGULAR_QUEUE_GROUP_QUERY_INVALID");
        const reasonCode =
          typeof group.actions?.reasonCode === "string" &&
          /^[A-Z][A-Z0-9_]{0,127}$/.test(group.actions.reasonCode)
            ? group.actions.reasonCode
            : null;
        const scopedCurrent = requestedClientId && group.current &&
          group.current.clientId !== requestedClientId ? null : group.current;
        const scopedRemaining = requestedClientId
          ? group.remaining.filter(function (item) {
              return item && item.clientId === requestedClientId;
            })
          : group.remaining;
        if (requestedClientId && !scopedCurrent && scopedRemaining.length === 0)
          return null;
        return Object.freeze({
          queueGroupId: group.queueGroupId,
          platformId: group.platformId,
          accountProfileId: group.accountProfileId,
          imageCount: group.imageCount,
          submissionIntervalSeconds: group.submissionIntervalSeconds,
          imagePublishingSupported: groupImagePublishingSupported(group.platformId),
          runState: group.runState,
          pauseIntent: group.pauseIntent,
          manuallyPaused: group.manuallyPaused,
          current: scopedCurrent ? itemFor(scopedCurrent) : null,
          remaining: Object.freeze(scopedRemaining.map((item) => itemFor(item))),
          actions: Object.freeze({
            canStart: group.actions && group.actions.canStart === true,
            canPause: group.actions && group.actions.canPause === true,
            reasonCode,
          }),
          revision: group.revision,
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
        });
      }).filter(Boolean),
    );
  }

  return Object.freeze({ listRegularQueueGroups });
}

module.exports = { createRegularQueueGroupQuery };

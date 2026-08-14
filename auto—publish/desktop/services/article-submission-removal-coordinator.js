"use strict";

const ACTIVE_SUBMISSION_STATUSES = new Set([
  "queued",
  "claimed",
  "remote_started",
  "reserving",
  "paid_processing",
  "submitting",
]);
const TERMINAL_SUBMISSION_STATUSES = new Set(["failed", "cancelled"]);
const ACTIVE_ORDER_STATUSES = new Set(["0", "1"]);
const TERMINAL_COMPLETED_OUTCOMES = new Set(["failed", "cancelled"]);

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function articleIdOf(value) {
  const articleId = value && (value.articleId || value.id);
  return typeof articleId === "string" && articleId ? articleId : null;
}

function statusOf(value) {
  return text(
    value &&
      (value.status ||
        value.publicationStatus ||
        value.state ||
        value.supplierStatusCode ||
        value.statusCode),
  );
}

function isPublished(value) {
  return statusOf(value) === "published" || text(value && value.supplierStatusCode) === "2";
}

function isUnknown(status, known) {
  return Boolean(status) && !known.has(status);
}

function createArticleSubmissionRemovalCoordinator(options) {
  const value = options || {};
  if (!value.projection) throw fail("ARTICLE_SUBMISSION_REMOVAL_PORT_REQUIRED");
  const projection = value.projection;
  const lifecycleFacts = value.lifecycleFacts || value.activeTargetQuery || null;

  function normalizeSelections(input) {
    if (value.policy && typeof value.policy.normalizeSelections === "function")
      return value.policy.normalizeSelections(input);
    const selections = input && input.selections;
    if (!Array.isArray(selections) || !selections.length)
      throw fail("CONTENT_INPUT_INVALID", "At least one article is required");
    const seen = new Set();
    return selections.map((item) => {
      if (
        !item ||
        typeof item.clientId !== "string" ||
        !item.clientId.trim() ||
        typeof item.articleId !== "string" ||
        !item.articleId.trim()
      )
        throw fail("CONTENT_INPUT_INVALID", "Article selection is invalid");
      const result = { clientId: item.clientId, articleId: item.articleId };
      const key = result.clientId + "\0" + result.articleId;
      if (seen.has(key))
        throw fail(
          "CONTENT_INPUT_INVALID",
          "Article selection contains duplicates",
        );
      seen.add(key);
      return result;
    });
  }

  function selectionKey(item) {
    if (value.policy && typeof value.policy.selectionKey === "function")
      return value.policy.selectionKey(item);
    return item.clientId + "\0" + item.articleId;
  }

  function safeFact(fact, source, reasonCode, selected) {
    const value = fact && typeof fact === "object" ? fact : {};
    const articleId = articleIdOf(value);
    const selectedItem =
      Array.isArray(selected) && articleId
        ? selected.find((item) => item.articleId === articleId)
        : null;
    const result = {
      itemId: value.itemId || null,
      batchId: value.batchId || null,
      publicationId: value.publicationId || null,
      attemptId: value.attemptId || null,
      platformId: value.platformId || null,
      targetPlatformId: value.targetPlatformId || null,
      displayName: value.displayName || null,
      reasonCode,
      source,
      status: statusOf(value) || null,
    };
    const clientId = value.clientId || (selectedItem && selectedItem.clientId);
    if (clientId) result.clientId = clientId;
    if (articleId) result.articleId = articleId;
    if (typeof value.targetKey === "string") result.targetKey = value.targetKey;
    if (typeof value.mediaResourceId === "string") result.mediaResourceId = value.mediaResourceId;
    if (typeof value.orderId === "string") result.orderId = value.orderId;
    if (typeof value.orderNid === "string") result.orderNid = value.orderNid;
    return result;
  }

  function listFacts(selections) {
    const articleIds = selections.map((item) => item.articleId);
    if (lifecycleFacts && typeof lifecycleFacts.listArticleLifecycleFacts === "function") {
      return (
        lifecycleFacts.listArticleLifecycleFacts({ articleIds }) || {
          publications: [],
          submissionItems: [],
          orders: [],
          attentionItems: [],
        }
      );
    }
    if (lifecycleFacts && typeof lifecycleFacts.listActiveTargets === "function") {
      return {
        activeTargets:
          lifecycleFacts.listActiveTargets({ articleIds }) || [],
        publications: [],
        submissionItems: [],
        orders: [],
        attentionItems: [],
      };
    }
    return null;
  }

  function addSubmissionFacts(blocked, facts, selected) {
    const selectedKey = new Set(selected.map(selectionKey));
    const belongs = (fact) => {
      const articleId = articleIdOf(fact);
      return (
        articleId &&
        selected.some(
          (item) =>
            item.articleId === articleId &&
            (!fact.clientId || item.clientId === fact.clientId),
        ) &&
        selectedKey.has(
          selectionKey({
            clientId: fact.clientId || selected.find((item) => item.articleId === articleId).clientId,
            articleId,
          }),
        )
      );
    };
    const add = (fact, source, reasonCode) => {
      if (belongs(fact)) blocked.push(safeFact(fact, source, reasonCode, selected));
    };

    (facts && facts.activeTargets || []).forEach((fact) => {
      const status = statusOf(fact);
      if (["published", "2"].includes(status)) add(fact, "active_target", "ARTICLE_PUBLISHED_IMMUTABLE");
      else if ([...ACTIVE_SUBMISSION_STATUSES, "uncertain"].includes(status))
        add(fact, "active_target", status === "uncertain" ? "PUBLICATION_UNCERTAIN" : "ARTICLE_OPERATION_FROZEN");
      else add(fact, "active_target", "PUBLICATION_STATUS_UNKNOWN");
    });

    (facts && facts.publications || []).forEach((fact) => {
      const status = statusOf(fact);
      if (isPublished(fact)) add(fact, "publication", "ARTICLE_PUBLISHED_IMMUTABLE");
      else if (status === "uncertain") add(fact, "publication", "PUBLICATION_UNCERTAIN");
      else if (ACTIVE_SUBMISSION_STATUSES.has(status)) add(fact, "publication", "ARTICLE_OPERATION_FROZEN");
      else if (!status || isUnknown(status, new Set(["failed", "cancelled"]))) add(fact, "publication", "PUBLICATION_STATUS_UNKNOWN");
    });

    (facts && facts.submissionItems || []).forEach((fact) => {
      const status = statusOf(fact);
      const outcomeStatus = text(fact && fact.outcomeStatus);
      const effectiveStatus = status === "completed" ? outcomeStatus : status;
      if (isPublished(fact) || effectiveStatus === "published") add(fact, "submission", "ARTICLE_PUBLISHED_IMMUTABLE");
      else if (effectiveStatus === "uncertain") add(fact, "submission", "PUBLICATION_UNCERTAIN");
      else if (ACTIVE_SUBMISSION_STATUSES.has(effectiveStatus)) add(fact, "submission", "ARTICLE_OPERATION_FROZEN");
      else if (TERMINAL_SUBMISSION_STATUSES.has(status) || TERMINAL_COMPLETED_OUTCOMES.has(effectiveStatus)) return;
      else add(fact, "submission", "SUBMISSION_STATUS_UNKNOWN");
    });

    (facts && facts.orders || []).forEach((fact) => {
      const status = text(fact.supplierStatusCode || fact.statusCode || fact.publicationStatus);
      if (isPublished(fact)) add(fact, "order", "ARTICLE_PUBLISHED_IMMUTABLE");
      else if (ACTIVE_ORDER_STATUSES.has(status)) add(fact, "order", "ARTICLE_OPERATION_FROZEN");
      else if (!text(fact.orderId || fact.orderNid)) add(fact, "order", "MEDIA_ORDER_MISSING");
      else if (!new Set(["2", "4", "9", "cancelled"]).has(status)) add(fact, "order", "ORDER_STATUS_UNKNOWN");
    });

    (facts && facts.attentionItems || []).forEach((fact) => {
      if (!belongs(fact)) return;
      const status = statusOf(fact);
      if (status === "uncertain" || fact.freeze === true || /uncertain|manual_check/i.test(text(fact.kind)))
        blocked.push(safeFact(fact, "attention", fact.reasonCode || "PUBLICATION_UNCERTAIN", selected));
    });
  }

  function addProjectionFacts(blocked, selections) {
    const selected = new Set(selections.map(selectionKey));
    const views = typeof projection.allItemViews === "function" ? projection.allItemViews() : [];
    views.forEach((item) => {
      if (!item || !selected.has(selectionKey(item))) return;
      const status = statusOf(item);
      if (isPublished(item)) blocked.push(safeFact(item, "submission", "ARTICLE_PUBLISHED_IMMUTABLE", selections));
      else if (status === "uncertain") blocked.push(safeFact(item, "submission", "PUBLICATION_UNCERTAIN", selections));
      else if (ACTIVE_SUBMISSION_STATUSES.has(status)) blocked.push(safeFact(item, "submission", "ARTICLE_OPERATION_FROZEN", selections));
      else if (status && !TERMINAL_SUBMISSION_STATUSES.has(status) && status !== "completed") blocked.push(safeFact(item, "submission", "SUBMISSION_STATUS_UNKNOWN", selections));
    });
  }

  function deduplicate(blocked) {
    const seen = new Set();
    return blocked.filter((item) => {
      const key = [
        item.clientId,
        item.articleId,
        item.source,
        item.reasonCode,
        item.targetKey || item.batchId || item.orderId || "",
      ].join("\0");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function previewArticleRemovalImpact(input) {
    const selections = normalizeSelections(input);
    const blockedItems = [];
    const facts = listFacts(selections);
    if (facts) addSubmissionFacts(blockedItems, facts, selections);
    else addProjectionFacts(blockedItems, selections);
    const result = deduplicate(blockedItems);
    return {
      selections,
      articleCount: selections.length,
      blockedItems: result,
      canCommit: result.length === 0,
    };
  }

  return Object.freeze({ previewArticleRemovalImpact });
}

module.exports = { createArticleSubmissionRemovalCoordinator };

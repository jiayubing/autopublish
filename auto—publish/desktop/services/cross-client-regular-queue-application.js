"use strict";

const {
  canonicalArticleRefs,
} = require("../../src/content/article-ref");

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function refsFrom(input) {
  const request = input || {};
  const raw = Array.isArray(request.articleRefs) ? request.articleRefs : [];
  if (!raw.length) throw fail("REGULAR_QUEUE_ARTICLES_REQUIRED");
  try {
    return canonicalArticleRefs(raw);
  } catch (_) {
    throw fail("REGULAR_QUEUE_ARTICLE_IDENTITY_INVALID");
  }
}

function groupRefs(refs) {
  const groups = [];
  const byClient = new Map();
  refs.forEach(function (ref) {
    let group = byClient.get(ref.clientId);
    if (!group) {
      group = { clientId: ref.clientId, refs: [] };
      byClient.set(ref.clientId, group);
      groups.push(group);
    }
    group.refs.push(ref);
  });
  return groups;
}

function groupInput(input, refs) {
  return Object.assign({}, input || {}, { articleRefs: refs });
}

function outcome(ref, status, reasonCode) {
  return Object.freeze({
    articleRef: ref,
    articleId: ref.articleId,
    status,
    reasonCode: reasonCode || null,
  });
}

function countStatus(items, status) {
  return items.filter(function (item) {
    return item && item.status === status;
  }).length;
}

function collectBatchIds(items, values) {
  const ids = [];
  (values || []).forEach(function (value) {
    if (value && typeof value.batchId === "string" && value.batchId)
      ids.push(value.batchId);
  });
  (items || []).forEach(function (item) {
    if (item && typeof item.batchId === "string" && item.batchId)
      ids.push(item.batchId);
  });
  return [...new Set(ids)];
}

function createCrossClientRegularQueueApplication(options) {
  const value = options || {};
  const regular = value.regularQueueApplication;
  if (
    !regular ||
    typeof regular.previewRegularQueueAdmission !== "function" ||
    typeof regular.admitRegularQueueItems !== "function"
  )
    throw fail("REGULAR_QUEUE_APPLICATION_REQUIRED");

  function previewRegularQueueAdmission(input) {
    const refs = refsFrom(input);
    const groups = groupRefs(refs);
    const previews = groups.map(function (group) {
      return regular.previewRegularQueueAdmission(groupInput(input, group.refs));
    });
    const items = previews.flatMap(function (preview) {
      return preview.items || [];
    });
    return Object.freeze({
      target: previews[0].target,
      articleRefs: Object.freeze(refs),
      items: Object.freeze(items),
      totalCount: items.length,
      queueableCount: countStatus(items, "queueable"),
      idempotentCount: countStatus(items, "idempotent"),
      missingCount: countStatus(items, "missing"),
      conflictCount: countStatus(items, "conflict"),
    });
  }

  function admitRegularQueueItems(input) {
    const refs = refsFrom(input);
    const groups = groupRefs(refs);
    // Validate the common target/account/config before any mutation.  The same
    // preview is also the final recheck for the first client.
    const firstPreview = regular.previewRegularQueueAdmission(
      groupInput(input, groups[0].refs),
    );
    const items = [];
    const admissions = [];
    let stopped = false;

    groups.forEach(function (group, index) {
      if (stopped) {
        group.refs.forEach(function (ref) {
          items.push(outcome(ref, "not_processed", "ADMISSION_NOT_PROCESSED"));
        });
        return;
      }

      let preview;
      try {
        preview =
          index === 0
            ? firstPreview
            : regular.previewRegularQueueAdmission(
                groupInput(input, group.refs),
              );
      } catch (error) {
        group.refs.forEach(function (ref) {
          items.push(
            outcome(
              ref,
              "failed",
              error && error.code ? error.code : "REGULAR_QUEUE_ADMISSION_FAILED",
            ),
          );
        });
        return;
      }

      const previewItems = Array.isArray(preview.items) ? preview.items : [];
      const queueableRefs = previewItems
        .filter(function (item) {
          return item && item.status === "queueable";
        })
        .map(function (item) {
          return item.articleRef;
        });
      previewItems
        .filter(function (item) {
          return item && item.status !== "queueable";
        })
        .forEach(function (item) {
          items.push(item);
        });

      if (!queueableRefs.length) return;
      try {
        const result = regular.admitRegularQueueItems(
          groupInput(input, queueableRefs),
        );
        admissions.push(result);
        (result.items || []).forEach(function (item) {
          items.push(item);
        });
      } catch (_) {
        // Once the mutation call has been entered its commit state is not safe
        // to infer from an exception. Never retry these refs automatically.
        queueableRefs.forEach(function (ref) {
          items.push(
            outcome(ref, "uncertain", "REGULAR_QUEUE_ADMISSION_UNCERTAIN"),
          );
        });
        stopped = true;
      }
    });

    const batchIds = collectBatchIds(items, admissions);
    const result = {
      target: firstPreview.target,
      articleRefs: Object.freeze(refs),
      items: Object.freeze(items),
      admittedCount: countStatus(items, "queued"),
      idempotentCount: countStatus(items, "idempotent"),
      missingCount: countStatus(items, "missing"),
      conflictCount: countStatus(items, "conflict"),
    };
    if (batchIds.length) result.batchId = batchIds[0];
    return Object.freeze(result);
  }

  return Object.freeze({
    previewRegularQueueAdmission,
    admitRegularQueueItems,
    removePendingQueueItems: regular.removePendingQueueItems.bind(regular),
    listRegularQueueGroups: regular.listRegularQueueGroups.bind(regular),
    updateRegularQueueGroupImageCount:
      regular.updateRegularQueueGroupImageCount.bind(regular),
    updateRegularQueueGroupSubmissionInterval:
      regular.updateRegularQueueGroupSubmissionInterval.bind(regular),
  });
}

module.exports = { createCrossClientRegularQueueApplication };

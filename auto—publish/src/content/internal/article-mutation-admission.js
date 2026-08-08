"use strict";

const crypto = require("node:crypto");
const domain = require("../../domain");
const { fingerprintArticle } = require("../content-store");
const {
  canonicalArticleRefKey,
  canonicalArticleRefs,
  normalizeArticleRef,
} = require("../article-ref");

function createArticleMutationAdmission(kernel) {
  const regularQueueTransitions = kernel.ports.regularQueueTransitions;
  const paidAdmissionTransitions = kernel.ports.paidAdmissionTransitions;

  function regularErrorCode(error) {
    const code = kernel.safeErrorCode(error);
    if (
      ["PUBLICATION_DUPLICATE", "PUBLICATION_TARGET_CONFLICT"].includes(code)
    ) {
      return "ARTICLE_ACTIVE_TARGET_CONFLICT";
    }
    if (code === "PUBLICATION_UNCERTAIN") return "PUBLICATION_UNCERTAIN";
    return code;
  }

  function regularAdmissionRefs(input) {
    const request = input || {};
    const refs = Array.isArray(request.articleRefs)
      ? request.articleRefs
      : Array.isArray(request.selections)
        ? request.selections.map(function (selection) {
            return selection && selection.articleRef
              ? selection.articleRef
              : selection;
          })
        : [];
    if (!refs.length)
      throw kernel.mutationError("REGULAR_QUEUE_ARTICLES_REQUIRED");
    const ordered = canonicalArticleRefs(refs);
    if (
      new Set(
        ordered.map(function (ref) {
          return ref.clientId;
        }),
      ).size > 1
    ) {
      throw kernel.mutationError("REGULAR_QUEUE_SINGLE_CLIENT_REQUIRED");
    }
    return ordered;
  }

  function paidAdmissionRefs(input) {
    const request = input || {};
    const refs = Array.isArray(request.articleRefs)
      ? request.articleRefs
      : Array.isArray(request.selections)
        ? request.selections.map(function (selection) {
            return selection && selection.articleRef
              ? selection.articleRef
              : selection;
          })
        : [];
    if (!refs.length)
      throw kernel.mutationError("PAID_ADMISSION_ARTICLES_REQUIRED");
    return canonicalArticleRefs(refs);
  }

  function paidFingerprintFor(request, ref) {
    const entries = request && request.articleFingerprints;
    if (Array.isArray(entries)) {
      const match = entries.find(function (entry) {
        return (
          entry &&
          entry.articleRef &&
          canonicalArticleRefKey(entry.articleRef) ===
            canonicalArticleRefKey(ref)
        );
      });
      return match && match.fingerprint;
    }
    if (entries && typeof entries === "object" && !Array.isArray(entries)) {
      return entries[canonicalArticleRefKey(ref)] || entries[ref.articleId];
    }
    return undefined;
  }

  function currentSystemSubmissionCode(request) {
    let value = request && request.systemSubmissionCode;
    if (kernel.systemSubmissionCodeProvider) {
      const provided = kernel.systemSubmissionCodeProvider();
      value =
        provided && typeof provided === "object"
          ? provided.systemSubmissionCode || provided.thirdPartyId
          : provided;
    }
    return typeof value === "string" ? value.trim() : "";
  }

  function paidAdmissionTarget(input) {
    let target;
    try {
      target = domain.parsePublicationTarget(
        input && input.target
          ? input.target
          : { kind: "media", mediaResourceId: input && input.mediaResourceId },
      );
    } catch (_) {
      throw kernel.mutationError("PAID_ADMISSION_TARGET_INVALID");
    }
    if (target.kind !== "media")
      throw kernel.mutationError("PAID_ADMISSION_MEDIA_REQUIRED");
    return target;
  }

  function regularRemovalSelections(input, ordered) {
    const request = input || {};
    const entries = Array.isArray(request.items)
      ? request.items
      : Array.isArray(request.selections)
        ? request.selections
        : request.item || request.selection
          ? [request.item || request.selection]
          : [];
    if (!entries.length)
      throw kernel.mutationError("REGULAR_QUEUE_ITEMS_REQUIRED");
    const byKey = new Map();
    entries.forEach(function (entry) {
      const value = entry || {};
      const articleRef = normalizeArticleRef(value.articleRef || value);
      const key = canonicalArticleRefKey(articleRef);
      if (!byKey.has(key)) {
        byKey.set(
          key,
          Object.freeze({
            articleRef,
            itemId: value.itemId,
            batchId: value.batchId,
            targetKey: value.targetKey,
          }),
        );
      }
    });
    return ordered
      .map(function (ref) {
        return byKey.get(canonicalArticleRefKey(ref));
      })
      .filter(Boolean);
  }

  function admitRegularQueueItems(input) {
    if (
      !regularQueueTransitions ||
      typeof regularQueueTransitions.admitRegularQueueItem !== "function"
    ) {
      throw kernel.mutationError("REGULAR_QUEUE_TRANSITION_UNAVAILABLE");
    }
    const request = input || {};
    if (Object.prototype.hasOwnProperty.call(request, "batchId")) {
      throw kernel.mutationError("REGULAR_QUEUE_INPUT_INVALID");
    }
    let target;
    try {
      target = domain.parsePublicationTarget(request.target);
    } catch (_) {
      throw kernel.mutationError("REGULAR_QUEUE_TARGET_INVALID");
    }
    if (target.kind !== "platform")
      throw kernel.mutationError("REGULAR_QUEUE_PLATFORM_REQUIRED");
    const ordered = regularAdmissionRefs(request);
    const batchId = `regular-batch-${crypto.randomUUID()}`;
    return kernel.withArticleSet(ordered, function (session, markSideEffect) {
      const facts = kernel.regularFactsFor(ordered);
      const items = ordered.map(function (ref) {
        let article;
        try {
          article = session.readArticle(ref);
        } catch (error) {
          if (error && error.code === "ARTICLE_NOT_FOUND") {
            return Object.freeze({
              articleRef: ref,
              articleId: ref.articleId,
              status: "missing",
              reasonCode: "ARTICLE_NOT_FOUND",
            });
          }
          throw error;
        }
        try {
          const workflow = kernel.workflowFor(article, [ref], facts);
          const targetKey = domain.publicationTargetKey(target);
          const existing = facts.submissionItems.find(function (candidate) {
            return (
              candidate.articleId === ref.articleId &&
              candidate.targetKey === targetKey &&
              candidate.status === "queued" &&
              candidate.queueGroupId
            );
          });
          const activeTargetKeys = Object.keys(workflow.targetFacts || {});
          if (
            activeTargetKeys.some(function (activeTargetKey) {
              return activeTargetKey !== targetKey;
            })
          ) {
            throw kernel.mutationError(
              "ARTICLE_ACTIVE_TARGET_CONFLICT",
              "Article already has another active publication target",
            );
          }
          if (!existing) kernel.assertAllowed(workflow, "queue");
          const fingerprint = fingerprintArticle(article);
          const result = regularQueueTransitions.admitRegularQueueItem({
            clientId: ref.clientId,
            articleRef: ref,
            articleId: ref.articleId,
            batchId,
            itemId: `regular-item-${crypto.randomUUID()}`,
            publicationId: `publication-${crypto.randomUUID()}`,
            attemptId: `attempt-${crypto.randomUUID()}`,
            target,
            customerSnapshotV1:
              request.customerSnapshotsV1 &&
              request.customerSnapshotsV1[ref.clientId]
                ? request.customerSnapshotsV1[ref.clientId]
                : domain.parseCustomerSnapshotV1({
                    version: 1,
                    clientId: ref.clientId,
                    displayName:
                      article.clientDisplayName ||
                      article.clientName ||
                      ref.clientId,
                  }),
            targetSnapshotV1: request.targetSnapshotV1,
            publicationSnapshot: Object.freeze({
              articleId: ref.articleId,
              title: article.title,
              body: article.content,
              fingerprint,
            }),
            queueConfig: request.queueConfig,
            payload: { clientId: ref.clientId },
          });
          if (!result.idempotent) markSideEffect();
          return Object.freeze(
            Object.assign({}, result, {
              articleRef: ref,
              status: result.idempotent ? "idempotent" : "queued",
            }),
          );
        } catch (error) {
          const code = regularErrorCode(error);
          if (code === "ARTICLE_MUTATION_RESULT_UNCERTAIN") throw error;
          return Object.freeze({
            articleRef: ref,
            articleId: ref.articleId,
            status: "conflict",
            reasonCode: code,
            reasonCodes: Object.freeze([code]),
          });
        }
      });
      return Object.freeze({
        batchId,
        target,
        items: Object.freeze(items),
        admittedCount: items.filter(function (item) {
          return item.status === "queued";
        }).length,
        idempotentCount: items.filter(function (item) {
          return item.status === "idempotent";
        }).length,
        missingCount: items.filter(function (item) {
          return item.status === "missing";
        }).length,
        conflictCount: items.filter(function (item) {
          return item.status === "conflict";
        }).length,
      });
    });
  }

  function admitPaidBatch(input) {
    if (
      !paidAdmissionTransitions ||
      typeof paidAdmissionTransitions.admitPaidBatch !== "function"
    ) {
      throw kernel.mutationError("PAID_ADMISSION_TRANSITION_UNAVAILABLE");
    }
    const request = input || {};
    const target = paidAdmissionTarget(request);
    const ordered = paidAdmissionRefs(request);
    const batchId = request.batchId || `paid-batch-${crypto.randomUUID()}`;
    const confirmationFingerprint = request.confirmationFingerprint;
    if (
      typeof confirmationFingerprint !== "string" ||
      !confirmationFingerprint.trim()
    ) {
      throw kernel.mutationError(
        "PAID_ADMISSION_CONFIRMATION_FINGERPRINT_REQUIRED",
      );
    }
    const resourceSnapshot = request.resourceSnapshot || {};
    if (
      resourceSnapshot.resourceId !== target.mediaResourceId ||
      resourceSnapshot.available !== true ||
      typeof resourceSnapshot.fingerprint !== "string" ||
      !resourceSnapshot.fingerprint.trim() ||
      typeof resourceSnapshot.price !== "number" ||
      !Number.isFinite(resourceSnapshot.price) ||
      resourceSnapshot.price < 0
    ) {
      throw kernel.mutationError("PAID_MEDIA_CONFIRMATION_STALE");
    }
    if (
      typeof request.quotedPrice !== "number" ||
      !Number.isFinite(request.quotedPrice) ||
      request.quotedPrice !== resourceSnapshot.price ||
      typeof request.estimatedTotal !== "number" ||
      !Number.isFinite(request.estimatedTotal) ||
      request.estimatedTotal < 0
    ) {
      throw kernel.mutationError("PAID_MEDIA_CONFIRMATION_STALE");
    }
    if (
      !request.confirmation ||
      typeof request.confirmation !== "object" ||
      Array.isArray(request.confirmation)
    ) {
      throw kernel.mutationError("PAID_ADMISSION_CONFIRMATION_INVALID");
    }

    return kernel.withArticleSet(ordered, function (session, markSideEffect) {
      const systemSubmissionCode = currentSystemSubmissionCode(request);
      if (
        !systemSubmissionCode ||
        systemSubmissionCode !==
          String(request.systemSubmissionCode || "").trim()
      ) {
        throw kernel.mutationError("PAID_MEDIA_SYSTEM_SUBMISSION_CODE_CHANGED");
      }
      if (
        request.confirmation.systemSubmissionCode !== undefined &&
        request.confirmation.systemSubmissionCode !== systemSubmissionCode
      ) {
        throw kernel.mutationError("PAID_MEDIA_CONFIRMATION_STALE");
      }
      const facts = kernel.factsFor(ordered, paidAdmissionTransitions);
      const items = ordered.map(function (ref) {
        const article = session.readArticle(ref);
        const workflow = kernel.workflowFor(article, [ref], facts);
        kernel.assertAllowed(workflow, "queue");
        const fingerprint = fingerprintArticle(article);
        const expectedFingerprint = paidFingerprintFor(request, ref);
        if (
          typeof expectedFingerprint !== "string" ||
          expectedFingerprint !== fingerprint
        ) {
          throw kernel.mutationError(
            "PAID_MEDIA_CONFIRMATION_STALE",
            "Article changed after paid-media preflight",
            {
              articleId: ref.articleId,
              refreshRequired: true,
            },
          );
        }
        const title = typeof article.title === "string" ? article.title : "";
        const body = typeof article.content === "string" ? article.content : "";
        if (Array.from(title.trim()).length > 30)
          throw kernel.mutationError("PAID_MEDIA_TITLE_TOO_LONG");
        if (!title.trim() || !body.trim())
          throw kernel.mutationError("PAID_MEDIA_ARTICLE_CONTENT_REQUIRED");
        let customerSnapshotV1;
        try {
          customerSnapshotV1 = domain.parseCustomerSnapshotV1(
            request.customerSnapshotsV1 &&
              request.customerSnapshotsV1[ref.clientId],
          );
        } catch (_) {
          throw kernel.mutationError("PAID_MEDIA_CUSTOMER_SNAPSHOT_INVALID");
        }
        if (customerSnapshotV1.clientId !== ref.clientId) {
          throw kernel.mutationError("PAID_MEDIA_CUSTOMER_SNAPSHOT_INVALID");
        }
        return Object.freeze({
          clientId: ref.clientId,
          articleRef: ref,
          articleId: ref.articleId,
          itemId: `paid-item-${crypto.randomUUID()}`,
          publicationId: `paid-publication-${crypto.randomUUID()}`,
          attemptId: `paid-attempt-${crypto.randomUUID()}`,
          target,
          customerSnapshotV1,
          publicationSnapshot: Object.freeze({
            articleId: ref.articleId,
            title: title.trim(),
            body,
            fingerprint,
          }),
          resourceNameSnapshot:
            typeof resourceSnapshot.name === "string"
              ? resourceSnapshot.name
              : "",
          payload: {
            sourcePlatformId: "media",
            filename:
              typeof request.confirmation.filename === "string"
                ? request.confirmation.filename
                : undefined,
          },
        });
      });
      const result = paidAdmissionTransitions.admitPaidBatch({
        batchId,
        target,
        mediaResourceId: target.mediaResourceId,
        confirmationFingerprint: confirmationFingerprint.trim(),
        confirmation: request.confirmation,
        systemSubmissionCode,
        quotedPrice: request.quotedPrice,
        estimatedTotal: request.estimatedTotal,
        articleCount: items.length,
        items,
      });
      if (!result || typeof result !== "object")
        throw kernel.mutationError("PAID_ADMISSION_FAILED");
      if (result.idempotent !== true) markSideEffect();
      const resultItems = Array.isArray(result.items)
        ? result.items.map(function (item) {
            const ref = ordered.find(function (candidate) {
              return candidate.articleId === item.articleId;
            });
            return Object.freeze(
              Object.assign({}, item, ref ? { articleRef: ref } : {}),
            );
          })
        : [];
      return Object.freeze(
        Object.assign({}, result, {
          target,
          articleRefs: Object.freeze(ordered),
          confirmationFingerprint: confirmationFingerprint.trim(),
          items: Object.freeze(resultItems),
        }),
      );
    });
  }

  function removePendingQueueItems(input) {
    if (
      !regularQueueTransitions ||
      typeof regularQueueTransitions.removePendingQueueItem !== "function"
    ) {
      throw kernel.mutationError("REGULAR_QUEUE_TRANSITION_UNAVAILABLE");
    }
    const request = input || {};
    const rawEntries = Array.isArray(request.items)
      ? request.items
      : Array.isArray(request.selections)
        ? request.selections
        : request.item || request.selection
          ? [request.item || request.selection]
          : [];
    if (!rawEntries.length)
      throw kernel.mutationError("REGULAR_QUEUE_ITEMS_REQUIRED");
    const refs = canonicalArticleRefs(
      rawEntries.map(function (entry) {
        return entry && entry.articleRef ? entry.articleRef : entry;
      }),
    );
    const selections = regularRemovalSelections(request, refs);
    return kernel.withArticleSet(refs, function (session, markSideEffect) {
      const facts = kernel.regularFactsFor(refs);
      const items = selections.map(function (selection) {
        const ref = selection.articleRef;
        let article;
        try {
          article = session.readArticle(ref);
        } catch (error) {
          if (error && error.code === "ARTICLE_NOT_FOUND") {
            return Object.freeze({
              articleRef: ref,
              articleId: ref.articleId,
              status: "conflict",
              reasonCode: "ARTICLE_NOT_FOUND",
            });
          }
          throw error;
        }
        const fact = facts.submissionItems.find(function (candidate) {
          return (
            candidate.articleId === ref.articleId &&
            (selection.itemId
              ? candidate.itemId === selection.itemId
              : candidate.status === "queued") &&
            candidate.batchId === selection.batchId &&
            (!selection.targetKey ||
              candidate.targetKey === selection.targetKey)
          );
        });
        if (!fact || !fact.itemId || !fact.batchId) {
          return Object.freeze({
            articleRef: ref,
            articleId: ref.articleId,
            status: "conflict",
            reasonCode: "REGULAR_QUEUE_ITEM_NOT_FOUND",
          });
        }
        if (fact.status === "cancelled") {
          try {
            const result = regularQueueTransitions.removePendingQueueItem({
              articleRef: ref,
              clientId: ref.clientId,
              articleId: ref.articleId,
              itemId: fact.itemId,
              batchId: fact.batchId,
              targetKey: fact.targetKey,
              operationId: request.operationId,
            });
            if (result.idempotent)
              return Object.freeze(
                Object.assign({}, result, { articleRef: ref }),
              );
          } catch (error) {
            const code = regularErrorCode(error);
            if (code === "ARTICLE_MUTATION_RESULT_UNCERTAIN") throw error;
            return Object.freeze({
              articleRef: ref,
              articleId: ref.articleId,
              itemId: fact.itemId,
              batchId: fact.batchId,
              status: "conflict",
              reasonCode: code,
            });
          }
        }
        if (fact.status !== "queued") {
          return Object.freeze({
            articleRef: ref,
            articleId: ref.articleId,
            itemId: fact.itemId,
            batchId: fact.batchId,
            status: "conflict",
            reasonCode: "REGULAR_QUEUE_ITEM_NOT_REMOVABLE",
          });
        }
        try {
          const workflow = kernel.workflowFor(article, [ref], facts);
          if (
            workflow.operations.edit.allowed === true &&
            workflow.operations.queue.allowed === true
          ) {
            return Object.freeze({
              articleRef: ref,
              articleId: ref.articleId,
              itemId: fact.itemId,
              batchId: fact.batchId,
              status: "conflict",
              reasonCode: "REGULAR_QUEUE_ITEM_NOT_FOUND",
            });
          }
          const result = regularQueueTransitions.removePendingQueueItem({
            articleRef: ref,
            clientId: ref.clientId,
            articleId: ref.articleId,
            itemId: fact.itemId,
            batchId: fact.batchId,
            targetKey: fact.targetKey,
            operationId: request.operationId,
          });
          if (!result.idempotent) markSideEffect();
          return Object.freeze(Object.assign({}, result, { articleRef: ref }));
        } catch (error) {
          const code = regularErrorCode(error);
          if (code === "ARTICLE_MUTATION_RESULT_UNCERTAIN") throw error;
          return Object.freeze({
            articleRef: ref,
            articleId: ref.articleId,
            itemId: fact.itemId,
            batchId: fact.batchId,
            status: "conflict",
            reasonCode: code,
          });
        }
      });
      return Object.freeze({
        items: Object.freeze(items),
        removedCount: items.filter(function (item) {
          return item.status === "cancelled" && item.idempotent !== true;
        }).length,
        idempotentCount: items.filter(function (item) {
          return item.idempotent === true;
        }).length,
        conflictCount: items.filter(function (item) {
          return item.status === "conflict";
        }).length,
      });
    });
  }

  return Object.freeze({
    admitRegularQueueItems,
    admitPaidBatch,
    removePendingQueueItems,
  });
}

module.exports = { createArticleMutationAdmission };

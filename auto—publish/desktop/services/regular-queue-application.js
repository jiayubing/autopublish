"use strict";

const domain = require("../../src/domain");
const {
  canonicalArticleRefs,
  normalizeArticleRef,
} = require("../../src/content/article-ref");
const { deriveArticleLifecycle } = require("../../src/content/article-lifecycle-projection");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

function fail(code, message) {
  const error = new Error(message || code);
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

function createRegularQueueApplication(options) {
  const value = options || {};
  if (!value.contentStore || typeof value.contentStore.getArticle !== "function")
    throw fail("REGULAR_QUEUE_CONTENT_STORE_REQUIRED");
  if (!value.articleMutationCoordinator)
    throw fail("REGULAR_QUEUE_COORDINATOR_REQUIRED");
  if (!value.regularQueueTransitions || typeof value.regularQueueTransitions.listArticleLifecycleFacts !== "function")
    throw fail("REGULAR_QUEUE_TRANSITIONS_REQUIRED");
  if (typeof value.accountProfileResolver !== "function")
    throw fail("REGULAR_QUEUE_ACCOUNT_PROFILE_RESOLVER_REQUIRED");
  const contentStore = value.contentStore;
  const coordinator = value.articleMutationCoordinator;
  const transitions = value.regularQueueTransitions;
  const groupTransitions = value.regularQueueGroupTransitions || null;
  const groupImageCountTransitions =
    value.regularQueueGroupImageCountTransitions || null;
  const accountProfileResolver = value.accountProfileResolver;
  const clientSnapshotResolver = typeof value.clientSnapshotResolver === "function"
    ? value.clientSnapshotResolver
    : function (clientId) {
        return { version: 1, clientId, displayName: clientId };
      };
  const configuredPlatforms = Array.isArray(value.platforms) ? value.platforms : null;
  const onDataInvalidated = typeof value.onDataInvalidated === "function"
    ? value.onDataInvalidated
    : null;

  function notifyDataInvalidated(reasonCode) {
    if (!onDataInvalidated) return;
    try {
      onDataInvalidated(reasonCode);
    } catch (error) {
      reportDiagnostic({
        code: "REGULAR_QUEUE_INVALIDATION_LISTENER_FAILED",
        module: "regular-queue-application",
        category: "internal",
        operationId: "regular-queue-invalidation",
        metadata: {
          operation: "data-invalidation-listener",
          phase: "notify",
          outcome: "listener-isolated",
          reasonCode: typeof reasonCode === "string" && /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(reasonCode)
            ? reasonCode
            : "UNSPECIFIED",
          errorCode: error && /^([A-Z][A-Z0-9_]{1,127})$/.test(error.code || "")
            ? error.code
            : "LISTENER_FAILED",
        },
      });
    }
  }

  function platformList() {
    return (configuredPlatforms || []).filter(function (platform) {
      return platform && platform.publicationTargetKind === "platform";
    });
  }

  function targetFrom(input) {
    const request = input || {};
    if (Object.prototype.hasOwnProperty.call(request, "batchId"))
      throw fail("REGULAR_QUEUE_INPUT_INVALID");
    if (request.targetPlatformIds !== undefined || request.accountProfiles !== undefined)
      throw fail("REGULAR_QUEUE_SINGLE_TARGET_REQUIRED");
    if (request.mediaResourceId !== undefined || (request.target && request.target.kind === "media"))
      throw fail("REGULAR_QUEUE_PLATFORM_REQUIRED");
    if (typeof request.platformId !== "string" || !request.platformId.trim())
      throw fail("REGULAR_QUEUE_PLATFORM_REQUIRED");
    if (typeof request.accountProfileId !== "string" || !request.accountProfileId.trim())
      throw fail("ACCOUNT_PROFILE_REQUIRED");
    const platformId = request.platformId.trim();
    const platform = platformList().find(function (candidate) { return candidate.id === platformId; });
    if (!platform) throw fail("REGULAR_QUEUE_PLATFORM_UNSUPPORTED");
    let target;
    try {
      target = domain.parsePublicationTarget({
        kind: "platform",
        platformId,
        accountProfileId: request.accountProfileId,
      });
    } catch (_) {
      throw fail("REGULAR_QUEUE_TARGET_INVALID");
    }
    try {
      accountProfileResolver({
        accountProfileId: target.accountProfileId,
        platformId: target.platformId,
      });
      return target;
    } catch (error) {
      throw fail(error && error.code ? error.code : "REGULAR_QUEUE_TARGET_INVALID");
    }
  }

  function refsFrom(input) {
    const request = input || {};
    const raw = Array.isArray(request.articleRefs)
      ? request.articleRefs
      : Array.isArray(request.selections)
        ? request.selections.map(function (item) { return item && item.articleRef ? item.articleRef : item; })
        : [];
    if (!raw.length) throw fail("REGULAR_QUEUE_ARTICLES_REQUIRED");
    try {
      const refs = canonicalArticleRefs(raw);
      if (new Set(refs.map(function (ref) { return ref.clientId; })).size > 1)
        throw fail("REGULAR_QUEUE_SINGLE_CLIENT_REQUIRED");
      return refs;
    } catch (_) {
      if (_ && _.code === "REGULAR_QUEUE_SINGLE_CLIENT_REQUIRED") throw _;
      throw fail("REGULAR_QUEUE_ARTICLE_IDENTITY_INVALID");
    }
  }

  function queueConfigFrom(input) {
    const queueConfig = input && input.queueConfig;
    if (queueConfig === undefined) return undefined;
    if (!plainObject(queueConfig) || Object.keys(queueConfig).some(function (key) {
      return key !== "queueGroupId" && key !== "imageCount";
    }))
      throw fail("REGULAR_QUEUE_CONFIG_INVALID");
    if (queueConfig.queueGroupId !== undefined &&
        (typeof queueConfig.queueGroupId !== "string" || !queueConfig.queueGroupId.trim()))
      throw fail("REGULAR_QUEUE_CONFIG_INVALID");
    if (
      queueConfig.imageCount !== undefined &&
      (!Number.isInteger(queueConfig.imageCount) ||
        queueConfig.imageCount < 0 ||
        queueConfig.imageCount > 5)
    )
      throw fail("REGULAR_QUEUE_CONFIG_INVALID");
    return Object.freeze(Object.assign({}, queueConfig));
  }

  function imageCountUpdateFrom(input) {
    const request = input || {};
    if (
      !plainObject(request) ||
      Object.keys(request).some(function (key) {
        return (
          key !== "queueGroupId" &&
          key !== "imageCount" &&
          key !== "expectedRevision"
        );
      }) ||
      typeof request.queueGroupId !== "string" ||
      !request.queueGroupId.trim() ||
      !Number.isInteger(request.imageCount) ||
      request.imageCount < 0 ||
      request.imageCount > 5 ||
      !Number.isInteger(request.expectedRevision) ||
      request.expectedRevision < 0
    )
      throw fail("REGULAR_QUEUE_CONFIG_INVALID");
    return Object.freeze({
      queueGroupId: request.queueGroupId.trim(),
      imageCount: request.imageCount,
      expectedRevision: request.expectedRevision,
    });
  }

  function groupImagePublishingSupported(platformId) {
    const platform = platformList().find(function (candidate) {
      return candidate.id === platformId;
    });
    return Boolean(platform && platform.imagePublishing);
  }

  function queueConfigForTarget(input, target) {
    const queueConfig = queueConfigFrom(input);
    if (groupImagePublishingSupported(target.platformId)) return queueConfig;
    if (queueConfig && queueConfig.imageCount !== undefined && queueConfig.imageCount !== 0)
      throw fail("REGULAR_QUEUE_IMAGE_PUBLISHING_UNSUPPORTED");
    return Object.freeze({
      ...(queueConfig && queueConfig.queueGroupId
        ? { queueGroupId: queueConfig.queueGroupId }
        : {}),
      imageCount: 0,
    });
  }

  function factsFor(refs) {
    return transitions.listArticleLifecycleFacts({
      articleIds: [...new Set(refs.map(function (ref) { return ref.articleId; }))],
    }) || { publications: [], submissionItems: [], orders: [], attentionItems: [] };
  }

  function targetKey(target) {
    return domain.publicationTargetKey(target);
  }

  function itemForTarget(facts, ref, key) {
    return (facts.submissionItems || []).find(function (item) {
      return item.articleId === ref.articleId && item.targetKey === key;
    }) || null;
  }

  function previewRegularQueueAdmission(input) {
    const target = targetFrom(input);
    const refs = refsFrom(input);
    queueConfigForTarget(input, target);
    const facts = factsFor(refs);
    const key = targetKey(target);
    const items = refs.map(function (ref) {
      let article;
      try { article = contentStore.getArticle(ref.clientId, ref.articleId); }
      catch (_) {
        return Object.freeze({ articleRef: ref, articleId: ref.articleId, status: "missing", reasonCode: "ARTICLE_NOT_FOUND" });
      }
      const existing = itemForTarget(facts, ref, key);
      if (existing && existing.status === "queued" && existing.queueGroupId) {
        return Object.freeze({
          articleRef: ref,
          articleId: ref.articleId,
          itemId: existing.itemId,
          batchId: existing.batchId,
          targetKey: key,
          status: "idempotent",
        });
      }
      const workflow = deriveArticleLifecycle({
        article,
        publications: facts.publications,
        submissionItems: facts.submissionItems,
        orders: facts.orders,
        attentionItems: facts.attentionItems,
        removalTransactions: facts.removalTransactions || [],
      });
      const activeTargetKeys = Object.keys(workflow.targetFacts || {});
      if (activeTargetKeys.some(function (activeTargetKey) { return activeTargetKey !== key; })) {
        return Object.freeze({
          articleRef: ref,
          articleId: ref.articleId,
          targetKey: key,
          status: "conflict",
          reasonCode: "ARTICLE_ACTIVE_TARGET_CONFLICT",
        });
      }
      if (!workflow.operations.queue.allowed) {
        return Object.freeze({
          articleRef: ref,
          articleId: ref.articleId,
          targetKey: key,
          status: "conflict",
          reasonCode: workflow.operations.queue.reasonCodes[0] || "ARTICLE_OPERATION_FROZEN",
        });
      }
      return Object.freeze({ articleRef: ref, articleId: ref.articleId, targetKey: key, status: "queueable" });
    });
    return Object.freeze({
      target,
      articleRefs: Object.freeze(refs),
      items: Object.freeze(items),
      totalCount: items.length,
      queueableCount: items.filter(function (item) { return item.status === "queueable"; }).length,
      idempotentCount: items.filter(function (item) { return item.status === "idempotent"; }).length,
      missingCount: items.filter(function (item) { return item.status === "missing"; }).length,
      conflictCount: items.filter(function (item) { return item.status === "conflict"; }).length,
    });
  }

  function admitRegularQueueItems(input) {
    const target = targetFrom(input);
    const refs = refsFrom(input);
    const queueConfig = queueConfigForTarget(input, target);
    const platform = platformList().find(function (candidate) { return candidate.id === target.platformId; });
    const account = accountProfileResolver({
      accountProfileId: target.accountProfileId,
      platformId: target.platformId,
    });
    const targetSnapshotV1 = domain.parseTargetSnapshotV1({
      version: 1,
      kind: "platform",
      platformId: target.platformId,
      platformName: (platform && platform.displayName) || target.platformId,
      accountProfileId: target.accountProfileId,
      accountLabel: account.displayName,
    });
    const customerSnapshotsV1 = Object.freeze(Object.fromEntries(
      refs.map(function (ref) {
        return [
          ref.clientId,
          domain.parseCustomerSnapshotV1(clientSnapshotResolver(ref.clientId)),
        ];
      }),
    ));
    const result = coordinator.admitRegularQueueItems({
      articleRefs: refs,
      target,
      targetSnapshotV1,
      customerSnapshotsV1,
      queueConfig,
    });
    if (result.admittedCount > 0)
      notifyDataInvalidated("SUBMISSION_BATCH_CREATED");
    return Object.freeze(Object.assign({}, result, {
      target,
      articleRefs: Object.freeze(refs),
    }));
  }

  function removePendingQueueItems(input) {
    const request = input || {};
    const entries = Array.isArray(request.items)
      ? request.items
      : Array.isArray(request.selections)
        ? request.selections
        : request.item || request.selection
          ? [request.item || request.selection]
          : [];
    if (!entries.length) throw fail("REGULAR_QUEUE_ITEMS_REQUIRED");
    const items = entries.map(function (item) {
      if (!plainObject(item)) throw fail("REGULAR_QUEUE_ITEM_INVALID");
      const ref = normalizeArticleRef(item.articleRef || item);
      if (typeof item.itemId !== "string" || !item.itemId.trim() || typeof item.batchId !== "string" || !item.batchId.trim())
        throw fail("REGULAR_QUEUE_ITEM_INVALID");
      return Object.assign({}, item, { articleRef: ref });
    });
    const result = coordinator.removePendingQueueItems({ items, operationId: request.operationId });
    if (result.removedCount > 0)
      notifyDataInvalidated("SUBMISSION_BATCH_CANCELLED");
    return Object.freeze(Object.assign({}, result, {
      items: Object.freeze(result.items || []),
    }));
  }

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
    const articlesByClient = new Map();
    const listedClients = new Set();
    const clientsById = new Map();

    function articleFor(clientId, articleId) {
      let articles = articlesByClient.get(clientId);
      if (!articles) {
        articles = new Map();
        articlesByClient.set(clientId, articles);
      }
      if (typeof contentStore.listArticles === "function") {
        if (!listedClients.has(clientId)) {
          try {
            const listed = contentStore.listArticles(clientId);
            if (Array.isArray(listed))
              listed.forEach((candidate) => {
                if (candidate && typeof candidate.id === "string")
                  articles.set(candidate.id, candidate);
              });
          } catch (error) {
            if (!error || error.code !== "ARTICLE_NOT_FOUND") {
              reportDiagnostic({
                code: "REGULAR_QUEUE_ARTICLE_SUMMARY_READ_FAILED",
                module: "regular-queue-application",
                category: "storage",
                operationId: "regular-queue-group-query",
                metadata: {
                  operation: "article-summary",
                  phase: "list",
                  outcome: "fallback",
                  errorCode:
                    error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
                      ? error.code
                      : "ARTICLE_LIST_FAILED",
                },
              });
            }
          }
          listedClients.add(clientId);
        }
        return articles.get(articleId) || null;
      }
      if (articles.has(articleId)) return articles.get(articleId);
      let article;
      try {
        article = contentStore.getArticle(clientId, articleId);
      } catch (error) {
        if (!error || error.code !== "ARTICLE_NOT_FOUND") {
          reportDiagnostic({
            code: "REGULAR_QUEUE_ARTICLE_SUMMARY_READ_FAILED",
            module: "regular-queue-application",
            category: "storage",
            operationId: "regular-queue-group-query",
            metadata: {
              operation: "article-summary",
              phase: "read",
              outcome: "fallback",
              errorCode:
                error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
                  ? error.code
                  : "ARTICLE_READ_FAILED",
            },
          });
        }
      }
      articles.set(articleId, article || null);
      return article;
    }

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
      const article = articleFor(articleRef.clientId, articleRef.articleId);
      const client = clientFor(articleRef.clientId);
      return Object.freeze({
        itemId: raw.itemId,
        batchId: raw.batchId,
        articleId: articleRef.articleId,
        articleRef,
        articleSummary: Object.freeze({
          title: safeDisplayText(article && article.title, "标题不可用", 512),
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

  function updateRegularQueueGroupImageCount(input) {
    if (
      !groupImageCountTransitions ||
      typeof groupImageCountTransitions.setRegularQueueGroupImageCount !==
        "function" ||
      !groupTransitions ||
      typeof groupTransitions.listRegularQueueGroupSnapshots !== "function"
    )
      throw fail("REGULAR_QUEUE_GROUP_IMAGE_COUNT_UNAVAILABLE");
    const request = imageCountUpdateFrom(input);
    const group = groupTransitions
      .listRegularQueueGroupSnapshots({})
      .find(function (candidate) {
        return candidate && candidate.queueGroupId === request.queueGroupId;
      });
    if (
      group &&
      !groupImagePublishingSupported(group.platformId) &&
      request.imageCount !== 0
    )
      throw fail("REGULAR_QUEUE_IMAGE_PUBLISHING_UNSUPPORTED");
    groupImageCountTransitions.setRegularQueueGroupImageCount(request);
    notifyDataInvalidated("REGULAR_QUEUE_GROUP_IMAGE_COUNT_UPDATED");
    return listRegularQueueGroups();
  }

  return Object.freeze({
    previewRegularQueueAdmission,
    admitRegularQueueItems,
    listRegularQueueGroups,
    removePendingQueueItems,
    updateRegularQueueGroupImageCount,
  });
}

module.exports = { createRegularQueueApplication };

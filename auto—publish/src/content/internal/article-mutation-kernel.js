"use strict";

const crypto = require("node:crypto");
const { fingerprintArticle } = require("../content-store");
const {
  deriveArticleLifecycle,
  removalTransactionMatchesArticle,
} = require("../article-lifecycle-projection");
const {
  articleRefOf,
  canonicalArticleRefs,
  normalizeArticleRef,
} = require("../article-ref");

function mutationError(code, message, metadata) {
  const error = new Error(message || code);
  error.code = code;
  if (metadata && typeof metadata === "object") {
    Object.defineProperty(error, "safeMetadata", {
      value: Object.freeze(Object.assign({}, metadata)),
      enumerable: false,
    });
  }
  return error;
}

function safeErrorCode(error) {
  return error && typeof error.code === "string"
    ? error.code
    : "ARTICLE_MUTATION_FAILED";
}

function createArticleMutationKernel(options) {
  const value = options || {};
  if (
    !value.articleStore ||
    typeof value.articleStore.openMutationSession !== "function"
  ) {
    throw mutationError(
      "ARTICLE_MUTATION_COORDINATOR_INVALID",
      "Article mutation store is required",
    );
  }
  if (!value.contentStore) {
    throw mutationError(
      "ARTICLE_MUTATION_COORDINATOR_INVALID",
      "Content store is required",
    );
  }

  const articleStore = value.articleStore;
  const contentStore = value.contentStore;
  const legacyOperationalStore = value.operationalStore || null;
  const publicationTransitions =
    value.publicationTransitions || legacyOperationalStore;
  const lifecycleFacts =
    value.lifecycleFacts ||
    publicationTransitions ||
    value.paidAdmissionTransitions;
  const regularQueueTransitions = value.regularQueueTransitions || null;
  const paidAdmissionTransitions = value.paidAdmissionTransitions || null;
  const paidStagingTransitions = value.paidStagingTransitions || null;
  const removalTransactionStore = value.removalTransactionStore || null;
  const articleRemovalTransitionPort =
    value.articleRemovalTransitionPort || null;
  const clock =
    value.clock ||
    function () {
      return new Date().toISOString();
    };
  const systemSubmissionCodeProvider =
    typeof value.systemSubmissionCodeProvider === "function"
      ? value.systemSubmissionCodeProvider
      : null;

  function nowIso() {
    const current =
      typeof clock === "function" ? clock() : new Date().toISOString();
    const date = current instanceof Date ? current : new Date(current);
    if (!Number.isFinite(date.getTime()))
      throw mutationError("ARTICLE_MUTATION_CLOCK_INVALID");
    return date.toISOString();
  }

  function busyError(cause) {
    return mutationError(
      "ARTICLE_MUTATION_BUSY",
      "文章正在被其他操作修改，请稍后重试",
      {
        causeCode: safeErrorCode(cause),
        retryability: "safe",
      },
    );
  }

  function uncertainError(cause) {
    const error = mutationError(
      "ARTICLE_MUTATION_RESULT_UNCERTAIN",
      "文章操作结果需要人工核对",
      {
        diagnosticId: `article-mutation-${crypto.randomUUID()}`,
        retryability: "manual-check",
        causeCode: safeErrorCode(cause),
      },
    );
    error.diagnosticId = error.safeMetadata.diagnosticId;
    error.retryability = "manual-check";
    return error;
  }

  function mapLockError(error, sideEffect) {
    if (error && error.code === "ARTICLE_MUTATION_RESULT_UNCERTAIN")
      return error;
    if (sideEffect) return uncertainError(error);
    if (
      error &&
      [
        "ARTICLE_STORE_BUSY",
        "ARTICLE_LOCK_BUSY",
        "ARTICLE_MUTATION_BUSY",
      ].includes(error.code)
    ) {
      return busyError(error);
    }
    return error;
  }

  function withArticleSet(refs, operation) {
    const ordered = canonicalArticleRefs(refs);
    let session;
    try {
      session = articleStore.openMutationSession(ordered);
    } catch (error) {
      throw mapLockError(error, false);
    }
    let sideEffect = false;
    const markSideEffect = function () {
      sideEffect = true;
    };
    let result;
    try {
      result = operation(session, markSideEffect);
    } catch (error) {
      try {
        session.release();
      } catch (releaseError) {
        if (sideEffect) throw uncertainError(releaseError);
        throw mapLockError(error, false);
      }
      throw error;
    }
    try {
      session.release();
    } catch (error) {
      throw sideEffect ? uncertainError(error) : busyError(error);
    }
    return result;
  }

  function factsFrom(port, refs) {
    if (!port || typeof port.listArticleLifecycleFacts !== "function") {
      return {
        publications: [],
        submissionItems: [],
        orders: [],
        attentionItems: [],
      };
    }
    return (
      port.listArticleLifecycleFacts({
        articleIds: [
          ...new Set(
            refs.map(function (ref) {
              return ref.articleId;
            }),
          ),
        ],
      }) || {
        publications: [],
        submissionItems: [],
        orders: [],
        attentionItems: [],
      }
    );
  }

  function factsFor(refs, sourcePort) {
    const allRemovalTransactions =
      removalTransactionStore &&
      typeof removalTransactionStore.list === "function"
        ? removalTransactionStore.list()
        : [];
    const removalTransactions = allRemovalTransactions.filter(
      function (transaction) {
        return refs.some(function (ref) {
          return removalTransactionMatchesArticle(transaction, ref);
        });
      },
    );
    const facts = factsFrom(sourcePort || lifecycleFacts, refs);
    const operationalRemovalTransactions = Array.isArray(
      facts.removalTransactions,
    )
      ? facts.removalTransactions
      : [];
    return Object.assign({}, facts, {
      removalTransactions: operationalRemovalTransactions
        .filter(function (transaction) {
          return refs.some(function (ref) {
            return removalTransactionMatchesArticle(transaction, ref);
          });
        })
        .concat(removalTransactions),
    });
  }

  function regularFactsFor(refs) {
    const facts = factsFrom(regularQueueTransitions, refs);
    const allRemovalTransactions =
      removalTransactionStore &&
      typeof removalTransactionStore.list === "function"
        ? removalTransactionStore.list()
        : [];
    return Object.assign({}, facts, {
      removalTransactions: allRemovalTransactions.filter(
        function (transaction) {
          return refs.some(function (ref) {
            return removalTransactionMatchesArticle(transaction, ref);
          });
        },
      ),
    });
  }

  function workflowFor(article, refs, extraFacts) {
    const facts = extraFacts || factsFor(refs);
    return deriveArticleLifecycle({
      article,
      publications: facts.publications,
      submissionItems: facts.submissionItems,
      orders: facts.orders,
      attentionItems: facts.attentionItems,
      removalTransactions: facts.removalTransactions || [],
    });
  }

  function assertAllowed(workflow, action) {
    const operation =
      workflow && workflow.operations && workflow.operations[action];
    if (!operation || operation.allowed !== true) {
      const reasons =
        operation &&
        Array.isArray(operation.reasonCodes) &&
        operation.reasonCodes.length
          ? operation.reasonCodes
          : ["ARTICLE_OPERATION_FROZEN"];
      throw mutationError(
        reasons[0],
        "文章当前不允许执行此操作",
        Object.assign(
          {
            action,
            reasonCodes: reasons.slice(),
          },
          (operation && operation.safeMetadata) || {},
        ),
      );
    }
    return operation;
  }

  function resolveTrustedArticleRef(input) {
    if (input && input.articleRef)
      return normalizeArticleRef(
        input.articleRef,
        "ARTICLE_IDENTITY_UNRESOLVED",
      );
    const articleId = input && input.articleId;
    if (typeof articleId !== "string" || !articleId.trim()) {
      throw mutationError(
        "ARTICLE_IDENTITY_UNRESOLVED",
        "Article identity could not be resolved",
      );
    }
    if (typeof contentStore.findByArticleId !== "function") {
      throw mutationError(
        "ARTICLE_IDENTITY_UNRESOLVED",
        "Article identity could not be resolved",
      );
    }
    const result = contentStore.findByArticleId(articleId);
    if (!result || result.kind !== "one" || !result.article) {
      throw mutationError(
        result && result.kind === "many"
          ? "ARTICLE_IDENTITY_CONFLICT"
          : "ARTICLE_IDENTITY_UNRESOLVED",
        "Article identity could not be resolved",
      );
    }
    return articleRefOf(result.article);
  }

  function createArticle(article) {
    if (typeof articleStore.createArticle !== "function") {
      throw mutationError("ARTICLE_CREATION_PORT_UNAVAILABLE");
    }
    return articleStore.createArticle(article);
  }

  return Object.freeze({
    mutationError,
    safeErrorCode,
    nowIso,
    withArticleSet,
    factsFor,
    regularFactsFor,
    workflowFor,
    assertAllowed,
    resolveTrustedArticleRef,
    createArticle,
    ports: Object.freeze({
      publicationTransitions,
      regularQueueTransitions,
      paidAdmissionTransitions,
      paidStagingTransitions,
      articleRemovalTransitionPort,
    }),
    systemSubmissionCodeProvider,
  });
}

module.exports = { createArticleMutationKernel };

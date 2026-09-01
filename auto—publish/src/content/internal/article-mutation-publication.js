"use strict";

const domain = require("../../domain");
const { fingerprintArticle, snapshotArticle } = require("../content-store");
const { articleRefOf, normalizeArticleRef } = require("../article-ref");

function validFingerprint(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function createArticleMutationPublication(kernel) {
  const publicationTransitions = kernel.ports.publicationTransitions;

  function readArticleForEdit(input) {
    const ref = normalizeArticleRef(
      input && input.articleRef ? input.articleRef : input,
    );
    return kernel.withArticleSet([ref], function (session) {
      const article = session.readArticle(ref);
      return Object.freeze({
        article: snapshotArticle(article),
        editFingerprint: fingerprintArticle(article),
        articleRef: ref,
      });
    });
  }

  function readArticleForRemoval(input) {
    const ref = normalizeArticleRef(
      input && input.articleRef ? input.articleRef : input,
    );
    return kernel.withArticleSet([ref], function (session) {
      return snapshotArticle(session.readArticle(ref));
    });
  }

  function readArticleForPublication(input) {
    const ref = normalizeArticleRef(
      input && input.articleRef ? input.articleRef : input,
    );
    return kernel.withArticleSet([ref], function (session) {
      const article = session.readArticle(ref);
      return Object.freeze({
        articleRef: ref,
        publicationSnapshot: Object.freeze({
          title: article.title,
          body: article.content,
          articleId: article.id,
          fingerprint: fingerprintArticle(article),
        }),
      });
    });
  }

  function saveExistingArticle(input) {
    const request = input || {};
    const article = request.article;
    if (!article || typeof article !== "object" || Array.isArray(article)) {
      throw kernel.mutationError(
        "CONTENT_INPUT_INVALID",
        "Article is required",
      );
    }
    if (!validFingerprint(request.expectedFingerprint)) {
      throw kernel.mutationError(
        "ARTICLE_EDIT_FINGERPRINT_REQUIRED",
        "Article edit fingerprint is required",
      );
    }
    const ref = articleRefOf(article);
    return kernel.withArticleSet([ref], function (session, markSideEffect) {
      const current = session.readArticle(ref);
      kernel.assertAllowed(kernel.workflowFor(current, [ref]), "edit");
      const currentFingerprint = fingerprintArticle(current);
      if (currentFingerprint !== request.expectedFingerprint) {
        return Object.freeze({
          outcome: "conflict",
          code: "ARTICLE_EDIT_CONFLICT",
          articleId: ref.articleId,
          refreshRequired: true,
        });
      }
      // Ordinary editing owns only the article's editable body fields.  The
      // provenance snapshot is the historical fact recorded at generation
      // time and must not be replaced by a stale Renderer projection of the
      // current material/template selection.
      const next = Object.assign({}, current, {
        title: article.title,
        content: article.content,
        clientId: ref.clientId,
        id: ref.articleId,
        status: "saved",
        updatedAt: kernel.nowIso(),
      });
      delete next.editFingerprint;
      const saved = session.replaceArticle(
        ref,
        next,
        request.expectedFingerprint,
      );
      markSideEffect();
      return Object.freeze({
        outcome: "saved",
        article: snapshotArticle(saved),
        editFingerprint: fingerprintArticle(saved),
      });
    });
  }

  function targetFactsFor(workflow) {
    return workflow &&
      workflow.targetFacts &&
      typeof workflow.targetFacts === "object"
      ? workflow.targetFacts
      : {};
  }

  function reservePublicationTarget(input) {
    if (
      !publicationTransitions ||
      typeof publicationTransitions.reservePublicationTarget !== "function"
    ) {
      throw kernel.mutationError("PUBLICATION_RESERVATION_UNAVAILABLE");
    }
    const request = input || {};
    const ref = kernel.resolveTrustedArticleRef(request);
    if (!validFingerprint(request.expectedFingerprint)) {
      throw kernel.mutationError(
        "ARTICLE_EDIT_FINGERPRINT_REQUIRED",
        "Article edit fingerprint is required",
      );
    }
    const target = domain.parsePublicationTarget(request.target);
    const action =
      request.retryFailed === true || request.operation === "retarget"
        ? "retarget"
        : "queue";
    return kernel.withArticleSet([ref], function (session, markSideEffect) {
      const article = session.readArticle(ref);
      const workflow = kernel.workflowFor(article, [ref]);
      kernel.assertAllowed(workflow, action);
      const currentFingerprint = fingerprintArticle(article);
      if (currentFingerprint !== request.expectedFingerprint) {
        throw kernel.mutationError(
          "ARTICLE_EDIT_CONFLICT",
          "Article changed before publication was reserved",
          {
            action,
            articleId: ref.articleId,
            refreshRequired: true,
          },
        );
      }
      const currentTargetKeys = Object.keys(targetFactsFor(workflow));
      if (
        action === "retarget" &&
        typeof request.expectedCurrentTargetKey !== "string"
      ) {
        throw kernel.mutationError(
          "ARTICLE_ACTIVE_TARGET_CONFLICT",
          "Article publication target must be confirmed before retargeting",
        );
      }
      if (
        request.expectedCurrentTargetKey !== undefined &&
        (typeof request.expectedCurrentTargetKey !== "string" ||
          !currentTargetKeys.includes(request.expectedCurrentTargetKey))
      ) {
        throw kernel.mutationError(
          "ARTICLE_ACTIVE_TARGET_CONFLICT",
          "Article publication target changed",
        );
      }
      const publicationSnapshot = Object.freeze({
        title: article.title,
        body: article.content,
        articleId: article.id,
        fingerprint: currentFingerprint,
      });
      const postProcessingPayload = Object.assign(
        {},
        request.postProcessingPayload || {},
        {
          articleRef: ref,
          publicationSnapshot: Object.freeze({
            articleId: publicationSnapshot.articleId,
            title: publicationSnapshot.title,
            body: publicationSnapshot.body,
            fingerprint: publicationSnapshot.fingerprint,
          }),
        },
      );
      let reserved;
      try {
        reserved = publicationTransitions.reservePublicationTarget(
          Object.assign({}, request, {
            articleId: ref.articleId,
            target,
            postProcessingPayload,
          }),
        );
      } catch (error) {
        if (
          error &&
          ["PUBLICATION_DUPLICATE", "PUBLICATION_TARGET_CONFLICT"].includes(
            error.code,
          )
        ) {
          throw kernel.mutationError(
            "ARTICLE_ACTIVE_TARGET_CONFLICT",
            "Article already has an active publication target",
          );
        }
        throw error;
      }
      markSideEffect();
      return Object.freeze(
        Object.assign({}, reserved, {
          articleRef: ref,
          publicationSnapshot,
          postProcessingPayload,
        }),
      );
    });
  }

  function commitPublicationOutcome(input) {
    if (
      !publicationTransitions ||
      typeof publicationTransitions.commitRemoteOutcome !== "function"
    ) {
      throw kernel.mutationError("PUBLICATION_OUTCOME_UNAVAILABLE");
    }
    const request = input || {};
    const ref = kernel.resolveTrustedArticleRef(request);
    return kernel.withArticleSet([ref], function (session, markSideEffect) {
      session.readArticle(ref);
      const committed = publicationTransitions.commitRemoteOutcome(
        Object.assign({}, request, { articleId: ref.articleId }),
      );
      markSideEffect();
      return committed;
    });
  }

  function markRecoveryUncertain(input) {
    if (
      !publicationTransitions ||
      typeof publicationTransitions.markRecoveryUncertain !== "function"
    ) {
      throw kernel.mutationError("PUBLICATION_RECOVERY_UNAVAILABLE");
    }
    const request = input || {};
    const ref = kernel.resolveTrustedArticleRef(request);
    return kernel.withArticleSet([ref], function (session, markSideEffect) {
      session.readArticle(ref);
      const result = publicationTransitions.markRecoveryUncertain(
        Object.assign({}, request, { articleId: ref.articleId }),
      );
      markSideEffect();
      return result;
    });
  }

  return Object.freeze({
    readArticleForEdit,
    readArticleForRemoval,
    readArticleForPublication,
    createArticle: kernel.createArticle,
    saveExistingArticle,
    resolveTrustedArticleRef: kernel.resolveTrustedArticleRef,
    reservePublicationTarget,
    commitPublicationOutcome,
    markRecoveryUncertain,
  });
}

module.exports = { createArticleMutationPublication };

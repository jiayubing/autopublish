"use strict";

const { snapshotArticle } = require("../content-store");
const {
  trashedArticleMutationBlockReason,
} = require("../article-lifecycle-projection");
const { canonicalArticleRefs, normalizeArticleRef } = require("../article-ref");

function createArticleMutationRemoval(kernel) {
  const articleRemovalTransitionPort =
    kernel.ports.articleRemovalTransitionPort;

  function executeArticleRemovalTransaction(input) {
    const request = input || {};
    const selections =
      request.selections || (request.selection ? [request.selection] : []);
    const ordered = canonicalArticleRefs(selections);
    if (
      request.transaction &&
      articleRemovalTransitionPort &&
      typeof articleRemovalTransitionPort.execute === "function"
    ) {
      return kernel.withArticleSet(ordered, function (session, markSideEffect) {
        const articles = ordered.map(function (ref) {
          try {
            return session.readArticle(ref);
          } catch (error) {
            if (error && error.code === "ARTICLE_NOT_FOUND") return null;
            throw error;
          }
        });
        const facts = kernel.factsFor(ordered);
        articles.forEach(function (article, index) {
          if (!article) {
            const ref = ordered[index];
            if (session.isArticleTrashed(ref)) return;
            throw kernel.mutationError(
              "ARTICLE_NOT_FOUND",
              "Article was not found",
            );
          }
          kernel.assertAllowed(
            kernel.workflowFor(article, [ordered[index]], facts),
            "trash",
          );
        });
        const mutationPort = Object.freeze({
          refs: Object.freeze(ordered.slice()),
          readArticle: function (ref) {
            return session.readArticle(ref);
          },
          isArticleTrashed: function (ref) {
            return session.isArticleTrashed(ref);
          },
          getTrashedTombstone: function (ref) {
            return session.getTrashedTombstone(ref);
          },
          moveArticleToTrash: function (
            ref,
            tombstone,
            operationId,
            expectedFingerprint,
          ) {
            markSideEffect();
            return session.moveArticleToTrash(
              ref,
              tombstone,
              operationId,
              expectedFingerprint,
            );
          },
          markSideEffect,
        });
        return articleRemovalTransitionPort.execute({
          transaction: request.transaction,
          requireRevalidation: request.requireRevalidation === true,
          articles: Object.freeze(articles),
          facts,
          mutation: mutationPort,
        });
      });
    }
    const selected = normalizeArticleRef(request.selection || selections[0]);
    return kernel.withArticleSet(ordered, function (session, markSideEffect) {
      const articles = ordered.map(function (ref) {
        try {
          return session.readArticle(ref);
        } catch (error) {
          if (error && error.code === "ARTICLE_NOT_FOUND") return null;
          throw error;
        }
      });
      const current = articles.find(function (article) {
        return (
          article &&
          article.clientId === selected.clientId &&
          article.id === selected.articleId
        );
      });
      if (!current) {
        if (
          typeof session.isArticleTrashed === "function" &&
          session.isArticleTrashed(selected)
        ) {
          return Object.freeze({ idempotent: true, articleRef: selected });
        }
        throw kernel.mutationError(
          "ARTICLE_NOT_FOUND",
          "Article was not found",
        );
      }
      const facts = kernel.factsFor(ordered);
      articles.forEach(function (article, index) {
        if (!article) {
          const ref = ordered[index];
          if (
            typeof session.isArticleTrashed === "function" &&
            session.isArticleTrashed(ref)
          )
            return;
          throw kernel.mutationError(
            "ARTICLE_NOT_FOUND",
            "Article was not found",
          );
        }
        kernel.assertAllowed(
          kernel.workflowFor(article, [ordered[index]], facts),
          "trash",
        );
      });
      kernel.assertAllowed(
        kernel.workflowFor(current, [selected], facts),
        "trash",
      );
      const moved = session.moveArticleToTrash(
        selected,
        request.tombstone,
        request.operationId,
        request.expectedFingerprint,
      );
      markSideEffect();
      return Object.freeze({ articleRef: selected, tombstone: moved });
    });
  }

  function assertTrashedMutationAllowed(
    ref,
    session,
    operation,
    tombstone,
    knownFacts,
  ) {
    const currentTombstone = tombstone || session.getTrashedTombstone(ref);
    const facts = knownFacts || kernel.factsFor([ref]);
    const workflow = kernel.workflowFor(
      {
        id: ref.articleId,
        clientId: ref.clientId,
        title: currentTombstone.titleSnapshot || "trashed article",
        content: "trashed article",
        status: "trashed",
      },
      [ref],
      facts,
    );
    const reason = trashedArticleMutationBlockReason(
      workflow,
      facts.removalTransactions,
    );
    if (reason) {
      throw kernel.mutationError(
        reason,
        operation === "restore"
          ? "文章存在未结束的发布事实，不能恢复"
          : "文章存在未结束的发布事实，不能永久删除",
        { action: operation, articleId: ref.articleId },
      );
    }
    return currentTombstone;
  }

  function tombstoneComparisonKey(tombstone) {
    const value = tombstone || {};
    return JSON.stringify({
      version: value.version,
      deletedAt: value.deletedAt,
      clientId: value.clientId,
      articleId: value.articleId,
      status: value.status,
      references: Array.isArray(value.references) ? value.references : [],
      titleSnapshot:
        value.titleSnapshot === undefined ? null : value.titleSnapshot,
      contentFingerprint: value.contentFingerprint || null,
      permanentlyDeleted: value.permanentlyDeleted === true,
      purgedAt: value.purgedAt || null,
    });
  }

  function transitionRefs(input) {
    const request = input || {};
    const values = Array.isArray(request.articleRefs)
      ? request.articleRefs
      : Array.isArray(request.selections)
        ? request.selections
        : request.articleRef || request;
    return canonicalArticleRefs(Array.isArray(values) ? values : [values]);
  }

  function restoreArticles(input) {
    const request = input || {};
    const refs = transitionRefs(request);
    return kernel.withArticleSet(refs, function (session, markSideEffect) {
      const facts = kernel.factsFor(refs);
      const prepared = refs.map(function (ref) {
        const tombstone = assertTrashedMutationAllowed(
          ref,
          session,
          "restore",
          undefined,
          facts,
        );
        return { ref, tombstone };
      });
      const items = prepared.map(function (item) {
        markSideEffect();
        const article = session.restoreTrashedArticle(item.ref);
        assertTrashedMutationAllowed(
          item.ref,
          session,
          "restore",
          item.tombstone,
          facts,
        );
        return Object.freeze({
          articleRef: item.ref,
          article: snapshotArticle(article),
          tombstone: snapshotArticle(item.tombstone),
          restored: true,
        });
      });
      return Object.freeze({
        items: Object.freeze(items),
        restoredCount: items.length,
      });
    });
  }

  function permanentlyDeleteArticles(input) {
    const request = input || {};
    const refs = transitionRefs(request);
    return kernel.withArticleSet(refs, function (session, markSideEffect) {
      const facts = kernel.factsFor(refs);
      const prepared = refs.map(function (ref) {
        const currentTombstone = session.getTrashedTombstone(ref);
        const expectedTombstone =
          request.expectedTombstone ||
          (Array.isArray(request.expectedTombstones)
            ? request.expectedTombstones.find(function (value) {
                return (
                  value &&
                  value.clientId === ref.clientId &&
                  value.articleId === ref.articleId
                );
              })
            : null);
        if (
          expectedTombstone &&
          tombstoneComparisonKey(expectedTombstone) !==
            tombstoneComparisonKey(currentTombstone)
        ) {
          throw kernel.mutationError(
            "ARTICLE_TOMBSTONE_CHANGED",
            "Article tombstone changed before permanent deletion",
          );
        }
        const tombstone = assertTrashedMutationAllowed(
          ref,
          session,
          "permanent-delete",
          currentTombstone,
          facts,
        );
        return { ref, tombstone };
      });
      const items = prepared.map(function (item) {
        markSideEffect();
        const tombstone = session.permanentlyDeleteTrashedArticle(
          item.ref,
          request.purgedAt,
        );
        assertTrashedMutationAllowed(
          item.ref,
          session,
          "permanent-delete",
          tombstone,
          facts,
        );
        return Object.freeze({
          articleRef: item.ref,
          tombstone: snapshotArticle(tombstone),
          deleted: true,
        });
      });
      return Object.freeze({
        items: Object.freeze(items),
        deletedCount: items.length,
      });
    });
  }

  function assertTrashedArticleMutationAllowed(input) {
    const request = input || {};
    const ref = normalizeArticleRef(request.articleRef || request);
    return kernel.withArticleSet([ref], function (session) {
      const tombstone = assertTrashedMutationAllowed(
        ref,
        session,
        request.operation || "restore",
      );
      return Object.freeze({
        articleRef: ref,
        tombstone: snapshotArticle(tombstone),
      });
    });
  }

  function restoreTrashedArticle(input) {
    const result = restoreArticles({
      articleRefs: [
        normalizeArticleRef(
          input && input.articleRef ? input.articleRef : input,
        ),
      ],
    });
    return Object.freeze(
      Object.assign({}, result.items[0], {
        items: result.items,
        restoredCount: result.restoredCount,
      }),
    );
  }

  function permanentlyDeleteTrashedArticle(input) {
    const request = input || {};
    const result = permanentlyDeleteArticles({
      articleRefs: [normalizeArticleRef(request.articleRef || request)],
      purgedAt: request.purgedAt,
      expectedTombstone: request.expectedTombstone,
    });
    return Object.freeze(
      Object.assign({}, result.items[0], {
        items: result.items,
        deletedCount: result.deletedCount,
      }),
    );
  }

  return Object.freeze({
    executeArticleRemovalTransaction,
    assertTrashedArticleMutationAllowed,
    restoreArticles,
    permanentlyDeleteArticles,
    restoreTrashedArticle,
    permanentlyDeleteTrashedArticle,
    supportsArticleRemovalTransaction: function () {
      return Boolean(
        articleRemovalTransitionPort &&
        typeof articleRemovalTransitionPort.execute === "function",
      );
    },
  });
}

module.exports = { createArticleMutationRemoval };

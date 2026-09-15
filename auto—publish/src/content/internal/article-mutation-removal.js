"use strict";

const { snapshotArticle, fingerprintArticle } = require("../content-store");
const {
  trashedArticleMutationBlockReason,
} = require("../article-lifecycle-projection");
const {
  canonicalArticleRefKey,
  canonicalArticleRefs,
  normalizeArticleRef,
} = require("../article-ref");

const {
  titleSnapshot,
  tombstoneReferences,
} = require("../article-removal-plan");
const { reportDiagnostic } = require("../../diagnostics/diagnostic-producer");

function createArticleMutationRemoval(kernel) {
  const transactionStore = kernel.ports.removalTransactionStore;

  function previewTrashEligibility(input) {
    const refs = transitionRefs(input);
    return kernel.withArticleSet(refs, function (session) {
      const missing = new Set();
      const articles = refs.map(function (ref) {
        if (session.isArticleTrashed(ref)) return null;
        try {
          return session.readArticle(ref);
        } catch (error) {
          if (!error || error.code !== "ARTICLE_NOT_FOUND") throw error;
          missing.add(ref);
          return null;
        }
      });
      const facts = kernel.factsFor(refs);
      const lifecycleFacts = Object.assign({}, facts, {
        removalTransactions: [],
      });
      const items = articles.map(function (article, index) {
        if (missing.has(refs[index])) {
          return Object.freeze({
            articleRef: refs[index],
            allowed: false,
            reasonCodes: ["ARTICLE_NOT_FOUND"],
            safeMetadata: {},
          });
        }
        if (!article) {
          const tombstone = session.getTrashedTombstone(refs[index]);
          return Object.freeze({
            articleRef: refs[index],
            allowed: true,
            reasonCodes: [],
            trashed: true,
            contentFingerprint: tombstone.contentFingerprint,
            titleSnapshot: tombstone.titleSnapshot,
            operationId: tombstone.operationId,
          });
        }
        const workflow = kernel.workflowFor(
          article,
          [refs[index]],
          lifecycleFacts,
        );
        const operation = workflow.operations.trash;
        return Object.freeze({
          articleRef: refs[index],
          contentFingerprint: fingerprintArticle(article),
          titleSnapshot: article.title,
          trashed: false,
          allowed: operation.allowed,
          reasonCodes: operation.reasonCodes,
          safeMetadata: operation.safeMetadata,
        });
      });
      return Object.freeze({ items: Object.freeze(items) });
    });
  }

  function executeArticleRemovalTransaction(input) {
    const request = input || {};
    const ordered = canonicalArticleRefs(request.selections);
    if (!request.transaction || !transactionStore)
      throw kernel.mutationError("ARTICLE_REMOVAL_UNAVAILABLE");
    let committed;
    try {
      return kernel.withArticleSet(ordered, function (session, markSideEffect) {
        let current = request.transaction;
        if (current.resume) {
          current = transactionStore.get(current.id);
          if (!current) return { ...request.transaction, status: "committed" };
        }
        const keys = new Set(ordered.map(canonicalArticleRefKey));
        const other = transactionStore
          .list()
          .some(
            (value) =>
              value.id !== current.id &&
              value.selections.some((ref) =>
                keys.has(canonicalArticleRefKey(ref)),
              ),
          );
        if (other)
          throw kernel.mutationError("ARTICLE_REMOVAL_OPERATION_IN_FLIGHT");
        const facts = kernel.factsFor(ordered);
        const ownFacts = Object.assign({}, facts, {
          removalTransactions: (facts.removalTransactions || []).filter(
            (value) => (value.id || value.transactionId) !== current.id,
          ),
        });
        const prepared = current.selections.map((ref, index) => {
          const expected = current.articles[index];
          // Tombstone reads reconcile an interrupted file move before examining JSON.
          if (session.isArticleTrashed(ref)) {
            const tombstone = session.getTrashedTombstone(ref);
            if (
              tombstone.operationId !== expected.operationId ||
              tombstone.contentFingerprint !== expected.contentFingerprint
            )
              throw kernel.mutationError("ARTICLE_REMOVAL_OPERATION_CONFLICT");
            return { ref, tombstone };
          }
          if (expected.operationId !== current.id + "-" + index)
            throw kernel.mutationError("ARTICLE_REMOVAL_OPERATION_CONFLICT");
          const article = session.readArticle(ref);
          kernel.assertAllowed(
            kernel.workflowFor(article, [ref], ownFacts),
            "trash",
          );
          if (fingerprintArticle(article) !== expected.contentFingerprint)
            throw kernel.mutationError("ARTICLE_REMOVAL_CONTENT_CHANGED");
          return { ref, article, expected };
        });
        // One durable batch intent; per-article progress belongs to ArticleStore.
        if (!request.transaction.resume) transactionStore.save(current);
        for (const item of prepared) {
          if (item.tombstone) continue;
          markSideEffect();
          session.moveArticleToTrash(
            item.ref,
            {
              version: 1,
              deletedAt: current.createdAt,
              clientId: item.ref.clientId,
              articleId: item.ref.articleId,
              status: item.article.status,
              references: tombstoneReferences(item.article),
              titleSnapshot: titleSnapshot(item.article),
              contentFingerprint: item.expected.contentFingerprint,
              operationId: item.expected.operationId,
            },
            item.expected.operationId,
            item.expected.contentFingerprint,
          );
        }
        // Remove the intent before releasing locks so restore cannot race a replay.
        transactionStore.remove(current.id);
        committed = { ...current, status: "committed" };
        return committed;
      });
    } catch (error) {
      if (!committed) throw error;
      reportDiagnostic({
        code: "ARTICLE_REMOVAL_CLEANUP_FAILED",
        module: "article-mutation-removal",
        category: "storage",
        operationId: committed.id,
        metadata: { outcome: "committed-cleanup-failed" },
      });
      return committed;
    }
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
    previewTrashEligibility,
    executeArticleRemovalTransaction,
    assertTrashedArticleMutationAllowed,
    restoreArticles,
    permanentlyDeleteArticles,
    restoreTrashedArticle,
    permanentlyDeleteTrashedArticle,
  });
}

module.exports = { createArticleMutationRemoval };

"use strict";

const domain = require("../../../domain");

function createPaidStagingAggregate(context) {
  const { db, open, transaction, clock, fail, iso, articleReader } = context;

  function refsFrom(input) {
    const value = Array.isArray(input) ? input : input && input.articleRefs;
    try {
      return domain.parsePaidStagingArticleRefs(value);
    } catch (_) {
      throw fail(_.code || "PAID_STAGING_ARTICLES_INVALID");
    }
  }

  function refFrom(input) {
    const value = input && input.articleRef ? input.articleRef : input;
    try {
      return domain.parsePaidStagingArticleRefs([value])[0];
    } catch (_) {
      throw fail("PAID_STAGING_ARTICLE_IDENTITY_INVALID");
    }
  }

  function mediaIdFrom(value) {
    try {
      return domain.parsePaidStagingMediaResourceId(value);
    } catch (_) {
      throw fail("PAID_STAGING_MEDIA_RESOURCE_ID_INVALID");
    }
  }

  function articleState(ref) {
    if (
      !articleReader ||
      typeof articleReader.getArticle !== "function"
    )
      throw fail("PAID_STAGING_ARTICLE_STATE_UNAVAILABLE");
    try {
      const article = articleReader.getArticle(ref.clientId, ref.articleId);
      if (
        !article ||
        article.id !== ref.articleId ||
        article.clientId !== ref.clientId
      )
        throw fail("ARTICLE_NOT_SAVED");
      if (article.status !== "generated" && article.status !== "saved")
        throw fail("ARTICLE_NOT_SAVED");
      return article;
    } catch (error) {
      if (error && error.code === "ARTICLE_NOT_FOUND")
        throw fail("ARTICLE_NOT_FOUND");
      if (error && error.code === "ARTICLE_NOT_SAVED")
        throw error;
      throw fail("PAID_STAGING_ARTICLE_STATE_UNAVAILABLE");
    }
  }

  function assertNoActivePublication(ref) {
    const active = db
      .prepare(
        "SELECT 1 FROM article_active_targets WHERE article_id=? LIMIT 1",
      )
      .get(ref.articleId);
    const legacy = db
      .prepare(
        "SELECT 1 FROM publication_records WHERE article_id=? AND status IN('queued','remote_started','published','uncertain') LIMIT 1",
      )
      .get(ref.articleId);
    if (active || legacy) throw fail("ARTICLE_ACTIVE_TARGET_CONFLICT");
  }

  function project(row) {
    return Object.freeze(
      domain.parsePaidStagingItem({
        articleRef: { clientId: row.client_id, articleId: row.article_id },
        selectedMediaResourceId: row.selected_media_resource_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    );
  }

  function itemResult(ref, status, idempotent) {
    return Object.freeze({
      articleRef: ref,
      status,
      idempotent: idempotent === true,
    });
  }

  function addPaidStagingItems(input) {
    open();
    const refs = refsFrom(input);
    const stamp = iso(clock);
    return transaction(() => {
      refs.forEach((ref) => {
        articleState(ref);
        assertNoActivePublication(ref);
      });
      const results = refs.map((ref) => {
        const existing = db
          .prepare(
            "SELECT client_id,article_id FROM paid_staging_items WHERE client_id=? AND article_id=?",
          )
          .get(ref.clientId, ref.articleId);
        if (existing) return itemResult(ref, "already-staged", true);
        db.prepare(
          "INSERT INTO paid_staging_items(client_id,article_id,selected_media_resource_id,created_at,updated_at) VALUES(?,?,?,?,?)",
        ).run(ref.clientId, ref.articleId, null, stamp, stamp);
        return itemResult(ref, "staged", false);
      });
      return Object.freeze({
        items: Object.freeze(results),
        addedCount: results.filter((item) => !item.idempotent).length,
        idempotentCount: results.filter((item) => item.idempotent).length,
      });
    });
  }

  function removePaidStagingItems(input) {
    open();
    const refs = refsFrom(input);
    const results = transaction(() =>
      refs.map((ref) => {
        const changed = db
          .prepare(
            "DELETE FROM paid_staging_items WHERE client_id=? AND article_id=?",
          )
          .run(ref.clientId, ref.articleId).changes;
        return itemResult(ref, changed === 1 ? "removed" : "not-staged", changed !== 1);
      }),
    );
    return Object.freeze({
      items: Object.freeze(results),
      removedCount: results.filter((item) => !item.idempotent).length,
      idempotentCount: results.filter((item) => item.idempotent).length,
    });
  }

  function listPaidStagingItems(input) {
    open();
    const value = input || {};
    let clientId;
    try {
      clientId = domain.ClientId.serialize(domain.ClientId.parse(value.clientId));
    } catch (_) {
      throw fail("PAID_STAGING_CLIENT_SCOPE_INVALID");
    }
    return Object.freeze(
      db
        .prepare(
          "SELECT client_id,article_id,selected_media_resource_id,created_at,updated_at FROM paid_staging_items WHERE client_id=? ORDER BY created_at,article_id",
        )
        .all(clientId)
        .map(project),
    );
  }

  function setPaidStagingMedia(input, requestedMediaResourceId) {
    open();
    const refs = refsFrom(input);
    const mediaResourceId = mediaIdFrom(requestedMediaResourceId);
    const stamp = iso(clock);
    return transaction(() => {
      const results = refs.map((ref) => {
        const row = db
          .prepare(
            "SELECT selected_media_resource_id FROM paid_staging_items WHERE client_id=? AND article_id=?",
          )
          .get(ref.clientId, ref.articleId);
        if (!row) throw fail("PAID_STAGING_ITEM_NOT_FOUND");
        const changed =
          row.selected_media_resource_id === mediaResourceId
            ? 0
            : db
                .prepare(
                  "UPDATE paid_staging_items SET selected_media_resource_id=?,updated_at=? WHERE client_id=? AND article_id=?",
                )
                .run(mediaResourceId, stamp, ref.clientId, ref.articleId).changes;
        return itemResult(
          ref,
          changed === 1 ? "media-updated" : "already-set",
          changed !== 1,
        );
      });
      return Object.freeze({
        items: Object.freeze(results),
        updatedCount: results.filter((item) => !item.idempotent).length,
        idempotentCount: results.filter((item) => item.idempotent).length,
        selectedMediaResourceId: mediaResourceId,
      });
    });
  }

  function hasPaidStagingItem(input) {
    open();
    const ref = refFrom(input);
    return Boolean(
      db
        .prepare(
          "SELECT 1 FROM paid_staging_items WHERE client_id=? AND article_id=? LIMIT 1",
        )
        .get(ref.clientId, ref.articleId),
    );
  }

  return Object.freeze({
    addPaidStagingItems,
    removePaidStagingItems,
    listPaidStagingItems,
    setPaidStagingMedia,
    hasPaidStagingItem,
  });
}

module.exports = { createPaidStagingAggregate };

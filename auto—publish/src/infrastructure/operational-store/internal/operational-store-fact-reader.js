const domain = require("../../../domain");

const {
  fromText,
  cancellationResolutionFromIntent,
  safeDisplayText,
  safeEvidenceUrl,
  safeOperationalPayload,
  supplierObservation,
} = require("./operational-store-utils");

function createOperationalStoreFactReader(context) {
  const { db, open, fail, internalLifecycleProjectionObserver } = context;

  function articleIdsOf(input) {
    const value = input || {};
    if (!Array.isArray(value.articleIds) || value.articleIds.length > 5000)
      throw fail("OPERATIONAL_FACT_ARTICLES_INVALID");
    return value.articleIds.map((id) =>
      domain.ArticleId.serialize(domain.ArticleId.parse(id)),
    );
  }

  function placeholders(values) {
    return values.map(() => "?").join(",");
  }

  function targetFields(target) {
    const value = target && typeof target === "object" ? target : {};
    return {
      platformId: value.kind === "platform" ? value.platformId || null : null,
      mediaResourceId:
        value.kind === "media" ? value.mediaResourceId || null : null,
    };
  }

  function listArticleLifecycleFacts(input) {
    open();
    const articleIds = articleIdsOf(input);
    if (!articleIds.length)
      return Object.freeze({
        publications: Object.freeze([]),
        submissionItems: Object.freeze([]),
        orders: Object.freeze([]),
        attentionItems: Object.freeze([]),
        manualReconciliations: Object.freeze([]),
      });
    const inList = placeholders(articleIds);
    const publications = db
      .prepare(
        `SELECT p.publication_id,p.article_id,p.target_key,p.target_json,p.status,p.created_at,p.updated_at,a.attempt_id,a.finished_at,i.payload_json AS intent_payload,e.remote_id,e.remote_url FROM publication_records p LEFT JOIN publication_attempts a ON a.attempt_id=(SELECT latest.attempt_id FROM publication_attempts latest WHERE latest.publication_id=p.publication_id ORDER BY latest.created_at DESC,latest.attempt_id DESC LIMIT 1) LEFT JOIN recovery_intents i ON i.attempt_id=a.attempt_id LEFT JOIN remote_evidence e ON e.evidence_id=(SELECT latest_evidence.evidence_id FROM remote_evidence latest_evidence WHERE latest_evidence.attempt_id=a.attempt_id ORDER BY latest_evidence.created_at DESC,latest_evidence.evidence_id DESC LIMIT 1) WHERE p.article_id IN(${inList}) ORDER BY p.created_at,p.publication_id`,
      )
      .all(...articleIds)
      .map((row) => {
        const target = fromText(row.target_json) || {};
        const cancellation = cancellationResolutionFromIntent(row.intent_payload);
        return Object.freeze({
          publicationId: row.publication_id,
          articleId: row.article_id,
          targetKey: row.target_key,
          ...targetFields(target),
          status: cancellation ? "cancelled" : row.status,
          ...(cancellation ? {
            reasonCode: cancellation.reasonCode || "REGULAR_QUEUE_ITEM_CANCELLED",
            cancelledAt: cancellation.cancelledAt || null,
          } : {}),
          target,
          attemptId: row.attempt_id || null,
          remoteId: row.remote_id || null,
          remoteUrl: safeEvidenceUrl(row.remote_url) || null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          finishedAt: row.finished_at || null,
        });
      });
    const submissionItems = db
      .prepare(
        `SELECT s.item_id,s.batch_id,s.article_id,s.target_key,s.revision,s.status,s.payload_json,q.queue_group_id,q.position,q.created_at AS queued_at,g.platform_id,g.account_profile_id,g.pause_intent FROM submission_items s LEFT JOIN submission_queue_items q ON q.item_id=s.item_id LEFT JOIN submission_queue_groups g ON g.queue_group_id=q.queue_group_id WHERE s.article_id IN(${inList}) ORDER BY s.article_id,s.item_id`,
      )
      .all(...articleIds)
      .map((row) =>
        Object.freeze({
          itemId: row.item_id,
          batchId: row.batch_id,
          articleId: row.article_id,
          targetKey: row.target_key,
          revision: row.revision,
          status: row.status,
          canCancel: row.status === "queued",
          payload: safeOperationalPayload(row.payload_json),
          queueGroupId: row.queue_group_id || null,
          position: row.position || null,
          platformId: row.platform_id || null,
          accountProfileId: row.account_profile_id || null,
          pauseIntent: row.pause_intent || null,
          createdAt: row.queued_at || null,
        }),
      );
    const orders = db
      .prepare(
        `SELECT o.order_id,o.remote_id,o.payload_json,o.created_at,a.attempt_id,a.status AS publication_status,p.publication_id,p.article_id,p.target_json,d.title_snapshot,d.filename,d.resource_name_snapshot,d.quoted_price,d.media_resource_id,d.estimated_total,d.system_submission_code FROM remote_orders o JOIN publication_attempts a ON a.attempt_id=o.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id LEFT JOIN order_display_snapshots d ON d.attempt_id=a.attempt_id WHERE p.article_id IN(${inList}) ORDER BY o.created_at DESC,o.order_id DESC`,
      )
      .all(...articleIds)
      .map((row) => {
        const evidence = fromText(row.payload_json) || {};
        const observation = supplierObservation(evidence);
        const target = fromText(row.target_json) || {};
        return Object.freeze({
          orderId: row.order_id,
          orderNid: row.order_id,
          remoteId: row.remote_id,
          attemptId: row.attempt_id,
          publicationId: row.publication_id,
          articleId: row.article_id,
          mediaResourceId:
            row.media_resource_id || target.mediaResourceId || null,
          targetKey:
            target.kind === "media"
              ? `media-resource:${target.mediaResourceId}`
              : null,
          publicationStatus: row.publication_status,
          supplierStatusCode: observation ? observation.statusCode : "",
          supplierObservedAt: observation ? observation.observedAt : null,
          publishedAt: observation ? observation.publishedAt : null,
          remoteUrl: safeEvidenceUrl(evidence.remoteUrl) || null,
          titleSnapshot: safeDisplayText(row.title_snapshot, 1000),
          filename: safeDisplayText(row.filename, 255),
          resourceNameSnapshot: safeDisplayText(
            row.resource_name_snapshot,
            500,
          ),
          quotedPrice: row.quoted_price === null ? null : row.quoted_price,
          estimatedTotal:
            row.estimated_total === null ? null : row.estimated_total,
          systemSubmissionCode:
            safeDisplayText(row.system_submission_code, 128) || null,
          submittedAt: row.created_at,
        });
      });
    const attentionItems = db
      .prepare(
        `SELECT i.attempt_id,i.state,i.payload_json,p.publication_id,p.article_id,p.target_key,p.status,p.updated_at FROM recovery_intents i JOIN publication_attempts a ON a.attempt_id=i.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id WHERE p.article_id IN(${inList}) AND i.state='manual_check' ORDER BY i.updated_at,i.attempt_id`,
      )
      .all(...articleIds)
      .map((row) => {
        const payload = fromText(row.payload_json) || {};
        const detail =
          payload.detail && typeof payload.detail === "object"
            ? payload.detail
            : {};
        return Object.freeze({
          attentionId: `publication:${row.attempt_id}`,
          kind: "publication_uncertain",
          attemptId: row.attempt_id,
          publicationId: row.publication_id,
          articleId: row.article_id,
          targetKey: row.target_key,
          status: row.status,
          reasonCode:
            typeof detail.code === "string"
              ? detail.code
              : "PUBLICATION_UNCERTAIN",
          updatedAt: row.updated_at,
        });
      });
    const manualReconciliations = db
      .prepare(
        `SELECT reconciliation_id,attempt_id,article_id,decision,evidence_json,created_at FROM manual_reconciliation_facts WHERE article_id IN(${inList}) ORDER BY created_at,reconciliation_id`,
      )
      .all(...articleIds)
      .map((row) =>
        Object.freeze({
          reconciliationId: row.reconciliation_id,
          attemptId: row.attempt_id,
          articleId: row.article_id,
          decision: row.decision,
          evidence: safeOperationalPayload(row.evidence_json),
          createdAt: row.created_at,
        }),
      );
    if (internalLifecycleProjectionObserver)
      internalLifecycleProjectionObserver({
        sqlCount: 5,
        rowCount:
          publications.length +
          submissionItems.length +
          orders.length +
          attentionItems.length +
          manualReconciliations.length,
        parsedPayloadCount:
          submissionItems.length +
          orders.length +
          attentionItems.length +
          manualReconciliations.length,
      });
    return Object.freeze({
      publications: Object.freeze(publications),
      submissionItems: Object.freeze(submissionItems),
      orders: Object.freeze(orders),
      attentionItems: Object.freeze(attentionItems),
      manualReconciliations: Object.freeze(manualReconciliations),
    });
  }

  return Object.freeze({ listArticleLifecycleFacts });
}

module.exports = { createOperationalStoreFactReader };

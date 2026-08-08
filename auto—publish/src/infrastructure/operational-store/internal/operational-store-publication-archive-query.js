"use strict";

const domain = require("../../../domain");

function createOperationalStorePublicationArchiveQuery(
  context,
  publicationSuccess,
) {
  const { open, fail } = context;
  if (
    !publicationSuccess ||
    typeof publicationSuccess.listFirstPublicationSuccesses !== "function"
  )
    throw fail("PUBLICATION_ARCHIVE_QUERY_INVALID");

  function articleIdsOf(input) {
    const value = input || {};
    if (!Array.isArray(value.articleIds) || value.articleIds.length > 5000)
      throw fail("PUBLICATION_ARCHIVE_ARTICLES_INVALID");
    try {
      return value.articleIds.map((id) =>
        domain.ArticleId.serialize(domain.ArticleId.parse(id)),
      );
    } catch (_) {
      throw fail("PUBLICATION_ARCHIVE_ARTICLES_INVALID");
    }
  }

  function targetIdentityFromSnapshot(snapshot) {
    if (snapshot.kind === "platform")
      return domain.parseTargetIdentityV1({
        version: 1,
        kind: "platform",
        platformId: snapshot.platformId,
        accountProfileId: snapshot.accountProfileId,
      });
    if (snapshot.kind === "media")
      return domain.parseTargetIdentityV1({
        version: 1,
        kind: "media",
        mediaResourceId: snapshot.mediaResourceId,
      });
    return domain.parseTargetIdentityV1({
      version: 1,
      kind: "legacy-unknown-account",
      platformId: snapshot.platformId,
      autoExecutable: false,
    });
  }

  function archiveFor(success) {
    const evidence = domain.parsePublicationEvidenceV1(
      success.publicationEvidenceV1,
      { allowLegacy: true },
    );
    let articleId;
    try {
      articleId = domain.ArticleId.serialize(
        domain.ArticleId.parse(success.articleId),
      );
    } catch (_) {
      throw fail("PUBLICATION_ARCHIVE_EVIDENCE_INVALID");
    }
    if (articleId !== evidence.articleIdentityV1.articleId)
      throw fail("PUBLICATION_ARCHIVE_EVIDENCE_ARTICLE_MISMATCH");
    const evidenceReference = evidence.safeEvidenceRefs[0];
    if (!evidenceReference) throw fail("PUBLICATION_ARCHIVE_EVIDENCE_INVALID");
    let publicationId;
    try {
      publicationId = domain.PublicationId.serialize(
        domain.PublicationId.parse(success.publicationId),
      );
    } catch (_) {
      throw fail("PUBLICATION_ARCHIVE_EVIDENCE_INVALID");
    }
    const terminalTargetV1 = domain.parseTerminalTargetV1({
      version: 1,
      articleIdentityV1: evidence.articleIdentityV1,
      targetIdentityV1: targetIdentityFromSnapshot(evidence.targetSnapshotV1),
      attemptId: success.attemptId,
      terminalKind: "PUBLISHED",
      reasonCode: "PUBLICATION_SUCCESS",
      terminalAt: evidence.firstPublishedAt,
      terminalAtSource: evidence.firstPublishedAtSource,
      evidenceFingerprint: evidenceReference.fingerprint,
    });
    return Object.freeze({
      publicationId,
      attemptId: success.attemptId,
      publicationEvidenceV1: evidence,
      terminalTargetV1,
    });
  }

  function listPublishedArchives(input) {
    open();
    return Object.freeze(
      publicationSuccess
        .listFirstPublicationSuccesses(articleIdsOf(input), {
          allowLegacy: true,
        })
        .map(archiveFor),
    );
  }

  return Object.freeze({ listPublishedArchives });
}

module.exports = { createOperationalStorePublicationArchiveQuery };

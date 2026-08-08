"use strict";

const crypto = require("node:crypto");

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeName(value) {
  return (
    String(value || "article")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/^[. -]+|[. -]+$/g, "")
      .slice(0, 80) || "article"
  );
}

function createSubmissionBatchPlanner(options) {
  const value = options || {};
  if (!value.contentStore) throw fail("CONTENT_STORE_REQUIRED");
  if (!value.targetCatalog) throw fail("SUBMISSION_TARGET_CATALOG_REQUIRED");
  if (!value.preflight || typeof value.preflight.check !== "function")
    throw fail("SUBMISSION_PREFLIGHT_REQUIRED");
  if (typeof value.articleMarkdown !== "function")
    throw fail("SUBMISSION_ARTICLE_RENDERER_REQUIRED");

  function assertInput(input, confirmed) {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).some(
        (key) =>
          ![
            "clientId",
            "articleIds",
            "platformId",
            "accountProfileId",
            "confirmed",
          ].includes(key),
      ) ||
      typeof input.clientId !== "string" ||
      !input.clientId.trim() ||
      !Array.isArray(input.articleIds) ||
      !input.articleIds.length ||
      typeof input.platformId !== "string" ||
      !input.platformId.trim()
    )
      throw fail(
        "CONTENT_SUBMISSION_BATCH_INPUT_INVALID",
        "Batch selection is invalid",
      );
    if (confirmed && input.confirmed !== true)
      throw fail(
        "CONTENT_SUBMISSION_CONFIRMATION_REQUIRED",
        "Batch confirmation is required",
      );
    if (
      typeof input.accountProfileId !== "string" ||
      !input.accountProfileId.trim()
    )
      throw fail(
        "ACCOUNT_PROFILE_REQUIRED",
        "A platform account profile is required",
      );
    return input;
  }

  function item(article, platform, platformId, accountProfileId) {
    const markdown = value.articleMarkdown(article);
    const filename = filenameFor(article);
    return {
      articleId: article.id,
      targetPlatformId: platformId,
      accountProfileId,
      filename,
      contentHash: hash(markdown),
      markdown,
      status: "queueable",
    };
  }

  function filenameFor(article) {
    return safeName(article.title) + "-" + article.id + ".md";
  }

  function previewBatch(input) {
    const request = assertInput(input, false);
    const byId = new Map(
      value.targetCatalog
        .queueTargets()
        .map((platform) => [platform.id, platform]),
    );
    const items = [];
    const missingArticleIds = [];
    const unsupportedPlatformIds = [];
    const platform = byId.get(request.platformId);

    for (const articleId of request.articleIds) {
      let article;
      try {
        article = value.contentStore.getArticle(request.clientId, articleId);
      } catch (_) {
        missingArticleIds.push(articleId);
        continue;
      }
      if (!platform || platform.contentQueueImport !== true) {
        if (!unsupportedPlatformIds.includes(request.platformId))
          unsupportedPlatformIds.push(request.platformId);
        items.push({
          articleId,
          targetPlatformId: request.platformId,
          accountProfileId: request.accountProfileId.trim(),
          status: "excluded",
        });
        continue;
      }
      const eligibility = value.preflight.check(article, {
        id: request.platformId,
        contentQueueImport: true,
      });
      if (!eligibility.eligible) {
        items.push({
          articleId,
          targetPlatformId: request.platformId,
          accountProfileId: request.accountProfileId.trim(),
          status: "blocked",
          reasonCodes: eligibility.reasonCodes,
          reasons: eligibility.reasons,
        });
        continue;
      }
      items.push(
        item(
          article,
          platform,
          request.platformId,
          request.accountProfileId.trim(),
        ),
      );
    }

    return {
      clientId: request.clientId,
      articleIds: request.articleIds.slice(),
      platformId: request.platformId,
      accountProfileId: request.accountProfileId.trim(),
      totalTaskCount: request.articleIds.length,
      queueableTaskCount: items.filter(
        (candidate) => candidate.status === "queueable",
      ).length,
      idempotentCount: 0,
      alreadyQueuedCount: 0,
      blockedPublishedCount: 0,
      blockedUncertainCount: 0,
      blockedContentCount: items.filter(
        (candidate) => candidate.status === "blocked",
      ).length,
      conflictCount: 0,
      missingArticleIds,
      unsupportedPlatformIds,
      items,
    };
  }

  function listPlatforms() {
    return value.targetCatalog.list();
  }

  return Object.freeze({
    listPlatforms,
    previewBatch,
    assertInput,
    filenameFor,
  });
}

module.exports = { createSubmissionBatchPlanner };

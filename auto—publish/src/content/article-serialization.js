const { assertContentSegment, clone } = require("./content-identity");

const LEGACY_ARTICLE = Symbol("legacyArticle");

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertArticleSegment(value, label) {
  assertContentSegment(value, label, {
    code: "ARTICLE_PATH_OUT_OF_BOUNDS",
    error: function (code, message) {
      return storeError(code, message);
    },
  });
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw storeError("ARTICLE_INVALID", "Article " + label + " is invalid");
  }
}

function normalizeResearchQueryIds(article) {
  const hasResearchQueryIds = article.researchQueryIds !== undefined;
  const hasLegacyResearchQueryId = article.researchQueryId !== undefined;
  const hasResearchSnapshots = article.researchSnapshots !== undefined;
  const normalizedLegacy = article[LEGACY_ARTICLE] === true;
  const isRoundtrippedLegacy =
    hasResearchQueryIds &&
    hasLegacyResearchQueryId &&
    !hasResearchSnapshots &&
    Array.isArray(article.researchQueryIds) &&
    article.researchQueryIds.length === 1 &&
    article.researchQueryIds[0] === article.researchQueryId;
  if (!hasResearchQueryIds && !hasLegacyResearchQueryId && !hasResearchSnapshots) return { ids: undefined, legacy: false };
  if (!hasResearchQueryIds && hasResearchSnapshots) {
    throw storeError(
      "ARTICLE_INVALID",
      "Legacy article cannot contain research snapshots",
    );
  }
  if (
    hasResearchQueryIds &&
    hasLegacyResearchQueryId &&
    !normalizedLegacy &&
    !isRoundtrippedLegacy
  ) {
    throw storeError(
      "ARTICLE_INVALID",
      "Article mixes legacy and new research metadata",
    );
  }
  const legacy = hasLegacyResearchQueryId && (!hasResearchQueryIds || normalizedLegacy || isRoundtrippedLegacy);
  const ids = legacy ? [article.researchQueryId] : article.researchQueryIds;
  if (
    legacy &&
    hasResearchQueryIds &&
    (!Array.isArray(article.researchQueryIds) ||
      article.researchQueryIds.length !== 1 ||
      article.researchQueryIds[0] !== article.researchQueryId)
  ) {
    throw storeError(
      "ARTICLE_INVALID",
      "Legacy article research ids are inconsistent",
    );
  }
  if (legacy && hasResearchSnapshots) {
    throw storeError(
      "ARTICLE_INVALID",
      "Legacy article cannot contain research snapshots",
    );
  }
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50) {
    throw storeError(
      "ARTICLE_INVALID",
      "Article research query ids are invalid",
    );
  }
  const seen = new Set();
  ids.forEach(function (id) {
    if (typeof id !== "string" || !id.trim() || seen.has(id)) {
      throw storeError(
        "ARTICLE_INVALID",
        "Article research query ids are invalid",
      );
    }
    seen.add(id);
  });
  return { ids: ids.slice(), legacy: legacy };
}

function normalizeResearchSnapshots(snapshots, ids) {
  if (!Array.isArray(snapshots) || snapshots.length !== ids.length) {
    throw storeError(
      "ARTICLE_INVALID",
      "Article research snapshots do not match query ids",
    );
  }
  return snapshots.map(function (snapshot, index) {
    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      Array.isArray(snapshot) ||
      snapshot.questionId !== ids[index] ||
      typeof snapshot.question !== "string" ||
      !snapshot.question.trim() ||
      typeof snapshot.answerText !== "string" ||
      !snapshot.answerText.trim() ||
      !Array.isArray(snapshot.references) ||
      typeof snapshot.collectedAt !== "string" ||
      !snapshot.collectedAt.trim() ||
      typeof snapshot.collectionMethod !== "string" ||
      !snapshot.collectionMethod.trim()
    ) {
      throw storeError(
        "ARTICLE_INVALID",
        "Article research snapshot is invalid",
      );
    }
    return {
      questionId: snapshot.questionId,
      question: snapshot.question,
      answerText: snapshot.answerText,
      references: snapshot.references.map(function (reference) {
        if (
          !reference ||
          typeof reference.title !== "string" ||
          !reference.title.trim() ||
          typeof reference.url !== "string" ||
          !reference.url.trim()
        ) {
          throw storeError(
            "ARTICLE_INVALID",
            "Article research snapshot reference is invalid",
          );
        }
        const value = { title: reference.title, url: reference.url };
        if (Object.prototype.hasOwnProperty.call(reference, "snippet"))
          value.snippet = reference.snippet;
        return value;
      }),
      collectedAt: snapshot.collectedAt,
      collectionMethod: snapshot.collectionMethod,
    };
  });
}

function normalizeMaterialSnapshots(snapshots) {
  if (snapshots === undefined) return undefined;
  if (!Array.isArray(snapshots) || snapshots.length < 1) {
    throw storeError(
      "ARTICLE_INVALID",
      "Article material snapshots are invalid",
    );
  }
  return snapshots.map(function (snapshot) {
    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      Array.isArray(snapshot) ||
      typeof snapshot.id !== "string" ||
      !snapshot.id.trim() ||
      typeof snapshot.name !== "string" ||
      !snapshot.name.trim() ||
      typeof snapshot.extension !== "string" ||
      !snapshot.extension.trim() ||
      typeof snapshot.content !== "string" ||
      !snapshot.content.trim() ||
      typeof snapshot.contentHash !== "string" ||
      !snapshot.contentHash.trim() ||
      typeof snapshot.source !== "string" ||
      !snapshot.source.trim()
    ) {
      throw storeError(
        "ARTICLE_INVALID",
        "Article material snapshot is invalid",
      );
    }
    return {
      id: snapshot.id,
      name: snapshot.name,
      extension: snapshot.extension,
      content: snapshot.content,
      contentHash: snapshot.contentHash,
      source: snapshot.source,
    };
  });
}

function normalizeTemplateSnapshot(snapshot) {
  if (snapshot === undefined) return undefined;
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot) ||
    typeof snapshot.platform !== "string" ||
    !snapshot.platform.trim() ||
    typeof snapshot.id !== "string" ||
    !snapshot.id.trim() ||
    typeof snapshot.name !== "string" ||
    !snapshot.name.trim() ||
    typeof snapshot.scenario !== "string" ||
    !snapshot.scenario.trim() ||
    typeof snapshot.body !== "string" ||
    !snapshot.body.trim() ||
    typeof snapshot.bodyHash !== "string" ||
    !snapshot.bodyHash.trim()
  ) {
    throw storeError("ARTICLE_INVALID", "Article template snapshot is invalid");
  }
  return {
    platform: snapshot.platform,
    id: snapshot.id,
    name: snapshot.name,
    scenario: snapshot.scenario,
    body: snapshot.body,
    bodyHash: snapshot.bodyHash,
  };
}

function normalizeOptionalProvenance(value, label) {
  if (value === undefined) return undefined;
  if (
    value !== null &&
    (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value))
  ) {
    throw storeError("ARTICLE_INVALID", "Article " + label + " is invalid");
  }
  return value;
}

function normalizeArticle(article) {
  if (!article || typeof article !== "object" || Array.isArray(article)) {
    throw storeError("ARTICLE_INVALID", "Article is invalid");
  }
  assertArticleSegment(article.id, "id");
  assertArticleSegment(article.clientId, "client id");
  const researchIds = normalizeResearchQueryIds(article);
  [
    "title",
    "content",
    "status",
    "createdAt",
  ].forEach(function (field) {
    assertNonEmptyString(article[field], field);
  });
  if (Number.isNaN(Date.parse(article.createdAt)))
    throw storeError("ARTICLE_INVALID", "Article createdAt is invalid");
  if (article.status !== "generated" && article.status !== "saved")
    throw storeError("ARTICLE_INVALID", "Article status is invalid");
  ["platform", "scenario", "templateId"].forEach(function (field) { if (article[field] !== undefined) assertNonEmptyString(article[field], field); });
  if (article.updatedAt !== undefined)
    assertNonEmptyString(article.updatedAt, "updatedAt");
  if (article.source !== undefined) {
    if (
      !article.source ||
      typeof article.source !== "object" ||
      Array.isArray(article.source)
    )
      throw storeError("ARTICLE_INVALID", "Article source is invalid");
    ["client_material", "doubao_answer", "references", "template"].forEach(
      function (field) {
        if (typeof article.source[field] !== "boolean")
          throw storeError("ARTICLE_INVALID", "Article source is invalid");
      },
    );
  }

  const normalized = Object.assign({}, article);
  ["platform", "scenario", "templateId"].forEach(function (field) {
    if (normalized[field] === undefined) delete normalized[field];
  });
  if (article.source === undefined) delete normalized.source;
  else normalized.source = Object.assign({}, article.source);
  if (researchIds.ids === undefined) {
    delete normalized.researchQueryIds;
    delete normalized.researchQueryId;
    delete normalized.researchSnapshots;
  } else {
    normalized.researchQueryIds = researchIds.ids;
  }
  const materialSnapshots = normalizeMaterialSnapshots(
    article.materialSnapshots,
  );
  const templateSnapshot = normalizeTemplateSnapshot(article.templateSnapshot);
  const generationBatchId = normalizeOptionalProvenance(
    article.generationBatchId,
    "generationBatchId",
  );
  const generationTaskId = normalizeOptionalProvenance(
    article.generationTaskId,
    "generationTaskId",
  );
  if (materialSnapshots !== undefined)
    normalized.materialSnapshots = materialSnapshots;
  if (templateSnapshot !== undefined)
    normalized.templateSnapshot = templateSnapshot;
  if (generationBatchId !== undefined)
    normalized.generationBatchId = generationBatchId;
  if (generationTaskId !== undefined)
    normalized.generationTaskId = generationTaskId;
  // Historical article metadata is accepted only at the file boundary and
  // never enters the current article model or persistence payload.
  ["reviewedAt", "sourceArticleId", "version"].forEach(function (field) {
    delete normalized[field];
  });
  if (researchIds.legacy) {
    assertNonEmptyString(article.researchQueryId, "researchQueryId");
    Object.defineProperty(normalized, LEGACY_ARTICLE, {
      value: true,
      enumerable: false,
    });
  } else if (researchIds.ids !== undefined) {
    normalized.researchSnapshots = normalizeResearchSnapshots(
      article.researchSnapshots,
      researchIds.ids,
    );
  }
  return normalized;
}

function articleForPersistence(article) {
  const persisted = clone(article);
  ["reviewedAt", "sourceArticleId", "version"].forEach(function (field) {
    delete persisted[field];
  });
  if (article && article[LEGACY_ARTICLE]) {
    delete persisted.researchQueryIds;
    delete persisted.researchSnapshots;
  }
  return persisted;
}

function markdownFor(article) {
  return (
    "---\ntitle: " +
    JSON.stringify(article.title) +
    "\n---\n\n" +
    article.content +
    "\n"
  );
}

function parseMarkdown(markdown) {
  const value = String(markdown).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const match = /^---\r?\ntitle: (.+)\r?\n---\r?\n\r?\n([\s\S]*)$/.exec(value);
  if (!match)
    throw storeError("ARTICLE_INVALID", "Article markdown is invalid");
  let title;
  try {
    title = JSON.parse(match[1]);
  } catch (_) {
    throw storeError("ARTICLE_INVALID", "Article markdown is invalid");
  }
  const content = match[2].endsWith("\n") ? match[2].slice(0, -1) : match[2];
  if (typeof title !== "string" || typeof content !== "string")
    throw storeError("ARTICLE_INVALID", "Article markdown is invalid");
  return { title: title, content: content };
}

function assertTombstone(tombstone, clientId, articleId) {
  const allowedFields = [
    "version",
    "deletedAt",
    "clientId",
    "articleId",
    "status",
    "references",
    "titleSnapshot",
    "contentFingerprint",
    "operationId",
    "permanentlyDeleted",
    "purgedAt",
  ];
  if (
    !tombstone ||
    typeof tombstone !== "object" ||
    Array.isArray(tombstone) ||
    Object.keys(tombstone).some(function (field) {
      return !allowedFields.includes(field);
    }) ||
    tombstone.version !== 1 ||
    typeof tombstone.deletedAt !== "string" ||
    Number.isNaN(Date.parse(tombstone.deletedAt)) ||
    tombstone.clientId !== clientId ||
    tombstone.articleId !== articleId ||
    (tombstone.contentFingerprint !== undefined &&
      (typeof tombstone.contentFingerprint !== "string" ||
        !/^[a-f0-9]{64}$/.test(tombstone.contentFingerprint))) ||
    (tombstone.operationId !== undefined &&
      (typeof tombstone.operationId !== "string" ||
        !/^[A-Za-z0-9:_-]{1,200}$/.test(tombstone.operationId))) ||
    (tombstone.status !== "generated" && tombstone.status !== "saved") ||
    !Array.isArray(tombstone.references) ||
    (tombstone.permanentlyDeleted === true &&
      (typeof tombstone.purgedAt !== "string" ||
        Number.isNaN(Date.parse(tombstone.purgedAt)))) ||
    (tombstone.permanentlyDeleted !== undefined &&
      tombstone.permanentlyDeleted !== true) ||
    (tombstone.purgedAt !== undefined &&
      tombstone.permanentlyDeleted !== true) ||
    (tombstone.titleSnapshot !== undefined &&
      tombstone.titleSnapshot !== null &&
      (typeof tombstone.titleSnapshot !== "string" ||
        !tombstone.titleSnapshot.trim() ||
        tombstone.titleSnapshot.length > 200))
  ) {
    throw storeError("ARTICLE_INVALID", "Article tombstone is invalid");
  }
  tombstone.references.forEach(function (reference) {
    if (
      !reference ||
      typeof reference !== "object" ||
      typeof reference.type !== "string" ||
      !reference.type.trim() ||
      typeof reference.id !== "string" ||
      !reference.id.trim() ||
      reference.id.includes("/") ||
      reference.id.includes("\\")
    ) {
      throw storeError(
        "ARTICLE_INVALID",
        "Article tombstone reference is invalid",
      );
    }
  });
  return tombstone;
}

function titleSnapshot(article) {
  return typeof article.title === "string" && article.title.trim()
    ? article.title.trim().slice(0, 200)
    : null;
}

module.exports = {
  LEGACY_ARTICLE,
  normalizeArticle,
  articleForPersistence,
  markdownFor,
  parseMarkdown,
  assertTombstone,
  titleSnapshot,
  storeError,
};

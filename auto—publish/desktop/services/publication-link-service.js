"use strict";

const domain = require("../../src/domain");

function publicationLinkError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalizePublicationId(value) {
  try {
    return domain.PublicationId.serialize(domain.PublicationId.parse(value));
  } catch (_) {
    throw publicationLinkError("PUBLICATION_LINK_INPUT_INVALID");
  }
}

function latestStoredUrl(record) {
  const candidates = [];
  if (record && typeof record.remoteUrl === "string")
    candidates.push(record.remoteUrl);
  const attempts = Array.isArray(record && record.attempts)
    ? record.attempts
    : [];
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index];
    if (attempt && typeof attempt.remoteUrl === "string")
      candidates.push(attempt.remoteUrl);
  }
  for (const candidate of candidates) {
    const normalized = domain.normalizePublishedArticleUrl(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function createPublicationLinkService(options) {
  const values = options || {};
  const operationalStore = values.operationalStore;
  const openExternal =
    typeof values.openExternal === "function" ? values.openExternal : null;

  async function openPublicationUrl(input) {
    const publicationId = normalizePublicationId(input && input.publicationId);
    if (
      !operationalStore ||
      typeof operationalStore.listPublicationRecords !== "function"
    )
      throw publicationLinkError("PUBLICATION_LINK_OPEN_FAILED");
    const records = operationalStore.listPublicationRecords({
      publicationIds: [publicationId],
    });
    const record = Array.isArray(records)
      ? records.find((item) => item && item.publicationId === publicationId)
      : null;
    if (!record) throw publicationLinkError("PUBLICATION_LINK_NOT_FOUND");
    const url = latestStoredUrl(record);
    if (!url)
      throw publicationLinkError("PUBLICATION_LINK_URL_UNAVAILABLE");
    if (!openExternal)
      throw publicationLinkError("PUBLICATION_LINK_OPEN_FAILED");
    try {
      await openExternal(url);
    } catch (_) {
      throw publicationLinkError("PUBLICATION_LINK_OPEN_FAILED");
    }
    return Object.freeze({ completed: true });
  }

  return Object.freeze({ openPublicationUrl });
}

module.exports = { createPublicationLinkService };

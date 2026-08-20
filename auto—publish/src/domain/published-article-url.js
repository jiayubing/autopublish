"use strict";

const SENSITIVE_QUERY_NAME =
  /^(?:access_token|api[_-]?key|apikey|auth(?:orization)?|cookie|password|refresh_token|secret|session(?:id)?|token)$/iu;

function normalizePublishedArticleUrl(value) {
  if (typeof value !== "string" || !value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash)
      return null;
    for (const name of url.searchParams.keys())
      if (SENSITIVE_QUERY_NAME.test(name)) return null;
    return url.href;
  } catch (_) {
    return null;
  }
}

module.exports = { normalizePublishedArticleUrl };

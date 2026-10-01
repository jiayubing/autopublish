"use strict";

// Migrated only the quote normalization/binding functions from the frozen
// Knowledge experiment. No synthesis, merge or Knowledge persistence.
const { safeUrl } = require("./geo-knowledge-schema");

function normalizeEvidenceQuote(value) {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[“”„‟]/gu, '"')
    .replace(/[‘’‛]/gu, "'")
    .replace(/\s+/gu, " ")
    .replace(/(?<=[\u3400-\u9fff]) (?=[\u3400-\u9fff])/gu, "")
    .replace(/\s*([，。；：、！？（）《》])\s*/gu, "$1")
    .trim();
}

function bindEvidenceQuotes(quotes, citations) {
  return quotes.map((quote) => {
    const normalized = normalizeEvidenceQuote(quote);
    const matches = normalized
      ? citations.filter(
          (c) =>
            typeof c.summary === "string" &&
            safeUrl(c.url) &&
            normalizeEvidenceQuote(c.summary).includes(normalized),
        )
      : [];
    return {
      quote,
      result:
        matches.length === 1
          ? "unique_match"
          : matches.length
            ? "ambiguous"
            : "unmatched",
      citation: matches.length === 1 ? matches[0] : null,
    };
  });
}

module.exports = { normalizeEvidenceQuote, bindEvidenceQuotes };

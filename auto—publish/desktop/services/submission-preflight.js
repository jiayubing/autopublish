"use strict";

const {
  evaluateArticleSubmissionEligibility,
} = require("../../src/content/article-submission-eligibility");

// This port owns only the answer to “can this article enter a queue?”. It has
// no persistence, filesystem, renderer, or remote-publishing dependency.
function createSubmissionPreflight() {
  function check(article, targetPlatform) {
    return evaluateArticleSubmissionEligibility(article, {
      targetPlatform,
    });
  }

  return Object.freeze({ check });
}

module.exports = { createSubmissionPreflight };

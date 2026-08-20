"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { projectRegularPublicationFailure } = require("../src/domain");

test("publication failure projection preserves safe codes and uses a controlled fallback summary", () => {
  assert.deepEqual(projectRegularPublicationFailure("CONTENT_REJECTED"), {
    reasonCode: "CONTENT_REJECTED",
    reasonSummary: "平台明确拒绝了这篇文章，请检查内容后从投稿入口重新发起。",
  });
  assert.deepEqual(projectRegularPublicationFailure("PLATFORM_VENDOR_42"), {
    reasonCode: "PLATFORM_VENDOR_42",
    reasonSummary: "投稿未被平台接受，请检查投稿信息后从统一投稿入口重新发起。",
  });
  assert.deepEqual(projectRegularPublicationFailure("unsafe\nprovider body"), {
    reasonCode: "PUBLICATION_FAILURE_UNKNOWN",
    reasonSummary: "投稿未被平台接受，请检查投稿信息后从统一投稿入口重新发起。",
  });
});

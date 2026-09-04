"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createPaidMediaPreflightService,
} = require("../desktop/services/paid-media-preflight-service");

test("paid media preflight does not require a favorites pool", async () => {
  let resourceQueryCount = 0;
  const service = createPaidMediaPreflightService({
    contentStore: {
      getArticle() {
        return null;
      },
    },
    paidAdmission: {
      admitPaidBatch() {
        throw new Error("admission should not run during preflight");
      },
    },
    queryResource(resourceId) {
      resourceQueryCount += 1;
      return {
        resourceId,
        name: "测试媒体",
        price: 100,
        available: true,
      };
    },
    clientSnapshotResolver() {
      throw new Error("customer snapshot should not run during preflight");
    },
    systemSubmissionCode: "system-code-1",
    clock: () => "2026-09-04T00:00:00.000Z",
  });

  const result = await service.preflight({
    articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
    mediaResourceId: "media-1",
  });

  assert.equal(resourceQueryCount, 1);
  assert.equal(result.mediaResourceId, "media-1");
  assert.equal(result.quotedPrice, 100);
  assert.equal(result.canConfirm, false);
  assert.ok(result.blockers.includes("PAID_MEDIA_ARTICLE_NOT_FOUND"));
});

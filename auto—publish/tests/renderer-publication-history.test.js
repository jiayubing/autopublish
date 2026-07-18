const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function record(status, overrides) {
  return Object.assign({
    publicationId: `publication-${status}`,
    clientId: "c1",
    articleId: "a1",
    articleKey: "generated:c1:a1",
    targetKey: `platform:${status}`,
    platformId: status,
    mediaResourceId: null,
    displayName: status,
    status,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    attempts: [],
    attemptId: null,
    remoteId: null,
    remoteUrl: null,
    errorCode: null,
    reasonCode: null,
  }, overrides || {});
}

describe("publication history renderer boundary", async function() {
  const status = await import("../media-workbench/src/publication-status.js");

  it("keeps no publication separate from the article review status", function() {
    assert.equal(status.summarizePublicationRecords([]).status, "not_submitted");
    assert.equal(status.summarizePublicationRecords([]).label, "未投稿");
    assert.equal(status.summarizePublicationRecords([record("queued")]).label, "已入队");
  });

  it("summarizes independent targets without hiding partial or uncertain results", function() {
    assert.equal(status.summarizePublicationRecords([record("published"), record("queued")]).status, "partial");
    assert.equal(status.summarizePublicationRecords([record("published"), record("uncertain")]).status, "uncertain");
    assert.equal(status.summarizePublicationRecords([record("failed")]).status, "failed");
    assert.equal(status.summarizePublicationRecords([record("submitted")]).status, "reviewing");
    assert.equal(status.publicationSummaryMatchesFilter(status.summarizePublicationRecords([record("published")]), "published"), true);
  });

  it("keeps the history detail target-oriented and visibly blocks uncertain direct retry", function() {
    const drawer = fs.readFileSync(path.resolve(__dirname, "..", "media-workbench/src/components/content/PublicationHistoryDrawer.tsx"), "utf8");
    const view = fs.readFileSync(path.resolve(__dirname, "..", "media-workbench/src/components/content/GeneratedArticlesView.tsx"), "utf8");
    const api = fs.readFileSync(path.resolve(__dirname, "..", "media-workbench/src/electron-api.ts"), "utf8");
    assert.match(drawer, /远端 URL/);
    assert.match(drawer, /订单号\/远端 ID/);
    assert.match(drawer, /安全错误码/);
    assert.match(drawer, /待确认/);
    assert.match(drawer, /不提供直接重试/);
    assert.match(drawer, /复制为新版本/);
    assert.match(drawer, /确认已发布/);
    assert.match(drawer, /确认未发布/);
    assert.match(api, /listPublicationHistory/);
    assert.match(api, /copyContentArticleVersion/);
    assert.match(api, /reconcilePublicationHistory/);
    assert.match(view, /PublicationHistoryDrawer/);
    assert.match(view, /listPublicationHistory\(clientId/);
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const tsxLoader = pathToFileURL(path.join(root, "media-workbench", "node_modules", "tsx", "dist", "loader.mjs")).href;

function runStatusModule(source) {
  return JSON.parse(execFileSync(process.execPath, ["--import", tsxLoader, "--input-type=module", "-e", source], { cwd: root, encoding: "utf8" }));
}

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
  const status = runStatusModule(`
    import { summarizePublicationRecords, publicationSummaryMatchesFilter } from './media-workbench/src/publication-status.ts';
    const record = (status) => ({ status, attempts: [], createdAt: '2026-07-18T00:00:00.000Z', updatedAt: '2026-07-18T00:00:00.000Z' });
    const summary = (records) => summarizePublicationRecords(records);
    console.log(JSON.stringify({
      empty: summary([]),
      queued: summary([record('queued')]),
      partial: summary([record('published'), record('queued')]),
      uncertain: summary([record('published'), record('uncertain')]),
      failed: summary([record('failed')]),
      reviewing: summary([record('submitted')]),
      matches: publicationSummaryMatchesFilter(summary([record('published')]), 'published')
    }));
  `);

  it("keeps no publication separate from the article review status", function() {
    assert.equal(status.empty.status, "not_submitted");
    assert.equal(status.empty.label, "未投稿");
    assert.equal(status.queued.label, "已入队");
  });

  it("summarizes independent targets without hiding partial or uncertain results", function() {
    assert.equal(status.partial.status, "partial");
    assert.equal(status.uncertain.status, "uncertain");
    assert.equal(status.failed.status, "failed");
    assert.equal(status.reviewing.status, "reviewing");
    assert.equal(status.matches, true);
  });

  it("keeps the history detail target-oriented and visibly blocks uncertain direct retry", function() {
    const drawer = fs.readFileSync(path.resolve(__dirname, "..", "media-workbench/src/components/content/PublicationHistoryDrawer.tsx"), "utf8");
    const view = fs.readFileSync(path.resolve(__dirname, "..", "media-workbench/src/components/content/GeneratedArticlesView.tsx"), "utf8");
    const api = fs.readFileSync(path.resolve(__dirname, "..", "media-workbench/src/bridge/publication.ts"), "utf8");
    const contentApi = fs.readFileSync(path.resolve(__dirname, "..", "media-workbench/src/bridge/content.ts"), "utf8");
    assert.match(drawer, /远端 URL/);
    assert.match(drawer, /订单号\/远端 ID/);
    assert.match(drawer, /安全错误码/);
    assert.match(drawer, /待确认/);
    assert.match(drawer, /不提供直接重试/);
    assert.match(drawer, /复制为新版本/);
    assert.match(drawer, /确认已发布/);
    assert.match(drawer, /确认未发布/);
    assert.match(api, /listPublicationHistory/);
    assert.match(contentApi, /copyContentArticleVersion/);
    assert.match(api, /reconcilePublicationHistory/);
    assert.match(view, /PublicationHistoryDrawer/);
    assert.match(view, /getArticleManagementSnapshot/);
  });
});

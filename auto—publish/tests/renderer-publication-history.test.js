const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const tsxLoader = pathToFileURL(
  path.join(
    root,
    "media-workbench",
    "node_modules",
    "tsx",
    "dist",
    "loader.mjs",
  ),
).href;

function runStatusModule(source) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--import", tsxLoader, "--input-type=module", "-e", source],
      { cwd: root, encoding: "utf8" },
    ),
  );
}

function record(status, overrides) {
  return Object.assign(
    {
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
    },
    overrides || {},
  );
}

describe("publication history renderer boundary", async function () {
  const status = runStatusModule(`
    import { summarizePublicationRecords, publicationRecordStatusLabel, publicationSummaryMatchesFilter } from './media-workbench/src/publication-status.ts';
    const record = (status, overrides = {}) => ({ status, targetKey: 'platform:fixture', mediaResourceId: null, platformId: 'fixture', attempts: [], createdAt: '2026-07-18T00:00:00.000Z', updatedAt: '2026-07-18T00:00:00.000Z', ...overrides });
    const summary = (records) => summarizePublicationRecords(records);
    console.log(JSON.stringify({
      empty: summary([]),
      queued: summary([record('queued')]),
      partial: summary([record('published'), record('queued')]),
      uncertain: summary([record('published'), record('uncertain')]),
      failed: summary([record('failed')]),
      ordinarySubmitted: summary([record('submitted')]),
      mediaSubmitted: summary([record('submitted', { targetKey: 'media-resource:fixture', mediaResourceId: 'resource-1', platformId: 'media' })]),
      ordinarySubmittedLabel: publicationRecordStatusLabel('submitted', record('submitted')),
      mediaSubmittedLabel: publicationRecordStatusLabel('submitted', record('submitted', { mediaResourceId: 'resource-1', platformId: 'media' })),
      matches: publicationSummaryMatchesFilter(summary([record('published')]), 'published')
    }));
  `);

  it("keeps no publication separate from the publication lifecycle summary", function () {
    assert.equal(status.empty.status, "not_submitted");
    assert.equal(status.empty.label, "未投稿");
    assert.equal(status.queued.label, "已入队");
  });

  it("summarizes independent targets without hiding partial or uncertain results", function () {
    assert.equal(status.partial.status, "partial");
    assert.equal(status.uncertain.status, "uncertain");
    assert.equal(status.failed.status, "failed");
    assert.equal(status.ordinarySubmitted.status, "manual_check");
    assert.equal(status.ordinarySubmitted.label, "人工核对");
    assert.equal(status.mediaSubmitted.status, "manual_check");
    assert.equal(status.mediaSubmitted.label, "人工核对");
    assert.equal(status.ordinarySubmittedLabel, "人工核对");
    assert.equal(status.mediaSubmittedLabel, "人工核对");
    assert.equal(status.matches, true);
  });

  it("keeps the history detail target-oriented and visibly blocks uncertain direct retry", function () {
    const drawer = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "media-workbench/src/components/content/PublicationHistoryDrawer.tsx",
      ),
      "utf8",
    );
    const view = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "media-workbench/src/components/content/GeneratedArticlesView.tsx",
      ),
      "utf8",
    );
    const editor = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "media-workbench/src/components/content/GeneratedArticleEditorPanel.tsx",
      ),
      "utf8",
    );
    const workbench = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "media-workbench/src/components/ContentWorkbench.tsx",
      ),
      "utf8",
    );
    assert.match(drawer, /远端 URL/);
    assert.match(drawer, /订单号\/远端 ID/);
    assert.match(drawer, /evidence\?\.orderNumber/);
    assert.match(drawer, /安全错误码/);
    assert.match(drawer, /待确认/);
    assert.match(drawer, /不提供直接重试/);
    assert.doesNotMatch(drawer, /复制为新版本|onCopyVersion/);
    assert.doesNotMatch(editor, /复制为新版本|onCopyVersion/);
    assert.doesNotMatch(
      workbench,
      /复制文章新版本|copyArticleVersion|onCopyVersion/,
    );
    assert.match(drawer, /确认已发布/);
    assert.match(drawer, /确认未发布/);
    assert.match(view, /PublicationHistoryDrawer/);
    assert.match(view, /management: ArticleManagementReadModel/);
    assert.doesNotMatch(
      view,
      /getArticleManagementSnapshot|bridge\/publication|bridge\/content/,
    );
    assert.doesNotMatch(view, /commands\.copyArticleVersion|onCopyVersion/);
    assert.match(view, /commands\.prepareRegularUncertainResolution/);
    assert.match(view, /commands\.confirmRegularAccepted/);
    assert.match(view, /commands\.confirmRegularNotAccepted/);
    assert.doesNotMatch(view, /commands\.reconcilePublication/);
    assert.match(view, /await confirm\(\{\s*title: label/);
    assert.match(
      view,
      /summary=\{\s*drawerArticle\s*\? workflowByArticle\.get\(drawerArticle\.id\)\?\.publicationSummary/,
    );
    assert.doesNotMatch(view, /publicationSummaries/);
    assert.doesNotMatch(view, /\|\| 'pending_submission'/);
    assert.doesNotMatch(drawer, /summarizePublicationRecords/);
    assert.doesNotMatch(drawer, /审核状态与投稿状态分开维护/);
  });
});

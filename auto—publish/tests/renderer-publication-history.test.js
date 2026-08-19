const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
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

function renderPresentation() {
  return runStatusModule(`
    import React from './media-workbench/node_modules/react/index.js';
    import { renderToStaticMarkup } from './media-workbench/node_modules/react-dom/server.js';
    import PublicationHistoryDrawer from './media-workbench/src/components/content/PublicationHistoryDrawer.tsx';
    import ResourceLibrary from './media-workbench/src/components/ResourceLibrary.tsx';
    import OrdersView from './media-workbench/src/components/OrdersView.tsx';
    const noop = async () => undefined;
    const record = {
      publicationId: 'publication-uncertain', clientId: 'c1', articleId: 'a1',
      articleKey: 'generated:c1:a1', targetKey: 'platform:toutiao',
      platformId: 'toutiao', mediaResourceId: null, displayName: '头条主账号',
      status: 'uncertain', createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:01:00.000Z', attempts: [], attemptId: 'attempt-1',
      remoteId: 'remote-1', remoteUrl: 'https://example.test/article/1',
      errorCode: 'PLATFORM_RESULT_UNCERTAIN', reasonCode: null,
    };
    const publication = renderToStaticMarkup(React.createElement(PublicationHistoryDrawer, {
      article: { id: 'a1', title: '待核对文章' }, records: [record],
      summary: { status: 'uncertain', label: '待确认', records: 1, published: 0, uncertain: true },
      onClose() {}, onOpenAttention() {}, onOpenPublicationUrl() {}, publicationUrlBusy: true,
    }));
    const resources = renderToStaticMarkup(React.createElement(ResourceLibrary, {
      resources: [{ resourceId: 'resource-1', name: '中央媒体资源', type: 'image', price: 120 }],
      selectedResourceIds: [], poolResourceIds: [], mode: 'management', activeArticleLabel: '',
      onPickResource() {}, onTogglePool() {}, onRefreshResources() {},
      totalResources: 51, resourcePage: 1, resourcePageSize: 50,
      resourceSearch: '', onResourceSearch() {}, onResourcePageChange() {},
    }));
    const orderActions = {
      snapshot: {
        openingOrderNid: null,
        cancellationPreparations: {},
        cancellationResolutions: {},
        busy: false,
      },
      intents: {
        openPublishedUrl: noop,
        prepareCancellation: noop,
        cancel: noop,
        prepareCancellationResolution: noop,
        resolveCancellation: noop,
      },
    };
    const orders = renderToStaticMarkup(React.createElement(OrdersView, {
      orders: [{ orderNid: 'order-1', title: '待核对订单', resourceName: '中央媒体资源', statusCode: '0', createdAt: '2026-08-08T00:00:00.000Z', anomaly: {} }],
      onSyncOrder: noop, onSyncAllOrders: noop, onPrepareAnomaly: noop,
      onResolveAnomaly: noop, orderActions,
      anomalyPreparations: { 'order-1': { classification: 'inconclusive', allowedActions: [] } },
    }));
    console.log(JSON.stringify({ publication, resources, orders }));
  `);
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
      publishedWithFailedHistory: summary([record('failed'), record('published')]),
      uncertain: summary([record('published'), record('uncertain')]),
      failed: summary([record('failed')]),
      ordinarySubmitted: summary([record('submitted')]),
      mediaSubmitted: summary([record('submitted', { targetKey: 'media-resource:fixture', mediaResourceId: 'resource-1', platformId: 'media' })]),
      ordinarySubmittedLabel: publicationRecordStatusLabel('submitted', record('submitted')),
      mediaSubmittedLabel: publicationRecordStatusLabel('submitted', record('submitted', { mediaResourceId: 'resource-1', platformId: 'media' })),
      matches: publicationSummaryMatchesFilter(summary([record('published')]), 'published')
    }));
  `);
  const presentation = renderPresentation();

  it("keeps no publication separate from the publication lifecycle summary", function () {
    assert.equal(status.empty.status, "not_submitted");
    assert.equal(status.empty.label, "未投稿");
    assert.equal(status.queued.label, "已入队");
  });

  it("summarizes independent targets without hiding partial or uncertain results", function () {
    assert.equal(status.partial.status, "partial");
    assert.equal(status.publishedWithFailedHistory.status, "published");
    assert.equal(status.publishedWithFailedHistory.label, "已发布 · 含失败历史");
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

  it("renders target evidence and blocks direct retry while uncertain resolution is busy", function () {
    assert.match(presentation.publication, /待核对文章/);
    assert.match(presentation.publication, /头条主账号/);
    assert.match(presentation.publication, /发布链接/);
    assert.match(presentation.publication, /订单号\/远端 ID/);
    assert.match(presentation.publication, /PLATFORM_RESULT_UNCERTAIN/);
    assert.match(presentation.publication, /不在这里执行人工确认或直接重试/);
    assert.match(presentation.publication, /前往需处理事项/);
    assert.doesNotMatch(presentation.publication, /确认已发布/);
    assert.doesNotMatch(presentation.publication, /确认未发布/);
  });

  it("renders paged media and durable order actions from public read models", function () {
    assert.match(presentation.resources, /媒体资源/);
    assert.match(presentation.resources, /中央媒体资源/);
    assert.match(presentation.resources, /搜索资源名称/);
    assert.match(presentation.resources, /刷新库/);
    assert.match(
      presentation.resources,
      /第 <b>1<\/b> \/ <b>2<\/b> 页 \(共 51 项\)/,
    );
    assert.match(presentation.orders, /待核对订单/);
    assert.match(presentation.orders, /重新核对可用证据/);
    assert.doesNotMatch(presentation.orders, /清空记录/);
  });
});

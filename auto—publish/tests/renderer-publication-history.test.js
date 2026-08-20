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

function renderPublicationArchiveFixtures() {
  return runStatusModule(`
    import React from './media-workbench/node_modules/react/index.js';
    import { renderToStaticMarkup } from './media-workbench/node_modules/react-dom/server.js';
    import PublicationHistoryDrawer from './media-workbench/src/components/content/PublicationHistoryDrawer.tsx';
    const article = { id: 'a1', title: '发布档案夹具文章' };
    const evidence = (overrides = {}) => ({
      version: 2,
      articleIdentityV1: { version: 1, clientId: 'c1', articleId: 'a1' },
      customerSnapshotV1: { version: 1, clientId: 'c1', displayName: '测试客户' },
      contentAvailable: true,
      title: '发布档案夹具文章',
      body: '安全投稿正文',
      contentFingerprint: 'content-fingerprint',
      targetSnapshotV1: { version: 1, kind: 'platform', platformId: 'fixture', platformName: '测试平台', accountProfileId: 'account-1', accountLabel: '测试账号' },
      resultCode: 'REGULAR_ACCEPTED',
      submittedAt: '2026-08-20T00:00:00.000Z',
      submittedAtSource: 'regular_remote_call_started',
      firstPublishedAt: '2026-08-20T00:01:00.000Z',
      firstPublishedAtSource: 'first_positive_observation_time',
      imageSummaryV1: null,
      orderNumber: null,
      remoteId: null,
      remoteUrl: null,
      missingReasons: [],
      safeEvidenceRefs: [],
      ...overrides,
    });
    const record = (publicationId, overrides = {}) => ({
      publicationId, clientId: 'c1', articleId: 'a1', targetKey: 'platform:fixture:account:account-1', platformId: 'fixture', mediaResourceId: null,
      displayName: '测试平台', status: 'published', createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T00:01:00.000Z', attempts: [],
      attemptId: 'attempt-1', remoteId: null, remoteUrl: null, errorCode: null, reasonCode: null, reasonSummary: null, ...overrides,
    });
    const archive = (publicationId, publicationEvidence, publicationLocator) => ({ publicationId, attemptId: 'attempt-1', publicationEvidence, publicationLocator });
    const render = (records, archives = []) => renderToStaticMarkup(React.createElement(PublicationHistoryDrawer, {
      article, records, archives, summary: { status: records[0].status, label: records[0].status === 'failed' ? '失败' : '已发布', records: 1, published: records[0].status === 'published' ? 1 : 0, uncertain: false },
      onClose() {}, onOpenPublicationUrl() {},
    }));
    const idOnlyEvidence = evidence({ remoteId: 'remote-id-only' });
    const urlOnlyEvidence = evidence({ remoteUrl: 'https://publisher.example/articles/1' });
    const safeQueryEvidence = evidence({ remoteUrl: 'https://publisher.example/articles/1?source=archive' });
    const sensitiveQueryEvidence = evidence({ remoteUrl: 'https://publisher.example/articles/1?token=secret' });
    const manualEvidence = evidence({ firstPublishedAtSource: 'manual_positive_evidence_time', safeEvidenceRefs: [{ kind: 'MANUAL_POSITIVE_EVIDENCE', fingerprint: 'manual-fingerprint' }] });
    const failure = record('failure', { status: 'failed', attempts: [{ attemptId: 'attempt-failed', status: 'failed', createdAt: null, updatedAt: null, startedAt: null, finishedAt: null, remoteId: null, remoteUrl: null, errorCode: 'CONTENT_REJECTED', reasonCode: 'CONTENT_REJECTED', reasonSummary: '平台明确拒绝了这篇文章，请检查内容后从统一投稿入口重新发起。' }] });
    console.log(JSON.stringify({
      idOnly: render([record('id-only')], [archive('id-only', idOnlyEvidence, { remoteId: 'remote-id-only', remoteUrl: null, displayStatus: 'RECORDED' })]),
      urlOnly: render([record('url-only')], [archive('url-only', urlOnlyEvidence, { remoteId: null, remoteUrl: 'https://publisher.example/articles/1', displayStatus: 'RECORDED' })]),
      safeQuery: render([record('safe-query')], [archive('safe-query', safeQueryEvidence, { remoteId: null, remoteUrl: 'https://publisher.example/articles/1?source=archive', displayStatus: 'RECORDED' })]),
      sensitiveQuery: render([record('sensitive-query')], [archive('sensitive-query', sensitiveQueryEvidence, { remoteId: null, remoteUrl: 'https://publisher.example/articles/1?token=secret', displayStatus: 'RECORDED' })]),
      manualNoLink: render([record('manual-no-link')], [archive('manual-no-link', manualEvidence, { remoteId: null, remoteUrl: null, displayStatus: 'MANUAL_CONFIRMED_NO_LOCATOR' })]),
      failure: render([failure]),
    }));
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
  const archiveFixtures = renderPublicationArchiveFixtures();

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
    assert.match(presentation.publication, /远端 ID/);
    assert.match(presentation.publication, /最终结果/);
    assert.match(presentation.publication, /证据来源/);
    assert.match(presentation.publication, /投稿处理与核对详情/);
    assert.match(presentation.publication, /PLATFORM_RESULT_UNCERTAIN/);
    assert.match(presentation.publication, /不在这里执行人工确认或直接重试/);
    assert.match(presentation.publication, /前往需处理事项/);
    assert.doesNotMatch(presentation.publication, /确认已发布/);
    assert.doesNotMatch(presentation.publication, /确认未发布/);
  });

  it("renders ID-only, URL-only, manual-no-link, and safe failure fixtures without inventing evidence", function () {
    assert.match(archiveFixtures.idOnly, /remote-id-only/);
    assert.doesNotMatch(archiveFixtures.idOnly, /打开发布链接/);
    assert.match(archiveFixtures.urlOnly, /打开发布链接/);
    assert.doesNotMatch(archiveFixtures.urlOnly, /远端 ID/);
    assert.match(archiveFixtures.safeQuery, /打开发布链接/);
    assert.doesNotMatch(archiveFixtures.sensitiveQuery, /打开发布链接/);
    assert.match(archiveFixtures.manualNoLink, /已人工确认发布，未记录可用链接。/);
    assert.match(archiveFixtures.manualNoLink, /人工确认/);
    assert.doesNotMatch(archiveFixtures.manualNoLink, /打开发布链接/);
    assert.match(archiveFixtures.failure, /平台明确拒绝了这篇文章，请检查内容后从统一投稿入口重新发起。/);
    assert.match(archiveFixtures.failure, /结果代码/);
    assert.match(archiveFixtures.failure, /CONTENT_REJECTED/);
    assert.match(archiveFixtures.failure, /最近更新时间/);
    assert.doesNotMatch(archiveFixtures.failure, /最近确认时间/);
    assert.match(archiveFixtures.idOnly, /平台接受结果/);
    assert.match(archiveFixtures.idOnly, /投稿内容快照/);
    assert.match(archiveFixtures.idOnly, /投稿处理与核对详情/);
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

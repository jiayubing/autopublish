import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupPublishedArticlesByTarget,
  publishedArticleMatchesDateRange,
  publishedTimeFactFromEvidence,
  publishedTimeFactsByArticle,
} from '../media-workbench/src/article-history-logic.js';

function article(id, createdAt) {
  return { id, clientId: 'c1', title: id, createdAt };
}

function archive(articleId, target, firstPublishedAt, firstPublishedAtSource) {
  return {
    publicationId: `publication-${articleId}`,
    publicationEvidence: {
      articleIdentityV1: { articleId },
      targetSnapshotV1: target,
      firstPublishedAt,
      firstPublishedAtSource,
    },
  };
}

const lieju = { kind: 'platform', platformId: 'lieju', platformName: '列举网' };
const hepan = { kind: 'platform', platformId: 'hepan', platformName: '蓝色河畔' };

test('published grouping uses publication time, not generated time, and keeps unknown times stable', () => {
  const articles = [
    article('generated-early-published-late', '2026-06-01T00:00:00.000Z'),
    article('generated-late-published-early', '2026-08-20T00:00:00.000Z'),
    article('unknown-first', '2026-09-10T00:00:00.000Z'),
    article('unknown-second', '2026-09-11T00:00:00.000Z'),
    article('other-group-latest', '2026-01-01T00:00:00.000Z'),
  ];
  const archives = [
    archive('generated-early-published-late', lieju, '2026-08-31T16:30:00.000Z', 'first_positive_observation_time'),
    archive('generated-late-published-early', lieju, '2026-08-31T15:30:00.000Z', 'provider_event_time'),
    archive('unknown-first', lieju, null, 'legacy_unavailable'),
    archive('unknown-second', lieju, null, 'legacy_unavailable'),
    archive('other-group-latest', hepan, '2026-09-01T02:00:00.000Z', 'provider_event_time'),
  ];
  const groups = groupPublishedArticlesByTarget(articles, archives, []);
  assert.deepEqual(groups.map((group) => group.key), ['published:platform:hepan', 'published:platform:lieju']);
  assert.deepEqual(groups[1].articles.map((item) => item.id), [
    'generated-early-published-late',
    'generated-late-published-early',
    'unknown-first',
    'unknown-second',
  ]);
});

test('published date filtering uses Beijing publication date and never falls back to generated time', () => {
  const archives = [
    archive('september-in-beijing', lieju, '2026-08-31T16:00:00.000Z', 'provider_event_time'),
    archive('august-in-beijing', lieju, '2026-08-31T15:59:59.999Z', 'first_positive_observation_time'),
    archive('unknown', lieju, null, 'legacy_unavailable'),
  ];
  const facts = publishedTimeFactsByArticle(archives);
  assert.equal(publishedArticleMatchesDateRange('september-in-beijing', facts, '2026-09-01', '2026-09-01'), true);
  assert.equal(publishedArticleMatchesDateRange('september-in-beijing', facts, '2026-08-31', '2026-08-31'), false);
  assert.equal(publishedArticleMatchesDateRange('august-in-beijing', facts, '2026-08-31', '2026-08-31'), true);
  assert.equal(publishedArticleMatchesDateRange('unknown', facts, '', ''), true);
  assert.equal(publishedArticleMatchesDateRange('unknown', facts, '2026-09-01', '2026-09-01'), false);
});

test('published time source labels are explicit and legacy/unknown evidence fails closed', () => {
  const at = '2026-08-20T00:01:00.000Z';
  assert.deepEqual(publishedTimeFactFromEvidence({ firstPublishedAt: at, firstPublishedAtSource: 'provider_event_time' }), {
    firstPublishedAt: at,
    firstPublishedAtSource: 'provider_event_time',
    label: '发布时间',
    timestamp: Date.parse(at),
  });
  assert.equal(publishedTimeFactFromEvidence({ firstPublishedAt: at, firstPublishedAtSource: 'first_positive_observation_time' }).label, '确认发布时间');
  assert.equal(publishedTimeFactFromEvidence({ firstPublishedAt: at, firstPublishedAtSource: 'manual_positive_evidence_time' }).label, '人工确认时间');
  assert.equal(publishedTimeFactFromEvidence({ firstPublishedAt: null, firstPublishedAtSource: 'legacy_unavailable' }), null);
  assert.equal(publishedTimeFactFromEvidence({ firstPublishedAt: at, firstPublishedAtSource: 'unexpected_source' }), null);
});

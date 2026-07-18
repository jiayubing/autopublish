const PUBLICATION_STATUS_LABELS = {
  not_submitted: '未投稿', queued: '已入队', submitting: '投稿中', reviewing: '审核中',
  partial: '部分发布', published: '已发布', uncertain: '待确认', failed: '失败'
};
const PUBLICATION_STATUS_FILTERS = [
  { value: 'all', label: '全部投稿状态' },
  { value: 'not_submitted', label: PUBLICATION_STATUS_LABELS.not_submitted },
  { value: 'queued', label: PUBLICATION_STATUS_LABELS.queued },
  { value: 'submitting', label: PUBLICATION_STATUS_LABELS.submitting },
  { value: 'reviewing', label: PUBLICATION_STATUS_LABELS.reviewing },
  { value: 'partial', label: PUBLICATION_STATUS_LABELS.partial },
  { value: 'published', label: PUBLICATION_STATUS_LABELS.published },
  { value: 'uncertain', label: PUBLICATION_STATUS_LABELS.uncertain },
  { value: 'failed', label: PUBLICATION_STATUS_LABELS.failed }
];
const BLOCKING_STATUSES = new Set(['failed', 'cancelled']);

function latestPublicationAttempt(record) {
  if (record && Array.isArray(record.attempts) && record.attempts.length) return record.attempts[record.attempts.length - 1];
  return { attemptId: record && record.attemptId || null, status: record && record.status || null, createdAt: record && record.createdAt || null, updatedAt: record && record.updatedAt || null, startedAt: null, finishedAt: null, remoteId: record && record.remoteId || null, remoteUrl: record && record.remoteUrl || null, errorCode: record && record.errorCode || null, reasonCode: record && record.reasonCode || null };
}

function summarizePublicationRecords(records) {
  if (!records.length) return { status: 'not_submitted', label: PUBLICATION_STATUS_LABELS.not_submitted, records: 0, published: 0, uncertain: false };
  const statuses = records.map((record) => record.status);
  const published = statuses.filter((status) => status === 'published').length;
  if (statuses.includes('uncertain')) return { status: 'uncertain', label: PUBLICATION_STATUS_LABELS.uncertain, records: records.length, published, uncertain: true };
  if (published > 0 && published < records.length) return { status: 'partial', label: PUBLICATION_STATUS_LABELS.partial, records: records.length, published, uncertain: false };
  if (published === records.length) return { status: 'published', label: PUBLICATION_STATUS_LABELS.published, records: records.length, published, uncertain: false };
  if (statuses.every((status) => BLOCKING_STATUSES.has(status))) return { status: 'failed', label: PUBLICATION_STATUS_LABELS.failed, records: records.length, published, uncertain: false };
  if (statuses.includes('submitting')) return { status: 'submitting', label: PUBLICATION_STATUS_LABELS.submitting, records: records.length, published, uncertain: false };
  if (statuses.includes('submitted')) return { status: 'reviewing', label: PUBLICATION_STATUS_LABELS.reviewing, records: records.length, published, uncertain: false };
  if (statuses.includes('queued')) return { status: 'queued', label: PUBLICATION_STATUS_LABELS.queued, records: records.length, published, uncertain: false };
  return { status: 'failed', label: PUBLICATION_STATUS_LABELS.failed, records: records.length, published, uncertain: false };
}

function publicationSummaryMatchesFilter(summary, filter) { return filter === 'all' || summary.status === filter; }
function publicationStatusLabel(status) { return PUBLICATION_STATUS_LABELS[status] || status || '未知'; }
function publicationRecordStatusLabel(status) { return status === 'submitted' ? '审核中' : publicationStatusLabel(status); }
function publicationTargetLabel(record) { return record.mediaResourceId ? `${record.displayName || '付费媒体资源'} · 资源 ${record.mediaResourceId}` : record.platformId ? (record.displayName || record.platformId) : record.targetKey || '未知目标'; }

export { PUBLICATION_STATUS_LABELS, PUBLICATION_STATUS_FILTERS, latestPublicationAttempt, summarizePublicationRecords, publicationSummaryMatchesFilter, publicationStatusLabel, publicationRecordStatusLabel, publicationTargetLabel };

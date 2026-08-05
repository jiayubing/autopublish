import type { PublicationHistoryRecord, PublicationHistorySummary, PublicationRecordStatus } from './types/publication';

export const PUBLICATION_STATUS_LABELS: Record<PublicationHistorySummary['status'], string> = {
  not_submitted: '未投稿',
  queued: '已入队',
  paid_processing: '付费处理中',
  submitting: '投稿中',
  partial: '部分发布',
  published: '已发布',
  uncertain: '待确认',
  failed: '失败',
};

export const PUBLICATION_STATUS_FILTERS = [
  { value: 'all', label: '全部投稿状态' },
  { value: 'not_submitted', label: PUBLICATION_STATUS_LABELS.not_submitted },
  { value: 'queued', label: PUBLICATION_STATUS_LABELS.queued },
  { value: 'paid_processing', label: PUBLICATION_STATUS_LABELS.paid_processing },
  { value: 'submitting', label: PUBLICATION_STATUS_LABELS.submitting },
  { value: 'partial', label: PUBLICATION_STATUS_LABELS.partial },
  { value: 'published', label: PUBLICATION_STATUS_LABELS.published },
  { value: 'uncertain', label: PUBLICATION_STATUS_LABELS.uncertain },
  { value: 'failed', label: PUBLICATION_STATUS_LABELS.failed },
] as const;

export type PublicationHistoryFilter = 'all' | PublicationHistorySummary['status'];

const BLOCKING_STATUSES = new Set<PublicationRecordStatus>(['failed', 'cancelled']);

function isMediaPublicationRecord(record: Pick<PublicationHistoryRecord, 'mediaResourceId' | 'targetKey' | 'platformId'> | null | undefined): boolean {
  const targetKey = record?.targetKey || '';
  return Boolean(record?.mediaResourceId)
    || targetKey.startsWith('media-resource:')
    || targetKey.startsWith('media:')
    || record?.platformId === 'media';
}

function lifecycleStatusOf(record: PublicationHistoryRecord): PublicationRecordStatus {
  if (record.status !== 'submitted') return record.status;
  return isMediaPublicationRecord(record) ? 'paid_processing' : 'published';
}

export function latestPublicationAttempt(record: PublicationHistoryRecord) {
  if (record.attempts?.length) return record.attempts[record.attempts.length - 1];
  return {
    attemptId: record.attemptId || null,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    startedAt: null,
    finishedAt: null,
    remoteId: record.remoteId || null,
    remoteUrl: record.remoteUrl || null,
    errorCode: record.errorCode || null,
    reasonCode: record.reasonCode || null,
  };
}

export function summarizePublicationRecords(records: PublicationHistoryRecord[]): PublicationHistorySummary {
  if (!records.length) return { status: 'not_submitted', label: PUBLICATION_STATUS_LABELS.not_submitted, records: 0, published: 0, uncertain: false };
  const statuses = records.map(lifecycleStatusOf);
  const published = statuses.filter((status) => status === 'published').length;
  if (statuses.includes('uncertain')) return { status: 'uncertain', label: PUBLICATION_STATUS_LABELS.uncertain, records: records.length, published, uncertain: true };
  if (published > 0 && published < records.length) return { status: 'partial', label: PUBLICATION_STATUS_LABELS.partial, records: records.length, published, uncertain: false };
  if (published === records.length) return { status: 'published', label: PUBLICATION_STATUS_LABELS.published, records: records.length, published, uncertain: false };
  if (statuses.includes('paid_processing')) return { status: 'paid_processing', label: PUBLICATION_STATUS_LABELS.paid_processing, records: records.length, published, uncertain: false };
  if (statuses.every((status) => BLOCKING_STATUSES.has(status))) return { status: 'failed', label: PUBLICATION_STATUS_LABELS.failed, records: records.length, published, uncertain: false };
  if (statuses.includes('submitting')) return { status: 'submitting', label: PUBLICATION_STATUS_LABELS.submitting, records: records.length, published, uncertain: false };
  if (statuses.includes('queued')) return { status: 'queued', label: PUBLICATION_STATUS_LABELS.queued, records: records.length, published, uncertain: false };
  if (statuses.every((status) => status === 'failed' || status === 'cancelled')) return { status: 'failed', label: PUBLICATION_STATUS_LABELS.failed, records: records.length, published, uncertain: false };
  return { status: 'failed', label: PUBLICATION_STATUS_LABELS.failed, records: records.length, published, uncertain: false };
}

export function publicationSummaryMatchesFilter(summary: PublicationHistorySummary, filter: PublicationHistoryFilter): boolean {
  return filter === 'all' || summary.status === filter;
}

export function publicationStatusLabel(status: string | null | undefined): string {
  return PUBLICATION_STATUS_LABELS[status as PublicationHistorySummary['status']] || status || '未知';
}

export function publicationRecordStatusLabel(status: string | null | undefined, record?: Pick<PublicationHistoryRecord, 'mediaResourceId' | 'targetKey' | 'platformId'> | null): string {
  if (status === 'submitted') return isMediaPublicationRecord(record) ? PUBLICATION_STATUS_LABELS.paid_processing : PUBLICATION_STATUS_LABELS.published;
  return publicationStatusLabel(status);
}

export function publicationTargetLabel(record: PublicationHistoryRecord): string {
  if (record.mediaResourceId) return `${record.displayName || '付费媒体资源'} · 资源 ${record.mediaResourceId}`;
  if (record.platformId) return record.displayName || record.platformId;
  if (record.targetKey) return record.targetKey;
  return '未知目标';
}

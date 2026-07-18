import type {
  ArticleRemovalTransaction,
  ContentSubmissionBatchRecord,
  GeneratedContentArticle,
  PublicationHistoryRecord,
} from './types';

export type ArticleWorkflowStage = 'pending_review' | 'pending_submission' | 'submitting' | 'attention' | 'completed' | 'trash';
export type ArticleWorkflowAction = 'review' | 'queue' | 'view_progress' | 'open_attention' | 'view_publication' | 'restore';

export interface ArticleWorkflowAttention {
  articleId?: string | null;
  kind?: string | null;
  status?: string | null;
  reasonCode?: string | null;
  archiveError?: unknown;
}

export interface ArticleWorkflowLocks {
  canEdit: boolean;
  canReview: boolean;
  canQueue: boolean;
  canCancel: boolean;
  canTrash: boolean;
}

export interface ArticleWorkflow {
  stage: ArticleWorkflowStage;
  primaryAction: ArticleWorkflowAction;
  allowedBulkActions: ArticleWorkflowAction[];
  locks: ArticleWorkflowLocks;
}

const ACTIVE_PUBLICATION_STATUSES = new Set(['queued', 'submitting', 'submitted']);
const ATTENTION_PUBLICATION_STATUSES = new Set(['failed', 'uncertain']);
const ACTIVE_BATCH_STATUSES = new Set(['queued', 'submitting', 'submitted', 'reserving']);
const ATTENTION_BATCH_STATUSES = new Set(['failed', 'conflict', 'uncertain']);

function hasArticleAttention(articleId: string, attention: ArticleWorkflowAttention[]): boolean {
  return attention.some((item) => item.articleId === articleId || item.archiveError != null);
}

function articleBatchStatuses(articleId: string, batches: ContentSubmissionBatchRecord[]): string[] {
  return batches.flatMap((batch) => batch.items.filter((item) => item.articleId === articleId).map((item) => item.status));
}

export function deriveArticleWorkflow(
  article: GeneratedContentArticle,
  publications: PublicationHistoryRecord[] = [],
  batches: ContentSubmissionBatchRecord[] = [],
  transactions: ArticleRemovalTransaction[] = [],
  attention: ArticleWorkflowAttention[] = [],
): ArticleWorkflow {
  const articleId = article.id;
  const articleStatus = String(article.status || '');
  const publicationStatuses = publications.filter((record) => record.articleId === articleId).map((record) => String(record.status));
  const batchStatuses = articleBatchStatuses(articleId, batches);
  const hasRepairTransaction = transactions.some((transaction) => transaction.status === 'needs_repair' || transaction.phase === 'needs_repair');
  const hasAttention = articleStatus === 'failed' || articleStatus === 'uncertain' || hasArticleAttention(articleId, attention) ||
    hasRepairTransaction || publicationStatuses.some((status) => ATTENTION_PUBLICATION_STATUSES.has(status)) || batchStatuses.some((status) => ATTENTION_BATCH_STATUSES.has(status));
  const isActive = publicationStatuses.some((status) => ACTIVE_PUBLICATION_STATUSES.has(status)) || batchStatuses.some((status) => ACTIVE_BATCH_STATUSES.has(status));
  const hasPublished = publicationStatuses.includes('published');
  const isTrash = articleStatus === 'trashed' || articleStatus === 'trash';

  if (isTrash) {
    return {
      stage: 'trash',
      primaryAction: 'restore',
      allowedBulkActions: ['restore'],
      locks: { canEdit: false, canReview: false, canQueue: false, canCancel: false, canTrash: false },
    };
  }
  if (hasAttention) {
    return {
      stage: 'attention',
      primaryAction: 'open_attention',
      allowedBulkActions: ['open_attention'],
      locks: { canEdit: false, canReview: false, canQueue: false, canCancel: false, canTrash: false },
    };
  }
  if (isActive) {
    return {
      stage: 'submitting',
      primaryAction: 'view_progress',
      allowedBulkActions: batchStatuses.includes('queued') ? ['view_progress'] : [],
      locks: { canEdit: false, canReview: false, canQueue: false, canCancel: batchStatuses.includes('queued'), canTrash: false },
    };
  }
  if (articleStatus === 'generated') {
    return {
      stage: 'pending_review',
      primaryAction: 'review',
      allowedBulkActions: ['review'],
      locks: { canEdit: true, canReview: true, canQueue: false, canCancel: false, canTrash: true },
    };
  }
  if (!hasPublished && (articleStatus === 'saved' || articleStatus === '')) {
    return {
      stage: 'pending_submission',
      primaryAction: 'queue',
      allowedBulkActions: ['queue'],
      locks: { canEdit: true, canReview: false, canQueue: true, canCancel: false, canTrash: true },
    };
  }
  return {
    stage: 'completed',
    primaryAction: 'view_publication',
    allowedBulkActions: ['view_publication'],
    locks: { canEdit: false, canReview: false, canQueue: false, canCancel: false, canTrash: false },
  };
}

export const ARTICLE_WORKFLOW_STAGES: Array<{ id: ArticleWorkflowStage | 'all'; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'pending_review', label: '待审核' },
  { id: 'pending_submission', label: '待投稿' },
  { id: 'submitting', label: '投稿中' },
  { id: 'attention', label: '需处理' },
  { id: 'completed', label: '已完成' },
  { id: 'trash', label: '回收站' },
];


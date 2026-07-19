import type {
  ArticleRemovalTransaction,
  ContentSubmissionBatchRecord,
  GeneratedContentArticle,
  PublicationHistoryRecord,
} from './types';

export type ArticleWorkflowStage = 'pending_submission' | 'queued' | 'published' | 'failed' | 'trash';
export type ArticleWorkflowAction = 'queue' | 'view_progress' | 'open_attention' | 'view_publication' | 'trash' | 'restore';

export interface ArticleWorkflowAttention {
  articleId?: string | null;
  kind?: string | null;
  status?: string | null;
  reasonCode?: string | null;
  archiveError?: unknown;
}

export interface ArticleWorkflowLocks {
  canEdit: boolean;
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
const FAILURE_PUBLICATION_STATUSES = new Set(['failed', 'uncertain']);
const ACTIVE_BATCH_STATUSES = new Set(['queued', 'submitting', 'submitted', 'reserving']);
const FAILURE_BATCH_STATUSES = new Set(['failed', 'conflict', 'uncertain']);
const TERMINAL_PUBLICATION_STATUSES = new Set(['published', 'cancelled']);

function hasArticleAttention(articleId: string, attention: ArticleWorkflowAttention[]): boolean {
  return attention.some((item) => item.articleId === articleId || item.archiveError != null);
}

function articleBatchStatuses(articleId: string, batches: ContentSubmissionBatchRecord[]): string[] {
  return batches.flatMap((batch) => batch.items.filter((item) => item.articleId === articleId).map((item) => String(item.status)));
}

function managementFacts(
  article: GeneratedContentArticle,
  publications: PublicationHistoryRecord[],
  batches: ContentSubmissionBatchRecord[],
  transactions: ArticleRemovalTransaction[],
  attention: ArticleWorkflowAttention[],
) {
  const articleId = article.id;
  const articleStatus = String(article.status || '');
  const publicationStatuses = publications.filter((record) => record.articleId === articleId).map((record) => String(record.status));
  const batchStatuses = articleBatchStatuses(articleId, batches);
  const isTrash = articleStatus === 'trashed' || articleStatus === 'trash';
  const hasActive = publicationStatuses.some((status) => ACTIVE_PUBLICATION_STATUSES.has(status)) || batchStatuses.some((status) => ACTIVE_BATCH_STATUSES.has(status));
  const hasFailure = articleStatus === 'failed' || articleStatus === 'uncertain' || hasArticleAttention(articleId, attention) ||
    transactions.some((transaction) => transaction.status === 'needs_repair' || transaction.phase === 'needs_repair') ||
    publicationStatuses.some((status) => FAILURE_PUBLICATION_STATUSES.has(status)) || batchStatuses.some((status) => FAILURE_BATCH_STATUSES.has(status));
  const hasUncertain = publicationStatuses.includes('uncertain') || batchStatuses.includes('uncertain');
  const combinedStatuses = [...publicationStatuses, ...batchStatuses.filter((status) => ['published', 'cancelled'].includes(status))];
  const hasPublished = combinedStatuses.includes('published');
  const allPublicationTargetsTerminal = combinedStatuses.length > 0 && combinedStatuses.every((status) => TERMINAL_PUBLICATION_STATUSES.has(status));
  let stage: ArticleWorkflowStage;
  if (isTrash) stage = 'trash';
  else if (hasFailure) stage = 'failed';
  else if (hasActive) stage = 'queued';
  else if (hasPublished && allPublicationTargetsTerminal) stage = 'published';
  else stage = 'pending_submission';
  return { articleStatus, publicationStatuses, batchStatuses, isTrash, hasActive, hasFailure, hasUncertain, hasPublished, stage };
}

export function deriveArticleManagementStatus(
  article: GeneratedContentArticle,
  publications: PublicationHistoryRecord[] = [],
  batches: ContentSubmissionBatchRecord[] = [],
  transactions: ArticleRemovalTransaction[] = [],
  attention: ArticleWorkflowAttention[] = [],
): ArticleWorkflowStage {
  return managementFacts(article, publications, batches, transactions, attention).stage;
}

export function deriveArticleWorkflow(
  article: GeneratedContentArticle,
  publications: PublicationHistoryRecord[] = [],
  batches: ContentSubmissionBatchRecord[] = [],
  transactions: ArticleRemovalTransaction[] = [],
  attention: ArticleWorkflowAttention[] = [],
): ArticleWorkflow {
  const facts = managementFacts(article, publications, batches, transactions, attention);
  if (facts.stage === 'trash') {
    return {
      stage: 'trash',
      primaryAction: 'restore',
      allowedBulkActions: ['restore'],
      locks: { canEdit: false, canQueue: false, canCancel: false, canTrash: false },
    };
  }
  if (facts.stage === 'failed') {
    return {
      stage: 'failed',
      primaryAction: 'open_attention',
      allowedBulkActions: facts.hasUncertain ? ['open_attention'] : ['open_attention', 'trash'],
      locks: { canEdit: false, canQueue: false, canCancel: false, canTrash: !facts.hasActive && !facts.hasUncertain },
    };
  }
  if (facts.stage === 'queued') {
    return {
      stage: 'queued',
      primaryAction: 'view_progress',
      allowedBulkActions: ['view_progress'],
      locks: { canEdit: false, canQueue: false, canCancel: facts.batchStatuses.includes('queued'), canTrash: false },
    };
  }
  if (facts.stage === 'published') {
    return {
      stage: 'published',
      primaryAction: 'view_publication',
      allowedBulkActions: ['view_publication', 'trash'],
      locks: { canEdit: false, canQueue: false, canCancel: false, canTrash: true },
    };
  }
  return {
    stage: 'pending_submission',
    primaryAction: 'queue',
    allowedBulkActions: ['queue'],
    locks: { canEdit: true, canQueue: true, canCancel: false, canTrash: true },
  };
}

export const ARTICLE_WORKFLOW_STAGES: Array<{ id: ArticleWorkflowStage; label: string }> = [
  { id: 'pending_submission', label: '待投稿' },
  { id: 'queued', label: '已入队' },
  { id: 'published', label: '已发布' },
  { id: 'failed', label: '失败' },
  { id: 'trash', label: '回收站' },
];

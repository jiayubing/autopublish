import type { PublicationHistorySummary } from './types/publication';

export type ArticleWorkflowStage = 'pending_submission' | 'queued' | 'paid_processing' | 'failed' | 'published' | 'trash';
export type ArticleWorkflowAction = 'queue' | 'view_progress' | 'view_order' | 'open_attention' | 'view_publication' | 'trash' | 'restore';

export interface ArticleWorkflowAttention {
  articleId?: string | null;
  kind?: string | null;
  status?: string | null;
  reasonCode?: string | null;
  archiveErrorCode?: string | null;
}

export interface ArticleWorkflowLocks {
  canEdit: boolean;
  canQueue: boolean;
  canCancel: boolean;
  canTrash: boolean;
}

export interface ArticleWorkflow {
  version?: number;
  stage: ArticleWorkflowStage;
  label?: string;
  primaryAction: ArticleWorkflowAction;
  allowedBulkActions: ArticleWorkflowAction[];
  locks: ArticleWorkflowLocks;
  reasonCodes?: string[];
  reasonMessage?: string | null;
  publicationSummary?: PublicationHistorySummary;
  targetFacts?: Array<{
    targetKey: string;
    status: string;
    canCancel: boolean;
    publicationId?: string | null;
    displayName?: string | null;
    batchId?: string | null;
  }>;
}

export const ARTICLE_WORKFLOW_STAGES: Array<{ id: ArticleWorkflowStage; label: string }> = [
  { id: 'pending_submission', label: '待投稿' },
  { id: 'queued', label: '投稿队列' },
  { id: 'paid_processing', label: '付费处理中' },
  { id: 'failed', label: '需处理' },
  { id: 'published', label: '已发布' },
  { id: 'trash', label: '回收站' },
];

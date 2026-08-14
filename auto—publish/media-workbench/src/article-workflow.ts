import type { PublicationHistorySummary } from './types/publication';

export type ArticleWorkflowStage = 'pending_submission' | 'needs_completion' | 'in_submission' | 'published' | 'trash';
/** Library categories plus the independent attention read-model filter. */
export type ArticleWorkflowFilter = ArticleWorkflowStage | 'all' | 'attention';
export type ArticleWorkflowAction = 'submit' | 'edit' | 'view_submission' | 'queue' | 'view_progress' | 'view_order' | 'open_attention' | 'view_publication' | 'trash' | 'restore' | 'purge';

export interface ArticleWorkflowAttention {
  articleId?: string | null;
  kind?: string | null;
  status?: string | null;
  reasonCode?: string | null;
  archiveErrorCode?: string | null;
}

export interface ArticleWorkflowLocks {
  canEdit: boolean;
  canSubmit: boolean;
  /** Temporary derived field for pre-26-H direct consumers. */
  canQueue: boolean;
  canCancel: boolean;
  canTrash: boolean;
}

export interface ArticleOperation {
  allowed: boolean;
  reasonCodes: string[];
  safeMetadata: {
    articleId?: string;
    stage?: string;
    targetKeys?: string[];
    hasPublished?: boolean;
    hasActiveTarget?: boolean;
    hasUncertain?: boolean;
    isTrash?: boolean;
    attentionCount?: number;
    orderStatus?: string;
  };
}

export interface ArticleOrderSummary {
  status: string;
  label?: string;
  records: number;
  active: number;
  published: number;
  attention: number;
}

export interface ArticleWorkflow {
  version?: number;
  stage: ArticleWorkflowStage;
  label?: string;
  primaryAction: ArticleWorkflowAction;
  allowedBulkActions: ArticleWorkflowAction[];
  locks: ArticleWorkflowLocks;
  operations?: {
    edit: ArticleOperation;
    submit: ArticleOperation;
    /** Temporary migration seam; derived from submit by the main-process owner. */
    queue: ArticleOperation;
    retarget: ArticleOperation;
    trash: ArticleOperation;
    restore: ArticleOperation;
    purge: ArticleOperation;
  };
  reasonCodes?: string[];
  reasonMessage?: string | null;
  attentionCount: number;
  orderSummary: ArticleOrderSummary;
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
  { id: 'needs_completion', label: '待完善' },
  { id: 'in_submission', label: '投稿中' },
  { id: 'published', label: '已发布' },
  { id: 'trash', label: '回收站' },
];

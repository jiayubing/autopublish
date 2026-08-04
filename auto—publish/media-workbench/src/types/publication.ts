import type { GeneratedContentArticle } from "./generation";

export type PublicationRecordStatus =
  | "queued"
  | "submitting"
  | "submitted"
  | "published"
  | "uncertain"
  | "failed"
  | "cancelled"
  | string;
export type PublicationHistorySummaryStatus =
  | "not_submitted"
  | "queued"
  | "submitting"
  | "reviewing"
  | "partial"
  | "published"
  | "uncertain"
  | "failed";
export interface PublicationHistoryAttempt {
  attemptId: string | null;
  status: PublicationRecordStatus | null;
  createdAt: string | null;
  updatedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  remoteId: string | null;
  remoteUrl: string | null;
  errorCode: string | null;
  reasonCode: string | null;
}
export interface PublicationHistoryRecord {
  version?: number;
  publicationId: string;
  clientId: string | null;
  articleId: string | null;
  articleKey: string;
  targetKey: string;
  platformId: string | null;
  mediaResourceId: string | null;
  displayName: string | null;
  titleSnapshot?: string | null;
  status: PublicationRecordStatus;
  createdAt: string;
  updatedAt: string;
  attempts: PublicationHistoryAttempt[];
  attemptId: string | null;
  remoteId: string | null;
  remoteUrl: string | null;
  errorCode: string | null;
  reasonCode: string | null;
}
export interface PublicationHistorySummary {
  status: PublicationHistorySummaryStatus;
  label: string;
  records: number;
  published: number;
  uncertain: boolean;
}

export interface ArticleReviewSelection {
  clientId: string;
  articleId: string;
}
export interface ArticleReviewResult {
  approved: string[];
  rejected: Array<{ articleId: string; code: string }>;
  skipped: string[];
}
export type ArticleRemovalTransactionStatus =
  | "pending_auto_recovery"
  | "needs_repair"
  | "committed"
  | "superseded"
  | "pending_recovery"
  | string;
export interface ArticleRemovalTransaction {
  id?: string;
  transactionId?: string;
  status: ArticleRemovalTransactionStatus;
  phase?: string | null;
  errorCode?: string | null;
  reasonCode?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  articleCount?: number;
  queueCursor?: number;
  articleCursor?: number;
}

export interface ArticleTrashImpactItem {
  clientId?: string;
  articleId?: string;
  platformId?: string | null;
  targetPlatformId?: string | null;
  displayName?: string | null;
  reasonCode?: string | null;
  status?: string | null;
  [key: string]: unknown;
}

export interface ArticleTrashPreview {
  token?: string;
  articleCount: number;
  queuedToCancel: ArticleTrashImpactItem[];
  failedToClean: ArticleTrashImpactItem[];
  publishedToClean?: ArticleTrashImpactItem[];
  cancelledToClean?: ArticleTrashImpactItem[];
  terminalCleanupCount?: number;
  blockedItems: ArticleTrashImpactItem[];
  canCommit: boolean;
  selections?: ArticleReviewSelection[];
  expiresAt?: string;
  transactionId?: string | null;
  openTransactionId?: string | null;
  transaction?: ArticleRemovalTransaction | null;
  openTransaction?: ArticleRemovalTransaction | null;
}

export interface ArticleTrashCommitInput {
  selections?: ArticleReviewSelection[];
  token?: string;
  confirmed: true;
}

export interface ArticleTrashResult {
  moved?: ArticleTrashRecord[];
  skipped?: ArticleTrashRecord[];
  rejected?: Array<{ clientId: string; articleId: string; code: string }>;
  transactionId?: string;
  status?: string;
  articleCount?: number;
  queueActions?: ArticleTrashImpactItem[];
  errorCode?: string;
  reasonCode?: string | null;
  phase?: string | null;
  transaction?: ArticleRemovalTransaction | null;
}

export interface TrashedArticleQueueResidueItem extends ArticleTrashImpactItem {
  sourceArticleState: "trashed";
  repairAction?:
    | "cancel"
    | "cleanup"
    | "cleanupPublishedLocal"
    | "cleanupCancelledLocal"
    | null;
}

export interface TrashedArticleQueueResiduePreview {
  items: TrashedArticleQueueResidueItem[];
  cleanableItems: TrashedArticleQueueResidueItem[];
  reportedItems: TrashedArticleQueueResidueItem[];
  cleanableCount: number;
  reportedCount: number;
  failedCount?: number;
  remainingCount?: number;
  failedItems?: TrashedArticleQueueResidueItem[];
  status?: string;
  remainingItems?: TrashedArticleQueueResidueItem[];
}

export interface ArticlePermanentDeleteConfirmation {
  token: string;
  clientId: string;
  articleId: string;
  deletedAt: string;
  status: string;
}

export interface ArticlePermanentDeleteRequest {
  clientId: string;
  articleId: string;
  token: string;
}

export interface ArticlePermanentDeleteResult {
  clientId: string;
  articleId: string;
  deleted: true;
  deletedAt: string;
}

export interface ContentSubmissionBatchInput {
  clientId: string;
  articleIds: string[];
  targetPlatformIds: string[];
  accountProfiles: Record<string, string>;
  confirmed?: true;
}
export type ContentSubmissionItemStatus =
  | "excluded"
  | "blocked"
  | "queueable"
  | "idempotent"
  | "alreadyQueued"
  | "blockedPublished"
  | "blockedUncertain"
  | "conflict"
  | "reserving"
  | "queued"
  | "submitting"
  | "submitted"
  | "published"
  | "uncertain"
  | "failed"
  | "failed-cleaned"
  | "published-cleaned"
  | "cancelled"
  | "cancelled-cleaned"
  | "skipped"
  | string;
export interface ContentSubmissionBatchItem {
  articleId: string;
  targetPlatformId: string;
  status: ContentSubmissionItemStatus;
  contentHash: string;
  filename?: string;
  publicationId?: string | null;
  attemptId?: string | null;
  articleKey?: string;
  targetKey?: string;
  publicationStatus?: string | null;
  reasonCode?: string | null;
  reasonCodes?: string[];
  reasons?: string[];
  reconciledStatus?: string;
  unchanged?: boolean;
  canCancel?: boolean;
  canCleanup?: boolean;
  submissionBatchId?: string;
}
export interface ContentSubmissionBatchPreview {
  batchId?: string;
  clientId: string;
  totalTaskCount: number;
  queueableTaskCount: number;
  idempotentCount: number;
  alreadyQueuedCount?: number;
  blockedPublishedCount?: number;
  blockedUncertainCount?: number;
  blockedContentCount?: number;
  conflictCount: number;
  ineligibleArticleIds?: string[];
  unreviewedArticleIds: string[];
  missingArticleIds: string[];
  unsupportedPlatformIds: string[];
  items: ContentSubmissionBatchItem[];
}
export interface ContentSubmissionBatchRecord {
  id: string;
  clientId: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  items: ContentSubmissionBatchItem[];
}
export interface ContentSubmissionPlatform {
  id: string;
  displayName: string;
  contentQueueImport: boolean;
}
export interface ContentSubmissionActionPlanItem {
  articleId: string;
  targetPlatformId: string;
  publicationId?: string | null;
  attemptId?: string | null;
  action: "cancel";
  allowed: boolean;
  reasonCode?: string | null;
  reasonMessage?: string | null;
  fingerprint?: string | null;
}
export interface ContentSubmissionCancellationPreview {
  batchId: string;
  clientId: string;
  action: "cancel";
  planId: string;
  fingerprint: string;
  allowedCount: number;
  blockedCount: number;
  items: ContentSubmissionActionPlanItem[];
}
export interface ContentSubmissionCleanupPreview {
  batchId: string;
  cleanableCount: number;
  uncleanableCount: number;
  items: Array<ContentSubmissionBatchItem & { cleanable: boolean }>;
}
export interface ContentSubmissionCleanupResult {
  batchId: string;
  cleanedCount: number;
  skippedCount: number;
  items: ContentSubmissionBatchItem[];
}

export interface ArticleAttentionItem {
  attentionId: string;
  kind: string;
  articleId?: string | null;
  titleSnapshot?: string | null;
  clientId?: string | null;
  platformId?: string | null;
  displayName?: string | null;
  batchId?: string | null;
  publicationId?: string | null;
  attemptId?: string | null;
  transactionId?: string | null;
  status?: string | null;
  reasonCode?: string | null;
  pairState?: string | null;
  recommendedAction?: string | null;
  allowedActions: string[];
  updatedAt?: string | null;
  message?: string | null;
}

export interface ArticleAttentionList {
  revision: number;
  items: ArticleAttentionItem[];
  counts: { total: number; actionable: number };
}

export interface ArticleTrashRecord {
  version: 1;
  deletedAt: string;
  clientId: string;
  articleId: string;
  status: string;
  references: Array<{ type: string; id: string }>;
  titleSnapshot?: string | null;
  publicationSummary?:
    PublicationHistorySummary | Record<string, unknown> | null;
  publicationRecords?: PublicationHistoryRecord[];
}

export interface ArticleManagementSnapshot {
  clientId: string;
  revision: number;
  articles: GeneratedContentArticle[];
  trash: ArticleTrashRecord[];
  submissionBatches: ContentSubmissionBatchRecord[];
  cancellationPlans: ContentSubmissionCancellationPreview[];
  publicationRecords: PublicationHistoryRecord[];
  attention: ArticleAttentionList;
  submissionPlatforms: ContentSubmissionPlatform[];
  workflowByArticle: Record<
    string,
    {
      stage: "pending_submission" | "queued" | "published" | "failed" | "trash";
      primaryAction: string;
      allowedBulkActions: string[];
      locks: {
        canEdit: boolean;
        canQueue: boolean;
        canCancel: boolean;
        canTrash: boolean;
      };
      publicationSummary: PublicationHistorySummary;
    }
  >;
  publicationSummaries: Record<string, PublicationHistorySummary>;
}

export interface ArticleAttentionPreview {
  attentionId: string;
  revision: number;
  action: string;
  requiresConfirmation: boolean;
  message: string;
  changedScopes: string[];
}

export interface ArticleAttentionResolution {
  outcome: string;
  attentionId: string;
  result?: unknown;
  changedScopes: string[];
}

export interface FailedPublicationRetryPreview {
  publicationId: string;
  clientId: string;
  articleId: string;
  targetPlatformId: string;
  titleSnapshot?: string | null;
  failureCount: number;
  requiresConfirmation: boolean;
  message: string;
  details?: {
    titleSnapshot?: string | null;
    targetPlatformId: string;
    failureCount: number;
  };
}

export interface FailedPublicationRetryResult {
  batchId?: string;
  publicationId: string;
  attemptId?: string | null;
  clientId: string;
  articleId: string;
  targetPlatformId: string;
  changedScopes: string[];
}

import type { GeneratedContentArticle } from "./generation";
import type { ArticleOperation } from "../article-workflow";

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
  | "paid_processing"
  | "submitting"
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
  label?: string;
  records: number;
  published: number;
  uncertain: boolean;
}

export interface ArticleSelection {
  clientId: string;
  articleId: string;
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
  selections?: ArticleSelection[];
  expiresAt?: string;
  transactionId?: string | null;
  openTransactionId?: string | null;
  transaction?: ArticleRemovalTransaction | null;
  openTransaction?: ArticleRemovalTransaction | null;
}

export interface ArticleTrashCommitInput {
  selections?: ArticleSelection[];
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
  itemId?: string;
  articleId: string;
  targetPlatformId: string;
  status: ContentSubmissionItemStatus;
  contentHash: string;
  filename?: string;
  publicationId?: string | null;
  attemptId?: string | null;
  articleKey?: string;
  targetKey?: string;
  queueGroupId?: string;
  position?: number;
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

export type RegularQueueItemStatus =
  | "queueable"
  | "queued"
  | "idempotent"
  | "missing"
  | "conflict"
  | "cancelled"
  | string;
export interface RegularQueueTarget {
  platformId: string;
  accountProfileId: string;
}
export interface RegularQueueItem {
  articleRef: ArticleSelection;
  articleId: string;
  itemId?: string;
  batchId?: string;
  publicationId?: string | null;
  attemptId?: string | null;
  targetKey?: string;
  queueGroupId?: string;
  position?: number;
  status: RegularQueueItemStatus;
  idempotent?: boolean;
  reasonCode?: string | null;
  reasonCodes?: string[];
}
export interface RegularQueueAdmissionInput {
  articleRefs: ArticleSelection[];
  platformId: string;
  accountProfileId: string;
  queueConfig?: { queueGroupId?: string };
}
export interface RegularQueueAdmissionPreview {
  target: RegularQueueTarget;
  articleRefs: ArticleSelection[];
  items: RegularQueueItem[];
  totalCount: number;
  queueableCount: number;
  idempotentCount: number;
  missingCount: number;
  conflictCount: number;
}
export interface RegularQueueAdmissionResult {
  batchId: string;
  target: RegularQueueTarget;
  articleRefs: ArticleSelection[];
  items: RegularQueueItem[];
  admittedCount: number;
  idempotentCount: number;
  missingCount: number;
  conflictCount: number;
}

export interface PaidMediaPreflightInput {
  articleRefs: ArticleSelection[];
  mediaResourceId: string;
}

export interface PaidMediaRiskWarning {
  code: string;
  message: string;
  count: number;
}

export interface PaidMediaPreflightArticle {
  articleRef: ArticleSelection;
  articleId: string;
  title: string;
  contentFingerprint: string | null;
  status: "ready" | "blocked";
  reasonCodes: string[];
  riskCodes: string[];
}

export interface PaidMediaPreflight {
  version: number;
  status: "ready" | "blocked";
  canConfirm: boolean;
  confirmationToken: string;
  confirmationFingerprint: string;
  articleRefs: ArticleSelection[];
  articleCount: number;
  articles: PaidMediaPreflightArticle[];
  mediaResourceId: string;
  mediaName: string;
  mediaRemarks: string;
  resourceFingerprint: string;
  resourceAvailable: boolean;
  quotedPrice: number | null;
  estimatedTotal: number | null;
  systemSubmissionCode: string;
  blockers: string[];
  risks: PaidMediaRiskWarning[];
  createdAt: string;
  expiresAt: string;
}

export interface PaidMediaConfirmationInput {
  confirmationToken: string;
}

export interface PaidMediaAdmissionItem {
  articleRef: ArticleSelection;
  articleId: string;
  itemId: string;
  batchId: string;
  publicationId: string;
  attemptId: string;
  targetKey: string;
  status: string;
  idempotent: boolean;
}

export interface PaidMediaAdmissionResult {
  batchId: string;
  targetKey: string;
  mediaResourceId: string;
  status: string;
  articleCount: number;
  idempotent: boolean;
  items: PaidMediaAdmissionItem[];
  articleRefs: ArticleSelection[];
  confirmationFingerprint: string;
  quotedPrice: number;
  estimatedTotal: number;
}

export interface PendingQueueRemovalItemInput {
  articleRef: ArticleSelection;
  itemId: string;
  batchId: string;
  targetKey?: string;
}
export interface PendingQueueRemovalInput {
  items: PendingQueueRemovalItemInput[];
  operationId?: string;
  confirmed: true;
}
export interface PendingQueueRemovalResult {
  items: RegularQueueItem[];
  removedCount: number;
  idempotentCount: number;
  conflictCount: number;
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
      version?: number;
      stage:
        | "pending_submission"
        | "queued"
        | "paid_processing"
        | "published"
        | "failed"
        | "trash";
      label?: string;
      primaryAction: string;
      allowedBulkActions: string[];
      reasonCodes?: string[];
      reasonMessage?: string | null;
      targetFacts?: Array<{
        targetKey: string;
        status: string;
        canCancel: boolean;
        publicationId?: string | null;
        displayName?: string | null;
        batchId?: string | null;
      }>;
      locks: {
        canEdit: boolean;
        canQueue: boolean;
        canCancel: boolean;
        canTrash: boolean;
      };
      operations?: {
        edit: ArticleOperation;
        queue: ArticleOperation;
        retarget: ArticleOperation;
        trash: ArticleOperation;
      };
      publicationSummary: PublicationHistorySummary;
    }
  >;
  publicationSummaries: Record<string, PublicationHistorySummary>;
  lifecycleVersion?: number;
  lifecycleCounts?: {
    pending_submission: number;
    queued: number;
    paid_processing: number;
    failed: number;
    published: number;
    trash: number;
    total: number;
  };
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

import type {
  ArticleAttentionItem,
  ArticleRemovalTransaction,
  ArticleTrashRecord,
  ContentSubmissionBatchRecord,
  ContentSubmissionCancellationPreview,
  ContentSubmissionPlatform,
  PublicationHistoryRecord,
  PublicationHistorySummary,
} from '../../types/publication';
import type { GeneratedContentArticle } from '../../types/generation';
import type { ArticleOperation, ArticleWorkflowStage } from '../../article-workflow';

export type ArticleManagementReadModel = {
  articles: GeneratedContentArticle[];
  trash: ArticleTrashRecord[];
  submissionBatches: ContentSubmissionBatchRecord[];
  cancellationPlans: ContentSubmissionCancellationPreview[];
  publicationRecords: PublicationHistoryRecord[];
  workflowByArticle: Record<string, {
    stage: ArticleWorkflowStage;
    label?: string;
    locks: { canEdit: boolean; canQueue: boolean; canCancel: boolean; canTrash: boolean };
    operations?: { edit: ArticleOperation; queue: ArticleOperation; retarget: ArticleOperation; trash: ArticleOperation };
    primaryAction: string;
    allowedBulkActions: string[];
    publicationSummary: PublicationHistorySummary;
    reasonCodes?: string[];
    reasonMessage?: string | null;
  }>;
  submissionPlatforms: ContentSubmissionPlatform[];
};

export type GeneratedArticlesCommandName =
  | 'cancelContentSubmissionBatch'
  | 'cleanupFailedContentSubmissionItems'
  | 'createContentSubmissionBatch'
  | 'admitRegularQueueItems'
  | 'exportToSubmissionQueue'
  | 'getContentArticleRemovalTransaction'
  | 'permanentlyDeleteContentArticle'
  | 'preparePermanentDeleteContentArticle'
  | 'previewCleanupFailedContentSubmissionItems'
  | 'previewContentArticleRemoval'
  | 'previewContentSubmissionBatch'
  | 'previewRegularQueueAdmission'
  | 'previewExport'
  | 'reconcilePublication'
  | 'restoreContentArticle'
  | 'removePendingQueueItems'
  | 'retryContentArticleRemovalTransaction'
  | 'trashContentArticles';

export type GeneratedArticlesCommands = Record<
  GeneratedArticlesCommandName,
  (input?: any) => Promise<any>
>;

export interface GeneratedArticlesViewProps {
  clientId: string;
  management: ArticleManagementReadModel;
  query: { loading: boolean; error?: { userMessage?: string } | null };
  commands: GeneratedArticlesCommands;
  commandStates: Record<string, { busy: boolean; error?: { userMessage?: string } | null }>;
  removal: {
    transactionId: string | null;
    transaction: ArticleRemovalTransaction | null;
    query: { loading: boolean; error?: { userMessage?: string } | null };
  };
  watchRemovalTransaction: (transactionId: string) => Promise<unknown>;
  stageFilter?: ArticleWorkflowStage | 'all';
  dirtyArticleId?: string | null;
  selectedAttentionId?: string;
  onArticleSelect: (article: GeneratedContentArticle, source?: HTMLElement | null, published?: boolean) => void;
  onStageFilterChange?: (stage: ArticleWorkflowStage | 'all') => void;
  onOpenOrders?: () => void;
}

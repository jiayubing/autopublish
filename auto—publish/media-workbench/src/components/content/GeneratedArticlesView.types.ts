import type {
  ArticleAttentionItem,
  ArticleRemovalTransaction,
  ArticleTrashRecord,
  ContentSubmissionBatchRecord,
  ContentSubmissionCancellationPreview,
  ContentSubmissionPlatform,
  PublicationHistoryRecord,
  PublicationHistorySummary,
  PublicationArchiveEntry,
} from "../../types/publication";
import type { GeneratedContentArticle } from "../../types/generation";
import type {
  ContentClient,
  ContentCommandStaleResult,
  LiejuPublicationProfile,
} from "../../types/content";
import type {
  ArticleOperation,
  ArticleWorkflowFilter,
  ArticleWorkflowStage,
} from "../../article-workflow";

export type ArticleManagementReadModel = {
  articles: GeneratedContentArticle[];
  trash: ArticleTrashRecord[];
  submissionBatches: ContentSubmissionBatchRecord[];
  cancellationPlans: ContentSubmissionCancellationPreview[];
  publicationRecords: PublicationHistoryRecord[];
  publishedArchives?: PublicationArchiveEntry[];
  workflowByArticle: Record<
    string,
    {
      stage: ArticleWorkflowStage;
      label?: string;
      locks: {
        canEdit: boolean;
        canSubmit: boolean;
        canQueue: boolean;
        canCancel: boolean;
        canTrash: boolean;
      };
      operations?: {
        edit: ArticleOperation;
        submit: ArticleOperation;
        queue: ArticleOperation;
        retarget: ArticleOperation;
        trash: ArticleOperation;
        restore: ArticleOperation;
        purge: ArticleOperation;
      };
      primaryAction: string;
      allowedBulkActions: string[];
      publicationSummary: PublicationHistorySummary;
      reasonCodes?: string[];
      reasonMessage?: string | null;
      attentionCount: number;
      orderSummary: import("../../article-workflow").ArticleOrderSummary;
    }
  >;
  submissionPlatforms: ContentSubmissionPlatform[];
};

export type GeneratedArticlesCommandName =
  | "admitRegularQueueItems"
  | "prepareBindPaidOrderNumber"
  | "bindPaidOrderNumber"
  | "prepareConfirmPaidOrderAbsent"
  | "confirmPaidOrderAbsent"
  | "getContentArticleRemovalTransaction"
  | "permanentlyDeleteContentArticle"
  | "preparePermanentDeleteContentArticle"
  | "previewContentArticleRemoval"
  | "previewRegularQueueAdmission"
  | "prepareRegularUncertainResolution"
  | "confirmRegularAccepted"
  | "confirmRegularNotAccepted"
  | "restoreContentArticle"
  | "retryContentArticleRemovalTransaction"
  | "trashContentArticles";

export type GeneratedArticlesCommands = Record<
  GeneratedArticlesCommandName,
  (input?: any) => Promise<any>
>;

export interface GeneratedArticlesViewProps {
  clientId: string;
  client?: ContentClient;
  saveClientLiejuPublicationProfile: (input: {
    clientId: string;
    profile: LiejuPublicationProfile;
  }) => Promise<LiejuPublicationProfile | ContentCommandStaleResult>;
  management: ArticleManagementReadModel;
  query: { loading: boolean; error?: { userMessage?: string } | null };
  commands: GeneratedArticlesCommands;
  commandStates: Record<
    string,
    { busy: boolean; error?: { userMessage?: string } | null }
  >;
  removal: {
    transactionId: string | null;
    transaction: ArticleRemovalTransaction | null;
    query: { loading: boolean; error?: { userMessage?: string } | null };
  };
  watchRemovalTransaction: (transactionId: string) => Promise<unknown>;
  stageFilter?: ArticleWorkflowFilter;
  generationBatchId?: string | null;
  onClearGenerationBatchFilter?: () => void;
  dirtyArticleId?: string | null;
  selectedAttentionId?: string;
  onArticleSelect: (
    article: GeneratedContentArticle,
    source?: HTMLElement | null,
    published?: boolean,
  ) => void;
  onStageFilterChange?: (stage: ArticleWorkflowFilter) => void;
  onOpenOrders?: () => void;
  onOpenSubmissionCenter?: () => void;
}

import type {
  ArticlePermanentDeleteConfirmation,
  ArticlePermanentDeleteRequest,
  ArticlePermanentDeleteResult,
  ArticleRemovalTransaction,
  ArticleSelection,
  ArticleTrashCommitInput,
  ArticleTrashPreview,
  ArticleTrashResult,
  ArticleTrashRecord,
  ContentSubmissionPlatform,
  PublicationHistoryRecord,
  PublicationHistorySummary,
  PublicationArchiveEntry,
} from "../../types/publication";
import type { GeneratedContentArticle } from "../../types/generation";
import type { MediaResource } from "../../types/media";
import type {
  ContentClient,
  ContentCommandStaleResult,
  LiejuPublicationProfile,
} from "../../types/content";
import type { SubmissionIntakeCommands } from "./use-submission-intake-session";
import type {
  ArticleOperation,
  ArticleWorkflowFilter,
  ArticleWorkflowStage,
} from "../../article-workflow";

export interface FavoriteMediaPage {
  items: MediaResource[];
  total: number;
  page: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  loading: boolean;
  errorMessage?: string;
}

export type ArticleManagementReadModel = {
  articles: GeneratedContentArticle[];
  trash: ArticleTrashRecord[];
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
        canCancel: boolean;
        canTrash: boolean;
      };
      operations?: {
        edit: ArticleOperation;
        submit: ArticleOperation;
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
  lifecycleCounts?: {
    pending_submission: number;
    needs_completion: number;
    in_submission: number;
    published: number;
    trash: number;
    total: number;
  };
};

export type ArticleWorkflow = ArticleManagementReadModel["workflowByArticle"][string];

export type ArticleRemovalCommandResult<T> = T | ContentCommandStaleResult;

export type ArticleRemovalSessionCommands = {
  previewContentArticleRemoval: (input: {
    selections: ArticleSelection[];
  }) => Promise<ArticleRemovalCommandResult<ArticleTrashPreview>>;
  trashContentArticles: (
    input: ArticleTrashCommitInput,
  ) => Promise<ArticleRemovalCommandResult<ArticleTrashResult>>;
  retryContentArticleRemovalTransaction: (input: {
    transactionId: string;
  }) => Promise<ArticleRemovalCommandResult<ArticleRemovalTransaction>>;
  restoreContentArticle: (
    input: ArticleSelection,
  ) => Promise<ArticleRemovalCommandResult<GeneratedContentArticle>>;
  preparePermanentDeleteContentArticle: (
    input: ArticleSelection,
  ) => Promise<
    ArticleRemovalCommandResult<ArticlePermanentDeleteConfirmation>
  >;
  permanentlyDeleteContentArticle: (
    input: ArticlePermanentDeleteRequest,
  ) => Promise<ArticleRemovalCommandResult<ArticlePermanentDeleteResult>>;
};

export type GeneratedArticlesCommands = SubmissionIntakeCommands &
  ArticleRemovalSessionCommands & {
    openPublicationUrl: (input: {
      publicationId: string;
    }) => Promise<{ completed: boolean } | ContentCommandStaleResult>;
  };

export type ArticleRemovalFeatureSnapshot = {
  transactionId: string | null;
  transaction: ArticleRemovalTransaction | null;
  query: { loading: boolean; error?: { userMessage?: string } | null };
};

export interface GeneratedArticlesViewProps {
  clientId: string;
  workspaceScopeKey: string;
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
  removal: ArticleRemovalFeatureSnapshot;
  watchRemovalTransaction: (transactionId: string) => Promise<boolean>;
  stageFilter?: ArticleWorkflowFilter;
  generationBatchId?: string | null;
  articleId?: string | null;
  onClearGenerationBatchFilter?: () => void;
  onGenerationBatchFilterChange?: (batchId: string | null) => void;
  dirtyArticleId?: string | null;
  favoriteMediaPage?: FavoriteMediaPage;
  onFavoriteMediaPageChange?: (page: number) => void;
  onArticleSelect: (
    article: GeneratedContentArticle,
    source?: HTMLElement | null,
    published?: boolean,
  ) => void;
  onStageFilterChange?: (stage: ArticleWorkflowFilter) => void;
  onOpenOrders?: () => void;
  onOpenAttention?: () => void;
}

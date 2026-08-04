import type {
  ArticlePermanentDeleteConfirmation,
  ArticlePermanentDeleteRequest,
  ArticlePermanentDeleteResult,
  ArticleRemovalTransaction,
  ArticleReviewSelection,
  ArticleTrashCommitInput,
  ArticleTrashImpactItem,
  ArticleTrashPreview,
  ArticleTrashResult,
  ArticleTrashRecord,
  TrashedArticleQueueResidueItem,
  TrashedArticleQueueResiduePreview,
} from "../types/publication";
import type { GeneratedContentArticle } from "../types/generation";
import { ipcError, requireBridgeApi } from "./transport";

type SafeContentIpcError = {
  code: string;
  category:
    | "validation"
    | "authentication"
    | "transport"
    | "remote"
    | "storage"
    | "conflict"
    | "internal";
  retryability: "never" | "safe" | "manual-check";
  userMessage: string;
  diagnosticId?: string;
};
type ContentIpcResponse<T> =
  | { ok: true; data?: T }
  | { ok: false; error?: SafeContentIpcError };

type CoreContentRemovalApi = {
  previewArticleRemovalImpact: (input: {
    articles: ArticleReviewSelection[];
    selections: ArticleReviewSelection[];
  }) => Promise<ContentIpcResponse<ArticleTrashPreview>>;
  applyArticleRemovalImpact: (
    input: ArticleTrashCommitInput,
  ) => Promise<ContentIpcResponse<ArticleTrashResult>>;
  trashArticles: (
    input: ArticleTrashCommitInput,
  ) => Promise<ContentIpcResponse<ArticleTrashResult>>;
  getArticleRemovalTransaction: (
    transactionId: string,
  ) => Promise<
    ContentIpcResponse<{ transaction: ArticleRemovalTransaction | null }>
  >;
  retryArticleRemovalTransaction: (input: {
    transactionId: string;
    confirmed: true;
  }) => Promise<ContentIpcResponse<{ transaction: ArticleRemovalTransaction }>>;
  restoreArticle: (input: ArticleReviewSelection) => Promise<
    ContentIpcResponse<{
      article: GeneratedContentArticle;
      restored: boolean;
      queueRestored: boolean;
      message: string;
    }>
  >;
  preparePermanentDeleteArticle: (
    input: ArticleReviewSelection,
  ) => Promise<ContentIpcResponse<ArticlePermanentDeleteConfirmation>>;
  permanentlyDeleteArticle: (
    input: ArticlePermanentDeleteRequest,
  ) => Promise<ContentIpcResponse<ArticlePermanentDeleteResult>>;
  onArticleRemovalTransaction: (
    listener: (transaction: ArticleRemovalTransaction) => void,
  ) => () => void;
};

type SubmissionContentRemovalApi = {
  previewTrashedArticleQueueResidue: () => Promise<
    ContentIpcResponse<TrashedArticleQueueResiduePreview>
  >;
  cleanupTrashedArticleQueueResidue: (input: {
    confirmed: true;
  }) => Promise<
    ContentIpcResponse<
      TrashedArticleQueueResiduePreview & { cleanedCount: number }
    >
  >;
};

async function callCoreRemoval<TWire, TResult = TWire>(
  invoke: (
    api: CoreContentRemovalApi,
  ) => Promise<ContentIpcResponse<TWire>>,
  message: string,
  map?: (wire: TWire) => TResult,
): Promise<TResult> {
  const api = requireBridgeApi<CoreContentRemovalApi>("content");
  const result = await invoke(api);
  if (result.ok === false) throw ipcError(result.error, message);
  if (result.data === undefined || result.data === null)
    throw ipcError(undefined, message);
  return map ? map(result.data) : (result.data as unknown as TResult);
}

async function callSubmissionRemoval<TWire, TResult = TWire>(
  invoke: (
    api: SubmissionContentRemovalApi,
  ) => Promise<ContentIpcResponse<TWire>>,
  message: string,
): Promise<TResult> {
  const api = requireBridgeApi<SubmissionContentRemovalApi>("content");
  const result = await invoke(api);
  if (result.ok === false) throw ipcError(result.error, message);
  if (result.data === undefined || result.data === null)
    throw ipcError(undefined, message);
  return result.data as unknown as TResult;
}

export async function trashContentArticles(
  input: ArticleTrashCommitInput & { articles: ArticleReviewSelection[] },
): Promise<ArticleTrashResult> {
  const request: ArticleTrashCommitInput = input.legacy
    ? { articles: input.articles, confirmed: true }
    : { ...input, selections: input.articles };
  return callCoreRemoval(
    (api) =>
      input.legacy
        ? api.trashArticles(request)
        : api.applyArticleRemovalImpact(request),
    "Unable to move articles to trash",
  );
}

export async function previewContentArticleRemoval(
  articles: ArticleReviewSelection[],
): Promise<ArticleTrashPreview> {
  return callCoreRemoval(
    (api) =>
      api.previewArticleRemovalImpact({ selections: articles, articles }),
    "Unable to preview moving articles to trash",
  );
}

export async function previewTrashedArticleQueueResidue(): Promise<TrashedArticleQueueResiduePreview> {
  return callSubmissionRemoval(
    (api) => api.previewTrashedArticleQueueResidue(),
    "Unable to inspect trashed article queue residue",
  );
}

export async function cleanupTrashedArticleQueueResidue(): Promise<
  TrashedArticleQueueResiduePreview & { cleanedCount: number }
> {
  return callSubmissionRemoval(
    (api) => api.cleanupTrashedArticleQueueResidue({ confirmed: true }),
    "Unable to clean trashed article queue residue",
  );
}

export async function getContentArticleRemovalTransaction(
  transactionId: string,
): Promise<ArticleRemovalTransaction | null> {
  const result = await callCoreRemoval(
    (api) => api.getArticleRemovalTransaction(transactionId),
    "Unable to read article removal transaction",
  );
  return result.transaction;
}

export function onContentArticleRemovalTransaction(
  transactionId: string,
  listener: (transaction: ArticleRemovalTransaction) => void,
): () => void {
  const subscribe =
    requireBridgeApi<CoreContentRemovalApi>("content")
      .onArticleRemovalTransaction;
  return subscribe((transaction) => {
    const id =
      transaction.transactionId ||
      (transaction as ArticleRemovalTransaction & { id?: string }).id;
    if (id === transactionId) listener(transaction);
  });
}

export async function retryContentArticleRemovalTransaction(
  transactionId: string,
): Promise<ArticleRemovalTransaction> {
  const result = await callCoreRemoval(
    (api) =>
      api.retryArticleRemovalTransaction({ transactionId, confirmed: true }),
    "Unable to repair article removal transaction",
  );
  return result.transaction;
}

export async function restoreContentArticle(
  input: ArticleReviewSelection,
): Promise<GeneratedContentArticle> {
  return callCoreRemoval(
    (api) => api.restoreArticle(input),
    "Unable to restore article",
    (wire) => wire.article,
  );
}

export async function preparePermanentDeleteContentArticle(
  input: ArticleReviewSelection,
): Promise<ArticlePermanentDeleteConfirmation> {
  return callCoreRemoval(
    (api) => api.preparePermanentDeleteArticle(input),
    "Unable to prepare permanent article deletion",
  );
}

export async function permanentlyDeleteContentArticle(
  input: ArticlePermanentDeleteRequest,
): Promise<ArticlePermanentDeleteResult> {
  return callCoreRemoval(
    (api) => api.permanentlyDeleteArticle(input),
    "Unable to permanently delete article",
  );
}

export type {
  ArticlePermanentDeleteConfirmation,
  ArticlePermanentDeleteRequest,
  ArticlePermanentDeleteResult,
  ArticleRemovalTransaction,
  ArticleReviewSelection,
  ArticleTrashCommitInput,
  ArticleTrashImpactItem,
  ArticleTrashPreview,
  ArticleTrashResult,
  ArticleTrashRecord,
  TrashedArticleQueueResidueItem,
  TrashedArticleQueueResiduePreview,
  GeneratedContentArticle,
};

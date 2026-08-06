import type {
  ArticlePermanentDeleteConfirmation,
  ArticlePermanentDeleteRequest,
  ArticlePermanentDeleteResult,
  ArticleRemovalTransaction,
  ArticleSelection,
  ArticleTrashCommitInput,
  ArticleTrashImpactItem,
  ArticleTrashPreview,
  ArticleTrashResult,
  ArticleTrashRecord,
  TrashedArticleQueueResidueItem,
  TrashedArticleQueueResiduePreview,
} from "../types/publication";
import type { GeneratedContentArticle } from "../types/generation";
import { ipcError, requireBridgeMethod, requireContentApi } from "./transport";

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
  { ok: true; data?: T } | { ok: false; error?: SafeContentIpcError };

type CoreContentRemovalApi = {
  previewArticleRemovalImpact: (input: {
    selections: ArticleSelection[];
  }) => Promise<ContentIpcResponse<ArticleTrashPreview>>;
  applyArticleRemovalImpact: (
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
  restoreArticle: (input: ArticleSelection) => Promise<
    ContentIpcResponse<{
      article: GeneratedContentArticle;
      restored: boolean;
      queueRestored: boolean;
      message: string;
    }>
  >;
  preparePermanentDeleteArticle: (
    input: ArticleSelection,
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
  invoke: (api: CoreContentRemovalApi) => Promise<ContentIpcResponse<TWire>>,
  message: string,
  map?: (wire: TWire) => TResult,
): Promise<TResult> {
  const api = requireContentApi<CoreContentRemovalApi>();
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
  const api = requireContentApi<SubmissionContentRemovalApi>();
  const result = await invoke(api);
  if (result.ok === false) throw ipcError(result.error, message);
  if (result.data === undefined || result.data === null)
    throw ipcError(undefined, message);
  return result.data as unknown as TResult;
}

export async function trashContentArticles(
  input: ArticleTrashCommitInput,
): Promise<ArticleTrashResult> {
  return callCoreRemoval(
    (api) => requireBridgeMethod(api.applyArticleRemovalImpact)(input),
    "Unable to move articles to trash",
  );
}

export async function previewContentArticleRemoval(
  articles: ArticleSelection[],
): Promise<ArticleTrashPreview> {
  return callCoreRemoval(
    (api) =>
      requireBridgeMethod(api.previewArticleRemovalImpact)({
        selections: articles,
      }),
    "Unable to preview moving articles to trash",
  );
}

export async function previewTrashedArticleQueueResidue(): Promise<TrashedArticleQueueResiduePreview> {
  return callSubmissionRemoval(
    (api) => requireBridgeMethod(api.previewTrashedArticleQueueResidue)(),
    "Unable to inspect trashed article queue residue",
  );
}

export async function cleanupTrashedArticleQueueResidue(): Promise<
  TrashedArticleQueueResiduePreview & { cleanedCount: number }
> {
  return callSubmissionRemoval(
    (api) =>
      requireBridgeMethod(api.cleanupTrashedArticleQueueResidue)({
        confirmed: true,
      }),
    "Unable to clean trashed article queue residue",
  );
}

export async function getContentArticleRemovalTransaction(
  transactionId: string,
): Promise<ArticleRemovalTransaction | null> {
  const result = await callCoreRemoval(
    (api) =>
      requireBridgeMethod(api.getArticleRemovalTransaction)(transactionId),
    "Unable to read article removal transaction",
  );
  return result.transaction;
}

export function onContentArticleRemovalTransaction(
  transactionId: string,
  listener: (transaction: ArticleRemovalTransaction) => void,
): () => void {
  const subscribe = requireBridgeMethod(
    requireContentApi<CoreContentRemovalApi>().onArticleRemovalTransaction,
  );
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
      requireBridgeMethod(api.retryArticleRemovalTransaction)({
        transactionId,
        confirmed: true,
      }),
    "Unable to repair article removal transaction",
  );
  return result.transaction;
}

export async function restoreContentArticle(
  input: ArticleSelection,
): Promise<GeneratedContentArticle> {
  return callCoreRemoval(
    (api) => requireBridgeMethod(api.restoreArticle)(input),
    "Unable to restore article",
    (wire) => wire.article,
  );
}

export async function preparePermanentDeleteContentArticle(
  input: ArticleSelection,
): Promise<ArticlePermanentDeleteConfirmation> {
  return callCoreRemoval(
    (api) => requireBridgeMethod(api.preparePermanentDeleteArticle)(input),
    "Unable to prepare permanent article deletion",
  );
}

export async function permanentlyDeleteContentArticle(
  input: ArticlePermanentDeleteRequest,
): Promise<ArticlePermanentDeleteResult> {
  return callCoreRemoval(
    (api) => requireBridgeMethod(api.permanentlyDeleteArticle)(input),
    "Unable to permanently delete article",
  );
}

export type {
  ArticlePermanentDeleteConfirmation,
  ArticlePermanentDeleteRequest,
  ArticlePermanentDeleteResult,
  ArticleRemovalTransaction,
  ArticleSelection,
  ArticleTrashCommitInput,
  ArticleTrashImpactItem,
  ArticleTrashPreview,
  ArticleTrashResult,
  ArticleTrashRecord,
  TrashedArticleQueueResidueItem,
  TrashedArticleQueueResiduePreview,
  GeneratedContentArticle,
};

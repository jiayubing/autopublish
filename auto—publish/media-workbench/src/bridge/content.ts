import type {
  ArticleManagementSnapshot,
  ArticleRemovalTransaction,
  ArticleReviewResult,
  ArticleReviewSelection,
  ArticleTrashRecord,
  ContentClient,
  ContentMaterial,
  ContentQuestion,
  ContentResearch,
  ContentSubmissionActionPlanItem,
  ContentSubmissionBatchInput,
  ContentSubmissionBatchItem,
  ContentSubmissionBatchPreview,
  ContentSubmissionBatchRecord,
  ContentSubmissionCancellationPreview,
  ContentSubmissionCleanupPreview,
  ContentSubmissionCleanupResult,
  ContentSubmissionPlatform,
  ContentTemplate,
  ContentTemplateCatalog,
  DoubaoBatchMode,
  DoubaoBatchPreview,
  DoubaoBatchTask,
  DoubaoLoginState,
  DoubaoQueueState,
  FailedPublicationRetryPreview,
  FailedPublicationRetryResult,
  GeneratedContentArticle,
  GenerationBatch,
  GenerationBatchCancelPreview,
  GenerationBatchPreview,
  GenerationBatchSourceSelection,
  GenerationBatchState,
  GenerationBatchTemplateSelection,
  GenerationSubmissionHandoffPreview,
  GenerationSubmissionHandoffResult,
  IpcResponse,
  WorkspaceDataInvalidatedEvent,
} from "../types";
import { ipcError, isElectron, unavailable } from "./transport";

export type { ArticleTrashRecord } from "../types";

export interface ContentExportInput {
  clientId: string;
  generatedArticleId: string;
  targetPlatform: string;
  mediaResourceId?: string;
  confirmed: true;
}
export interface ContentExportPreview {
  filename: string;
  targetPlatform: string;
  contentHash: string;
  markdown: string;
  status:
    | "queued"
    | "queueable"
    | "idempotent"
    | "blockedPublished"
    | "blockedUncertain"
    | "conflict";
  publicationId?: string | null;
  attemptId?: string | null;
  articleKey?: string;
  targetKey?: string;
  publicationStatus?: string | null;
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
  legacy?: boolean;
  transactionId?: string | null;
  openTransactionId?: string | null;
  transaction?: ArticleRemovalTransaction | null;
  openTransaction?: ArticleRemovalTransaction | null;
}
export interface ArticleTrashCommitInput {
  articles?: ArticleReviewSelection[];
  selections?: ArticleReviewSelection[];
  token?: string;
  legacy?: boolean;
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

type ContentCommand = (...args: unknown[]) => Promise<IpcResponse<unknown>>;

async function callContent<T>(
  method: string,
  args: unknown[],
  message: string,
  fallback?: T,
  hasFallback = false,
): Promise<T> {
  if (!isElectron()) {
    if (hasFallback) return fallback as T;
    throw unavailable(message);
  }
  const api = window.desktopConsole?.content as unknown as
    Record<string, unknown> | undefined;
  const command = api?.[method] as ContentCommand | undefined;
  if (typeof command !== "function") {
    if (hasFallback) return fallback as T;
    throw unavailable(message);
  }
  const result = (await command(...args)) as IpcResponse<T>;
  if (!result.ok) throw ipcError(result.error, message);
  if (result.data === undefined || result.data === null) {
    if (hasFallback) return fallback as T;
    throw ipcError(result.error, message);
  }
  return result.data;
}

function emptySnapshot(clientId: string): ArticleManagementSnapshot {
  return {
    clientId,
    revision: 0,
    articles: [],
    trash: [],
    submissionBatches: [],
    cancellationPlans: [],
    publicationRecords: [],
    attention: { revision: 0, items: [], counts: { total: 0, actionable: 0 } },
    submissionPlatforms: [],
    workflowByArticle: {},
    publicationSummaries: {},
  };
}

function normalizeLoginState(
  raw: Record<string, unknown> | undefined,
): DoubaoLoginState {
  const status = raw?.status;
  if (status === "authenticated" || status === "login_required")
    return { status };
  if (
    status === "session_error" ||
    status === "challenge" ||
    status === "page_error"
  )
    return {
      status: "session_error",
      errorText: typeof raw?.errorText === "string" ? raw.errorText : undefined,
    };
  return { status: "unknown" };
}

const DOUBAO_LOGIN_STATE_KEY = "auto-publish:doubao-login-state";

export function getCachedDoubaoLoginState(): DoubaoLoginState {
  if (typeof localStorage === "undefined") return { status: "unknown" };
  try {
    const saved = JSON.parse(
      localStorage.getItem(DOUBAO_LOGIN_STATE_KEY) || "null",
    ) as { status?: unknown } | null;
    if (saved?.status === "authenticated" || saved?.status === "login_required")
      return { status: saved.status };
  } catch (_) {}
  return { status: "unknown" };
}

export function rememberDoubaoLoginState(state: DoubaoLoginState): void {
  if (state.status !== "authenticated" && state.status !== "login_required")
    return;
  try {
    localStorage.setItem(
      DOUBAO_LOGIN_STATE_KEY,
      JSON.stringify({ status: state.status }),
    );
  } catch (_) {}
}

export async function listContentClients(): Promise<ContentClient[]> {
  return callContent("listClients", [], "Unable to load clients", [], true);
}
export async function listContentResearch(
  clientId: string,
): Promise<ContentResearch[]> {
  return callContent(
    "listResearch",
    [clientId],
    "Unable to load research",
    [],
    true,
  );
}
export async function listContentQuestions(
  clientId: string,
): Promise<ContentQuestion[]> {
  return callContent(
    "listQuestions",
    [clientId],
    "Unable to load questions",
    [],
    true,
  );
}
export async function createContentQuestion(input: {
  clientId: string;
  text: string;
  enabled?: boolean;
}): Promise<ContentQuestion> {
  return callContent("createQuestion", [input], "Unable to create question");
}
export async function updateContentQuestion(input: {
  clientId: string;
  questionId: string;
  text?: string;
  enabled?: boolean;
}): Promise<ContentQuestion> {
  return callContent("updateQuestion", [input], "Unable to update question");
}
export async function deleteContentQuestion(input: {
  clientId: string;
  questionId: string;
}): Promise<ContentQuestion> {
  return callContent("deleteQuestion", [input], "Unable to delete question");
}

export async function getDoubaoLoginStatus(): Promise<DoubaoLoginState> {
  const raw = await callContent<Record<string, unknown>>(
    "getDoubaoLoginState",
    [],
    "Unable to read Doubao login state",
    { status: "unknown" },
    true,
  );
  return normalizeLoginState(raw);
}
export const getDoubaoLoginState = getDoubaoLoginStatus;
export async function openDoubaoLogin(): Promise<DoubaoLoginState> {
  const raw = await callContent<Record<string, unknown>>(
    "openDoubaoLogin",
    [],
    "Unable to open Doubao login",
  );
  return normalizeLoginState(raw);
}
export async function collectDoubaoQuestion(input: {
  clientId: string;
  questionId: string;
  force?: boolean;
}): Promise<ContentResearch> {
  return callContent(
    "collectDoubaoOne",
    [input],
    "Unable to collect Doubao answer",
  );
}
export async function previewDoubaoBatch(input: {
  clientIds: string[];
  mode: DoubaoBatchMode;
}): Promise<DoubaoBatchPreview> {
  return callContent(
    "previewDoubaoBatch",
    [input],
    "Unable to preview Doubao batch",
  );
}
export async function startDoubaoBatch(
  tasks: Array<{ clientId: string; questionId: string; force?: boolean }>,
): Promise<DoubaoQueueState> {
  return callContent(
    "startDoubaoBatch",
    [tasks],
    "Unable to start Doubao batch",
  );
}
export async function startPreparedDoubaoBatch(
  tasks: DoubaoBatchTask[],
): Promise<DoubaoQueueState> {
  return callContent(
    "startPreparedDoubaoBatch",
    [{ tasks }],
    "Unable to start prepared Doubao batch",
  );
}
export async function pauseDoubaoBatch(): Promise<DoubaoQueueState> {
  return callContent("pauseDoubaoBatch", [], "Unable to pause Doubao batch");
}
export async function resumeDoubaoBatch(): Promise<DoubaoQueueState> {
  return callContent("resumeDoubaoBatch", [], "Unable to resume Doubao batch");
}
export async function stopDoubaoBatch(): Promise<DoubaoQueueState> {
  return callContent("stopDoubaoBatch", [], "Unable to stop Doubao batch");
}
export async function retryFailedDoubao(): Promise<DoubaoQueueState> {
  return callContent("retryFailedDoubao", [], "Unable to retry Doubao tasks");
}
export async function getDoubaoQueueState(): Promise<DoubaoQueueState> {
  return callContent("getDoubaoQueueState", [], "Unable to read Doubao queue");
}
export function subscribeDoubaoQueue(
  listener: (state: DoubaoQueueState) => void,
): () => void {
  if (!isElectron()) return () => {};
  const subscribe = (
    window.desktopConsole?.content as unknown as
      | {
          onDoubaoQueueState?: (
            value: (state: DoubaoQueueState) => void,
          ) => () => void;
        }
      | undefined
  )?.onDoubaoQueueState;
  return typeof subscribe === "function" ? subscribe(listener) : () => {};
}
export async function saveManualResearch(input: {
  clientId: string;
  questionId: string;
  answerText: string;
  references: ContentResearch["references"];
}): Promise<ContentResearch> {
  return callContent(
    "saveManualResearch",
    [input],
    "Unable to save manual research",
  );
}

export async function getGenerationBatchState(): Promise<GenerationBatchState> {
  return callContent(
    "getGenerationBatchState",
    [],
    "Unable to read generation batch state",
    { state: "idle", status: "idle" },
    true,
  );
}
export async function previewGenerationBatch(input: {
  clientIds: string[];
  templates: GenerationBatchTemplateSelection[];
  clientSources?: GenerationBatchSourceSelection[];
  templateCatalogRevision?: string;
}): Promise<GenerationBatchPreview> {
  return callContent(
    "previewGenerationBatch",
    [input],
    "Unable to preview generation batch",
    {
      clientCount: input.clientIds.length,
      executableClientCount: 0,
      taskCount: 0,
      executableTaskCount: 0,
      excludedTaskCount: 0,
      excludedClients: [],
      templates: input.templates,
      clientSources: [],
    },
    true,
  );
}
export async function createGenerationBatch(input: {
  clientIds: string[];
  templates: GenerationBatchTemplateSelection[];
  clientSources?: GenerationBatchSourceSelection[];
  templateCatalogRevision?: string;
}): Promise<GenerationBatch> {
  return callContent(
    "createGenerationBatch",
    [input],
    "Unable to create generation batch",
  );
}
export async function createAndStartGenerationBatch(input: {
  clientIds: string[];
  templates: GenerationBatchTemplateSelection[];
  clientSources?: GenerationBatchSourceSelection[];
  templateCatalogRevision?: string;
}): Promise<GenerationBatch> {
  return callContent(
    "createAndStartGenerationBatch",
    [input],
    "Unable to create and start generation batch",
  );
}
export async function listGenerationBatches(): Promise<GenerationBatch[]> {
  return callContent(
    "listGenerationBatches",
    [],
    "Unable to list generation batches",
    [],
    true,
  );
}
export async function getGenerationBatch(
  batchId: string,
): Promise<GenerationBatch> {
  return callContent(
    "getGenerationBatch",
    [batchId],
    "Unable to read generation batch",
  );
}
export async function startGenerationBatch(input: {
  batchId?: string;
  clientIds?: string[];
  templates?: GenerationBatchTemplateSelection[];
  clientSources?: GenerationBatchSourceSelection[];
}): Promise<GenerationBatch> {
  return callContent(
    "startGenerationBatch",
    [input],
    "Unable to start generation batch",
  );
}
export async function pauseGenerationBatch(input?: {
  batchId?: string;
}): Promise<GenerationBatch | null> {
  return callContent(
    "pauseGenerationBatch",
    [input],
    "Unable to pause generation batch",
    null,
    true,
  );
}
export async function stopGenerationBatch(input?: {
  batchId?: string;
}): Promise<GenerationBatch | null> {
  return callContent(
    "stopGenerationBatch",
    [input],
    "Unable to stop generation batch",
    null,
    true,
  );
}
export async function resumeGenerationBatch(input: {
  batchId: string;
  confirmConfigChange?: boolean;
}): Promise<GenerationBatch> {
  return callContent(
    "resumeGenerationBatch",
    [input],
    "Unable to resume generation batch",
  );
}
export async function continueGenerationBatch(input: {
  batchId: string;
  confirmConfigChange?: boolean;
}): Promise<GenerationBatch> {
  return callContent(
    "continueGenerationBatch",
    [input],
    "Unable to continue generation batch",
  );
}
export async function retryFailedGenerationBatch(input: {
  batchId: string;
}): Promise<GenerationBatch> {
  return callContent(
    "retryFailedGenerationBatch",
    [input],
    "Unable to retry failed generation batch",
  );
}
export function subscribeGenerationBatchState(
  listener: (state: GenerationBatchState) => void,
): () => void {
  if (!isElectron()) return () => {};
  const subscribe = (
    window.desktopConsole?.content as unknown as
      | {
          onGenerationBatchState?: (
            value: (state: GenerationBatchState) => void,
          ) => () => void;
        }
      | undefined
  )?.onGenerationBatchState;
  return typeof subscribe === "function" ? subscribe(listener) : () => {};
}
export async function getGenerationRuntimeSnapshot(): Promise<{
  runtimeId: string;
  sequence: number;
  runtime: GenerationBatchState;
  batch: GenerationBatch | null;
  capabilities: GenerationBatchState["capabilities"];
}> {
  return callContent(
    "getGenerationRuntimeSnapshot",
    [],
    "Unable to read generation runtime snapshot",
    {
      runtimeId: "renderer-fallback",
      sequence: 0,
      runtime: { state: "idle", status: "idle" },
      batch: null,
      capabilities: {},
    },
    true,
  );
}
export async function previewCancelPendingGenerationBatch(input: {
  batchId: string;
}): Promise<GenerationBatchCancelPreview> {
  return callContent(
    "previewCancelPendingGenerationBatch",
    [input],
    "Unable to preview pending generation cancellation",
    {
      batchId: input.batchId,
      pendingCount: 0,
      runningCount: 0,
      cancelledCount: 0,
      canCancel: false,
    },
    true,
  );
}
export async function cancelPendingGenerationBatch(input: {
  batchId: string;
  confirmed: true;
}): Promise<GenerationBatch> {
  return callContent(
    "cancelPendingGenerationBatch",
    [input],
    "Unable to cancel pending generation tasks",
  );
}

export async function listContentTemplates(
  platform?: string,
): Promise<ContentTemplate[]> {
  return callContent(
    "listTemplates",
    [platform],
    "Unable to load templates",
    [],
    true,
  );
}
export async function listContentTemplateCatalog(): Promise<ContentTemplateCatalog> {
  return callContent(
    "listTemplateCatalog",
    [],
    "Unable to load template catalog",
    { revision: "", platforms: [], templates: [], diagnostics: [] },
    true,
  );
}
export async function generateContentArticle(input: {
  clientId: string;
  materialIds: string[];
  researchQueryIds: string[];
  platform: string;
  templateId: string;
  templateCatalogRevision?: string;
}): Promise<GeneratedContentArticle> {
  return callContent("generateArticle", [input], "Unable to generate article");
}
export async function saveContentArticle(
  article: GeneratedContentArticle,
): Promise<GeneratedContentArticle> {
  return callContent("saveArticle", [article], "Unable to save article");
}
export async function listContentArticles(
  clientId: string,
): Promise<GeneratedContentArticle[]> {
  return callContent(
    "listGeneratedArticles",
    [clientId],
    "Unable to load generated articles",
    [],
    true,
  );
}
export async function retryContentMaterial(input: {
  clientId: string;
  materialId: string;
}): Promise<ContentMaterial> {
  return callContent("retryMaterial", [input], "Unable to retry material");
}
export async function reviewContentArticles(
  articles: ArticleReviewSelection[],
): Promise<ArticleReviewResult> {
  return callContent("reviewArticles", [articles], "Unable to review articles");
}
export async function listContentTrash(
  clientId: string,
): Promise<ArticleTrashRecord[]> {
  return callContent(
    "listArticleTrash",
    [clientId],
    "Unable to load article trash",
    [],
    true,
  );
}
export async function copyContentArticleVersion(input: {
  clientId: string;
  sourceArticleId: string;
}): Promise<GeneratedContentArticle> {
  return callContent(
    "copyArticleVersion",
    [input],
    "Unable to copy article version",
  );
}

export async function trashContentArticles(
  input: ArticleTrashCommitInput & { articles: ArticleReviewSelection[] },
): Promise<ArticleTrashResult> {
  if (!isElectron())
    throw unavailable("Article trash requires the desktop app");
  const content = window.desktopConsole!.content as unknown as Record<
    string,
    unknown
  >;
  const handler = (
    input.legacy
      ? content.trashArticles
      : content.applyArticleRemovalImpact || content.trashArticles
  ) as ContentCommand | undefined;
  if (typeof handler !== "function")
    throw unavailable("Article trash is unavailable");
  const request = input.legacy
    ? { articles: input.articles, confirmed: true }
    : { ...input, selections: input.articles };
  const result = (await handler(request)) as IpcResponse<ArticleTrashResult>;
  if (!result.ok || !result.data)
    throw ipcError(result.error, "Unable to move articles to trash");
  return result.data;
}
export async function getArticleManagementSnapshot(
  clientId: string,
): Promise<ArticleManagementSnapshot> {
  return callContent(
    "getArticleManagementSnapshot",
    [{ clientId }],
    "Unable to load article management snapshot",
    emptySnapshot(clientId),
    true,
  );
}
export async function previewContentArticleRemoval(
  articles: ArticleReviewSelection[],
): Promise<ArticleTrashPreview> {
  if (!isElectron())
    throw unavailable("Article trash preview requires the desktop app");
  const content = window.desktopConsole!.content as unknown as Record<
    string,
    unknown
  >;
  const handler = (content.previewTrashArticles ||
    content.previewArticleRemovalImpact) as ContentCommand | undefined;
  if (typeof handler !== "function")
    return {
      articleCount: articles.length,
      queuedToCancel: [],
      failedToClean: [],
      blockedItems: [],
      canCommit: true,
      selections: articles,
      legacy: true,
    };
  const result = (await handler({
    selections: articles,
    articles,
  })) as IpcResponse<ArticleTrashPreview>;
  if (!result.ok || !result.data)
    throw ipcError(result.error, "Unable to preview moving articles to trash");
  return result.data;
}
export async function previewTrashedArticleQueueResidue(): Promise<TrashedArticleQueueResiduePreview> {
  return callContent(
    "previewTrashedArticleQueueResidue",
    [],
    "Unable to inspect trashed article queue residue",
    {
      items: [],
      cleanableItems: [],
      reportedItems: [],
      cleanableCount: 0,
      reportedCount: 0,
    },
    true,
  );
}
export async function cleanupTrashedArticleQueueResidue(): Promise<
  TrashedArticleQueueResiduePreview & { cleanedCount: number }
> {
  return callContent(
    "cleanupTrashedArticleQueueResidue",
    [{ confirmed: true }],
    "Unable to clean trashed article queue residue",
    {
      items: [],
      cleanableItems: [],
      reportedItems: [],
      cleanableCount: 0,
      reportedCount: 0,
      cleanedCount: 0,
    },
    true,
  );
}
export async function getContentArticleRemovalTransaction(
  transactionId: string,
): Promise<ArticleRemovalTransaction | null> {
  return callContent(
    "getArticleRemovalTransaction",
    [transactionId],
    "Unable to read article removal transaction",
    null,
    true,
  );
}
export async function listContentArticleRemovalTransactions(): Promise<
  ArticleRemovalTransaction[]
> {
  return callContent(
    "listArticleRemovalTransactions",
    [],
    "Unable to list article removal transactions",
    [],
    true,
  );
}
export function onContentArticleRemovalTransaction(
  transactionId: string,
  listener: (transaction: ArticleRemovalTransaction) => void,
): () => void {
  if (!isElectron()) return () => {};
  const subscribe = (
    window.desktopConsole?.content as unknown as
      | {
          onArticleRemovalTransaction?: (
            value: (transaction: ArticleRemovalTransaction) => void,
          ) => () => void;
        }
      | undefined
  )?.onArticleRemovalTransaction;
  if (typeof subscribe !== "function") return () => {};
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
  return callContent(
    "retryArticleRemovalTransaction",
    [{ transactionId, confirmed: true }],
    "Unable to repair article removal transaction",
  );
}
export async function restoreContentArticle(
  input: ArticleReviewSelection,
): Promise<GeneratedContentArticle> {
  return callContent("restoreArticle", [input], "Unable to restore article");
}
export async function preparePermanentDeleteContentArticle(
  input: ArticleReviewSelection,
): Promise<ArticlePermanentDeleteConfirmation> {
  return callContent(
    "preparePermanentDeleteArticle",
    [input],
    "Unable to prepare permanent article deletion",
  );
}
export async function permanentlyDeleteContentArticle(
  input: ArticlePermanentDeleteRequest,
): Promise<ArticlePermanentDeleteResult> {
  return callContent(
    "permanentlyDeleteArticle",
    [input],
    "Unable to permanently delete article",
  );
}
export async function previewExport(
  input: ContentExportInput,
): Promise<ContentExportPreview> {
  return callContent("previewExport", [input], "preview export failed");
}
export async function exportToSubmissionQueue(
  input: ContentExportInput,
): Promise<ContentExportPreview> {
  return callContent("exportArticle", [input], "export failed");
}
export async function previewContentSubmissionBatch(
  input: ContentSubmissionBatchInput,
): Promise<ContentSubmissionBatchPreview> {
  return callContent(
    "previewSubmissionBatch",
    [input],
    "submission batch preview failed",
  );
}
export async function listContentSubmissionPlatforms(): Promise<
  ContentSubmissionPlatform[]
> {
  return callContent(
    "listSubmissionPlatforms",
    [],
    "submission platform discovery failed",
    [],
    true,
  );
}
export async function listContentSubmissionBatches(
  clientId: string,
): Promise<ContentSubmissionBatchRecord[]> {
  return callContent(
    "listSubmissionBatches",
    [{ clientId }],
    "submission batch history failed",
    [],
    true,
  );
}
export async function createContentSubmissionBatch(
  input: ContentSubmissionBatchInput & { confirmed: true },
): Promise<ContentSubmissionBatchPreview> {
  return callContent(
    "createSubmissionBatch",
    [input],
    "submission batch creation failed",
  );
}
export async function cancelContentSubmissionBatch(
  batchId: string,
  planId: string,
): Promise<{
  batchId: string;
  planId: string;
  cancelledCount: number;
  idempotentCount: number;
  blockedItems: ContentSubmissionActionPlanItem[];
  batchStatus: string;
  changedScopes: string[];
  items: ContentSubmissionBatchItem[];
}> {
  return callContent(
    "cancelSubmissionBatch",
    [{ batchId, planId, confirmed: true }],
    "submission batch cancellation failed",
  );
}
export async function previewCancelContentSubmissionBatch(
  batchId: string,
): Promise<ContentSubmissionCancellationPreview> {
  return callContent(
    "previewCancelSubmissionBatch",
    [{ batchId }],
    "submission batch cancellation preview failed",
  );
}
export async function previewCleanupFailedContentSubmissionItems(
  batchId: string,
): Promise<ContentSubmissionCleanupPreview> {
  return callContent(
    "previewCleanupFailedSubmissionItems",
    [{ batchId }],
    "failed submission cleanup preview failed",
  );
}
export async function cleanupFailedContentSubmissionItems(
  batchId: string,
): Promise<ContentSubmissionCleanupResult> {
  return callContent(
    "cleanupFailedSubmissionItems",
    [{ batchId, confirmed: true }],
    "failed submission cleanup failed",
  );
}
export async function previewGenerationSubmissionHandoff(input: {
  generationBatchId: string;
  targetPlatformIds: string[];
  accountProfiles: Record<string, string>;
}): Promise<GenerationSubmissionHandoffPreview> {
  return callContent(
    "previewGenerationSubmissionHandoff",
    [input],
    "Unable to preview generation submission handoff",
  );
}
export async function commitGenerationSubmissionHandoff(input: {
  generationBatchId: string;
  targetPlatformIds: string[];
  accountProfiles: Record<string, string>;
  previewToken: string;
  confirmed: true;
}): Promise<GenerationSubmissionHandoffResult> {
  return callContent(
    "commitGenerationSubmissionHandoff",
    [input],
    "Unable to commit generation submission handoff",
  );
}
export async function previewRetryFailedPublication(input: {
  publicationId: string;
}): Promise<FailedPublicationRetryPreview> {
  return callContent(
    "previewRetryFailedPublication",
    [input],
    "failed publication retry preview failed",
  );
}
export async function retryFailedPublication(input: {
  publicationId: string;
  expectedRevision?: number;
  confirmed: true;
}): Promise<FailedPublicationRetryResult> {
  return callContent(
    "retryFailedPublication",
    [input],
    "failed publication retry failed",
  );
}

export function onWorkspaceDataInvalidated(
  listener: (event: WorkspaceDataInvalidatedEvent) => void,
): () => void {
  if (!isElectron()) return () => {};
  const subscribe = window.desktopConsole?.workspaceData?.onInvalidated;
  return typeof subscribe === "function" ? subscribe(listener) : () => {};
}

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
type ArticleManagementSnapshotWire = Omit<
  ArticleManagementSnapshot,
  "workflowByArticle" | "publicationSummaries"
> & {
  workflowItems: Array<{
    articleId: string;
    workflow: ArticleManagementSnapshot["workflowByArticle"][string];
  }>;
  publicationSummaryItems: Array<{
    articleId: string;
    summary: ArticleManagementSnapshot["publicationSummaries"][string];
  }>;
};
type CoreContentApi = {
  listClients: () => Promise<ContentIpcResponse<{ clients: ContentClient[] }>>;
  listResearch: (
    clientId: string,
  ) => Promise<ContentIpcResponse<{ research: ContentResearch[] }>>;
  listTemplates: (
    platform?: string,
  ) => Promise<ContentIpcResponse<{ templates: ContentTemplate[] }>>;
  listTemplateCatalog: () => Promise<
    ContentIpcResponse<ContentTemplateCatalog>
  >;
  retryMaterial: (input: {
    clientId: string;
    materialId: string;
  }) => Promise<ContentIpcResponse<{ material: ContentMaterial }>>;
  generateArticle: (input: {
    clientId: string;
    materialIds: string[];
    researchQueryIds: string[];
    platform: string;
    templateId: string;
    templateCatalogRevision?: string;
  }) => Promise<ContentIpcResponse<{ article: GeneratedContentArticle }>>;
  saveArticle: (
    article: GeneratedContentArticle,
  ) => Promise<ContentIpcResponse<{ article: GeneratedContentArticle }>>;
  listGeneratedArticles: (
    clientId: string,
  ) => Promise<ContentIpcResponse<{ articles: GeneratedContentArticle[] }>>;
  getArticleManagementSnapshot: (input: {
    clientId: string;
  }) => Promise<ContentIpcResponse<ArticleManagementSnapshotWire>>;
  copyArticleVersion: (input: {
    clientId: string;
    sourceArticleId: string;
  }) => Promise<ContentIpcResponse<{ article: GeneratedContentArticle }>>;
  reviewArticles: (
    articles: ArticleReviewSelection[],
  ) => Promise<ContentIpcResponse<ArticleReviewResult>>;
  listArticleTrash: (
    clientId: string,
  ) => Promise<ContentIpcResponse<{ trash: ArticleTrashRecord[] }>>;
  previewTrashArticles: (input: {
    articles: ArticleReviewSelection[];
    selections: ArticleReviewSelection[];
  }) => Promise<ContentIpcResponse<ArticleTrashPreview>>;
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
  listArticleRemovalTransactions: () => Promise<
    ContentIpcResponse<{ transactions: ArticleRemovalTransaction[] }>
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

async function callCoreContent<TWire, TResult = TWire>(
  invoke: (api: CoreContentApi) => Promise<ContentIpcResponse<TWire>>,
  message: string,
  fallback?: TResult,
  hasFallback = false,
  map?: (wire: TWire) => TResult,
): Promise<TResult> {
  if (!isElectron()) {
    if (hasFallback) return fallback as TResult;
    throw unavailable(message);
  }
  const api = window.desktopConsole?.content as CoreContentApi | undefined;
  if (!api) {
    if (hasFallback) return fallback as TResult;
    throw unavailable(message);
  }
  const result = await invoke(api);
  if (result.ok === false) throw ipcError(result.error, message);
  if (result.data === undefined || result.data === null) {
    if (hasFallback) return fallback as TResult;
    throw ipcError(undefined, message);
  }
  return map ? map(result.data) : (result.data as unknown as TResult);
}
type DoubaoContentApi = {
  listQuestions: (
    clientId: string,
  ) => Promise<ContentIpcResponse<{ questions: ContentQuestion[] }>>;
  createQuestion: (input: {
    clientId: string;
    text: string;
    enabled?: boolean;
  }) => Promise<ContentIpcResponse<{ question: ContentQuestion }>>;
  updateQuestion: (input: {
    clientId: string;
    questionId: string;
    text?: string;
    enabled?: boolean;
  }) => Promise<ContentIpcResponse<{ question: ContentQuestion }>>;
  deleteQuestion: (input: {
    clientId: string;
    questionId: string;
  }) => Promise<ContentIpcResponse<{ question: ContentQuestion }>>;
  getDoubaoLoginState: () => Promise<
    ContentIpcResponse<{ loginState: Record<string, unknown> }>
  >;
  openDoubaoLogin: () => Promise<
    ContentIpcResponse<{ loginState: Record<string, unknown> }>
  >;
  collectDoubaoOne: (input: {
    clientId: string;
    questionId: string;
    force?: boolean;
  }) => Promise<ContentIpcResponse<{ research: ContentResearch }>>;
  previewDoubaoBatch: (input: {
    clientIds: string[];
    mode: DoubaoBatchMode;
  }) => Promise<ContentIpcResponse<{ preview: DoubaoBatchPreview }>>;
  startDoubaoBatch: (
    tasks: Array<{ clientId: string; questionId: string; force?: boolean }>,
  ) => Promise<ContentIpcResponse<{ queue: DoubaoQueueState }>>;
  startPreparedDoubaoBatch: (input: {
    tasks: DoubaoBatchTask[];
  }) => Promise<ContentIpcResponse<{ queue: DoubaoQueueState }>>;
  pauseDoubaoBatch: () => Promise<
    ContentIpcResponse<{ queue: DoubaoQueueState }>
  >;
  resumeDoubaoBatch: () => Promise<
    ContentIpcResponse<{ queue: DoubaoQueueState }>
  >;
  stopDoubaoBatch: () => Promise<
    ContentIpcResponse<{ queue: DoubaoQueueState }>
  >;
  retryFailedDoubao: () => Promise<
    ContentIpcResponse<{ queue: DoubaoQueueState }>
  >;
  getDoubaoQueueState: () => Promise<
    ContentIpcResponse<{ queue: DoubaoQueueState }>
  >;
  saveManualResearch: (input: {
    clientId: string;
    questionId: string;
    answerText: string;
    references: ContentResearch["references"];
  }) => Promise<ContentIpcResponse<{ research: ContentResearch }>>;
  onDoubaoQueueState: (
    listener: (state: DoubaoQueueState) => void,
  ) => () => void;
};
type SubmissionContentApi = {
  previewExport: (
    input: ContentExportInput,
  ) => Promise<ContentIpcResponse<ContentExportPreview>>;
  exportArticle: (
    input: ContentExportInput,
  ) => Promise<ContentIpcResponse<ContentExportPreview>>;
  previewSubmissionBatch: (
    input: ContentSubmissionBatchInput,
  ) => Promise<ContentIpcResponse<ContentSubmissionBatchPreview>>;
  listSubmissionPlatforms: () => Promise<
    ContentIpcResponse<{ platforms: ContentSubmissionPlatform[] }>
  >;
  listSubmissionBatches: (input: {
    clientId: string;
  }) => Promise<
    ContentIpcResponse<{ batches: ContentSubmissionBatchRecord[] }>
  >;
  createSubmissionBatch: (
    input: ContentSubmissionBatchInput & { confirmed: true },
  ) => Promise<ContentIpcResponse<ContentSubmissionBatchPreview>>;
  previewCancelSubmissionBatch: (input: {
    batchId: string;
  }) => Promise<ContentIpcResponse<ContentSubmissionCancellationPreview>>;
  cancelSubmissionBatch: (input: {
    batchId: string;
    planId: string;
    confirmed: true;
  }) => Promise<
    ContentIpcResponse<{
      batchId: string;
      planId: string;
      cancelledCount: number;
      idempotentCount: number;
      blockedItems: ContentSubmissionActionPlanItem[];
      batchStatus: string;
      changedScopes: string[];
      items: ContentSubmissionBatchItem[];
    }>
  >;
  previewCleanupFailedSubmissionItems: (input: {
    batchId: string;
  }) => Promise<ContentIpcResponse<ContentSubmissionCleanupPreview>>;
  cleanupFailedSubmissionItems: (input: {
    batchId: string;
    confirmed: true;
  }) => Promise<ContentIpcResponse<ContentSubmissionCleanupResult>>;
  previewRetryFailedPublication: (input: {
    publicationId: string;
  }) => Promise<ContentIpcResponse<FailedPublicationRetryPreview>>;
  retryFailedPublication: (input: {
    publicationId: string;
    expectedRevision?: number;
    confirmed: true;
  }) => Promise<ContentIpcResponse<FailedPublicationRetryResult>>;
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

async function callDoubao<TWire, TResult>(
  invoke: (api: DoubaoContentApi) => Promise<ContentIpcResponse<TWire>>,
  message: string,
  map: (wire: TWire) => TResult,
  fallback?: TResult,
  hasFallback = false,
): Promise<TResult> {
  if (!isElectron()) {
    if (hasFallback) return fallback as TResult;
    throw unavailable(message);
  }
  const api = window.desktopConsole?.content as DoubaoContentApi | undefined;
  if (!api) {
    if (hasFallback) return fallback as TResult;
    throw unavailable(message);
  }
  const result = await invoke(api);
  if (result.ok === false) throw ipcError(result.error, message);
  if (result.data === undefined || result.data === null) {
    if (hasFallback) return fallback as TResult;
    throw ipcError(undefined, message);
  }
  return map(result.data);
}

async function callSubmission<TWire, TResult = TWire>(
  invoke: (api: SubmissionContentApi) => Promise<ContentIpcResponse<TWire>>,
  message: string,
  options?: {
    map?: (wire: TWire) => TResult;
    fallback?: TResult;
    hasFallback?: boolean;
  },
): Promise<TResult> {
  if (!isElectron()) {
    if (options?.hasFallback) return options.fallback as TResult;
    throw unavailable(message);
  }
  const api = window.desktopConsole?.content as
    SubmissionContentApi | undefined;
  if (!api) {
    if (options?.hasFallback) return options.fallback as TResult;
    throw unavailable(message);
  }
  const result = await invoke(api);
  if (result.ok === false) throw ipcError(result.error, message);
  if (result.data === undefined || result.data === null) {
    if (options?.hasFallback) return options.fallback as TResult;
    throw ipcError(undefined, message);
  }
  return options?.map
    ? options.map(result.data)
    : (result.data as unknown as TResult);
}

type SafeGenerationIpcError = {
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
type GenerationIpcResponse<T> =
  { ok: true; data?: T } | { ok: false; error?: SafeGenerationIpcError };
type GenerationPlanInput = {
  clientIds: string[];
  templates: GenerationBatchTemplateSelection[];
  clientSources?: GenerationBatchSourceSelection[];
  templateCatalogRevision?: string;
};
type GenerationRuntimeSnapshot = {
  runtimeId: string;
  sequence: number;
  runtime: GenerationBatchState;
  batch: GenerationBatch | null;
  capabilities: GenerationBatchState["capabilities"];
};
type GenerationHandoffPreviewInput = {
  generationBatchId: string;
  targetPlatformIds: string[];
  accountProfiles: Record<string, string>;
};
type GenerationHandoffCommitInput = GenerationHandoffPreviewInput & {
  previewToken: string;
  confirmed: true;
};
type GenerationContentApi = {
  previewGenerationBatch: (
    input: GenerationPlanInput,
  ) => Promise<GenerationIpcResponse<GenerationBatchPreview>>;
  createGenerationBatch: (
    input: GenerationPlanInput,
  ) => Promise<GenerationIpcResponse<{ batch: GenerationBatch }>>;
  createAndStartGenerationBatch: (
    input: GenerationPlanInput,
  ) => Promise<GenerationIpcResponse<{ batch: GenerationBatch }>>;
  listGenerationBatches: () => Promise<
    GenerationIpcResponse<{ batches: GenerationBatch[] }>
  >;
  getGenerationBatch: (
    batchId: string,
  ) => Promise<GenerationIpcResponse<{ batch: GenerationBatch }>>;
  startGenerationBatch: (input: {
    batchId?: string;
    clientIds?: string[];
    templates?: GenerationBatchTemplateSelection[];
    clientSources?: GenerationBatchSourceSelection[];
  }) => Promise<GenerationIpcResponse<{ batch: GenerationBatch }>>;
  pauseGenerationBatch: (input?: {
    batchId?: string;
  }) => Promise<GenerationIpcResponse<{ batch: GenerationBatch | null }>>;
  stopGenerationBatch: (input?: {
    batchId?: string;
  }) => Promise<GenerationIpcResponse<{ batch: GenerationBatch | null }>>;
  continueGenerationBatch: (input: {
    batchId: string;
    confirmConfigChange?: boolean;
  }) => Promise<GenerationIpcResponse<{ batch: GenerationBatch }>>;
  resumeGenerationBatch: (input: {
    batchId: string;
    confirmConfigChange?: boolean;
  }) => Promise<GenerationIpcResponse<{ batch: GenerationBatch }>>;
  retryFailedGenerationBatch: (input: {
    batchId: string;
  }) => Promise<GenerationIpcResponse<{ batch: GenerationBatch }>>;
  previewCancelPendingGenerationBatch: (input: {
    batchId: string;
  }) => Promise<GenerationIpcResponse<GenerationBatchCancelPreview>>;
  cancelPendingGenerationBatch: (input: {
    batchId: string;
    confirmed: true;
  }) => Promise<GenerationIpcResponse<{ batch: GenerationBatch }>>;
  getGenerationBatchState: () => Promise<
    GenerationIpcResponse<GenerationBatchState>
  >;
  getGenerationRuntimeSnapshot: () => Promise<
    GenerationIpcResponse<GenerationRuntimeSnapshot>
  >;
  previewGenerationSubmissionHandoff: (
    input: GenerationHandoffPreviewInput,
  ) => Promise<GenerationIpcResponse<GenerationSubmissionHandoffPreview>>;
  commitGenerationSubmissionHandoff: (
    input: GenerationHandoffCommitInput,
  ) => Promise<GenerationIpcResponse<GenerationSubmissionHandoffResult>>;
};

function generationIpcError(
  error: SafeGenerationIpcError | undefined,
  fallback: string,
): Error & { code?: string } {
  return Object.assign(new Error(error?.userMessage || fallback), {
    code: error?.code,
  });
}

async function callGeneration<TWire, TResult = TWire>(
  invoke: (api: GenerationContentApi) => Promise<GenerationIpcResponse<TWire>>,
  message: string,
  options?: {
    fallback?: TResult;
    hasFallback?: boolean;
    map?: (data: TWire) => TResult;
  },
): Promise<TResult> {
  if (!isElectron()) {
    if (options?.hasFallback) return options.fallback as TResult;
    throw unavailable(message);
  }
  const api = window.desktopConsole?.content as
    GenerationContentApi | undefined;
  if (!api) {
    if (options?.hasFallback) return options.fallback as TResult;
    throw unavailable(message);
  }
  const result = await invoke(api);
  if (result.ok === false) throw generationIpcError(result.error, message);
  if (result.data === undefined || result.data === null) {
    if (options?.hasFallback) return options.fallback as TResult;
    throw generationIpcError(undefined, message);
  }
  return options?.map
    ? options.map(result.data)
    : (result.data as unknown as TResult);
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
  return callCoreContent(
    (api) => api.listClients(),
    "Unable to load clients",
    [],
    true,
    (wire) => wire.clients,
  );
}
export async function listContentResearch(
  clientId: string,
): Promise<ContentResearch[]> {
  return callCoreContent(
    (api) => api.listResearch(clientId),
    "Unable to load research",
    [],
    true,
    (wire) => wire.research,
  );
}
export async function listContentQuestions(
  clientId: string,
): Promise<ContentQuestion[]> {
  return callDoubao(
    (api) => api.listQuestions(clientId),
    "Unable to load questions",
    (wire) => wire.questions,
    [],
    true,
  );
}
export async function createContentQuestion(input: {
  clientId: string;
  text: string;
  enabled?: boolean;
}): Promise<ContentQuestion> {
  return callDoubao(
    (api) => api.createQuestion(input),
    "Unable to create question",
    (wire) => wire.question,
  );
}
export async function updateContentQuestion(input: {
  clientId: string;
  questionId: string;
  text?: string;
  enabled?: boolean;
}): Promise<ContentQuestion> {
  return callDoubao(
    (api) => api.updateQuestion(input),
    "Unable to update question",
    (wire) => wire.question,
  );
}
export async function deleteContentQuestion(input: {
  clientId: string;
  questionId: string;
}): Promise<ContentQuestion> {
  return callDoubao(
    (api) => api.deleteQuestion(input),
    "Unable to delete question",
    (wire) => wire.question,
  );
}

export async function getDoubaoLoginStatus(): Promise<DoubaoLoginState> {
  const raw = await callDoubao(
    (api) => api.getDoubaoLoginState(),
    "Unable to read Doubao login state",
    (wire) => wire.loginState,
    { status: "unknown" },
    true,
  );
  return normalizeLoginState(raw);
}
export const getDoubaoLoginState = getDoubaoLoginStatus;
export async function openDoubaoLogin(): Promise<DoubaoLoginState> {
  const raw = await callDoubao(
    (api) => api.openDoubaoLogin(),
    "Unable to open Doubao login",
    (wire) => wire.loginState,
  );
  return normalizeLoginState(raw);
}
export async function collectDoubaoQuestion(input: {
  clientId: string;
  questionId: string;
  force?: boolean;
}): Promise<ContentResearch> {
  return callDoubao(
    (api) => api.collectDoubaoOne(input),
    "Unable to collect Doubao answer",
    (wire) => wire.research,
  );
}
export async function previewDoubaoBatch(input: {
  clientIds: string[];
  mode: DoubaoBatchMode;
}): Promise<DoubaoBatchPreview> {
  return callDoubao(
    (api) => api.previewDoubaoBatch(input),
    "Unable to preview Doubao batch",
    (wire) => wire.preview,
  );
}
export async function startDoubaoBatch(
  tasks: Array<{ clientId: string; questionId: string; force?: boolean }>,
): Promise<DoubaoQueueState> {
  return callDoubao(
    (api) => api.startDoubaoBatch(tasks),
    "Unable to start Doubao batch",
    (wire) => wire.queue,
  );
}
export async function startPreparedDoubaoBatch(
  tasks: DoubaoBatchTask[],
): Promise<DoubaoQueueState> {
  return callDoubao(
    (api) => api.startPreparedDoubaoBatch({ tasks }),
    "Unable to start prepared Doubao batch",
    (wire) => wire.queue,
  );
}
export async function pauseDoubaoBatch(): Promise<DoubaoQueueState> {
  return callDoubao(
    (api) => api.pauseDoubaoBatch(),
    "Unable to pause Doubao batch",
    (wire) => wire.queue,
  );
}
export async function resumeDoubaoBatch(): Promise<DoubaoQueueState> {
  return callDoubao(
    (api) => api.resumeDoubaoBatch(),
    "Unable to resume Doubao batch",
    (wire) => wire.queue,
  );
}
export async function stopDoubaoBatch(): Promise<DoubaoQueueState> {
  return callDoubao(
    (api) => api.stopDoubaoBatch(),
    "Unable to stop Doubao batch",
    (wire) => wire.queue,
  );
}
export async function retryFailedDoubao(): Promise<DoubaoQueueState> {
  return callDoubao(
    (api) => api.retryFailedDoubao(),
    "Unable to retry Doubao tasks",
    (wire) => wire.queue,
  );
}
export async function getDoubaoQueueState(): Promise<DoubaoQueueState> {
  return callDoubao(
    (api) => api.getDoubaoQueueState(),
    "Unable to read Doubao queue",
    (wire) => wire.queue,
  );
}
export function subscribeDoubaoQueue(
  listener: (state: DoubaoQueueState) => void,
): () => void {
  if (!isElectron()) return () => {};
  const subscribe = (
    window.desktopConsole?.content as DoubaoContentApi | undefined
  )?.onDoubaoQueueState;
  return typeof subscribe === "function" ? subscribe(listener) : () => {};
}
export async function saveManualResearch(input: {
  clientId: string;
  questionId: string;
  answerText: string;
  references: ContentResearch["references"];
}): Promise<ContentResearch> {
  return callDoubao(
    (api) => api.saveManualResearch(input),
    "Unable to save manual research",
    (wire) => wire.research,
  );
}

export async function getGenerationBatchState(): Promise<GenerationBatchState> {
  return callGeneration(
    (api) => api.getGenerationBatchState(),
    "Unable to read generation batch state",
    {
      fallback: { state: "idle", status: "idle" },
      hasFallback: true,
    },
  );
}
export async function previewGenerationBatch(
  input: GenerationPlanInput,
): Promise<GenerationBatchPreview> {
  return callGeneration(
    (api) => api.previewGenerationBatch(input),
    "Unable to preview generation batch",
    {
      fallback: {
        clientCount: input.clientIds.length,
        executableClientCount: 0,
        taskCount: 0,
        executableTaskCount: 0,
        excludedTaskCount: 0,
        excludedClients: [],
        templates: input.templates,
        clientSources: [],
      },
      hasFallback: true,
    },
  );
}
export async function createGenerationBatch(
  input: GenerationPlanInput,
): Promise<GenerationBatch> {
  return callGeneration(
    (api) => api.createGenerationBatch(input),
    "Unable to create generation batch",
    { map: (data) => data.batch },
  );
}
export async function createAndStartGenerationBatch(
  input: GenerationPlanInput,
): Promise<GenerationBatch> {
  return callGeneration(
    (api) => api.createAndStartGenerationBatch(input),
    "Unable to create and start generation batch",
    { map: (data) => data.batch },
  );
}
export async function listGenerationBatches(): Promise<GenerationBatch[]> {
  return callGeneration(
    (api) => api.listGenerationBatches(),
    "Unable to list generation batches",
    { fallback: [], hasFallback: true, map: (data) => data.batches },
  );
}
export async function getGenerationBatch(
  batchId: string,
): Promise<GenerationBatch> {
  return callGeneration(
    (api) => api.getGenerationBatch(batchId),
    "Unable to read generation batch",
    { map: (data) => data.batch },
  );
}
export async function startGenerationBatch(input: {
  batchId?: string;
  clientIds?: string[];
  templates?: GenerationBatchTemplateSelection[];
  clientSources?: GenerationBatchSourceSelection[];
}): Promise<GenerationBatch> {
  return callGeneration(
    (api) => api.startGenerationBatch(input),
    "Unable to start generation batch",
    { map: (data) => data.batch },
  );
}
export async function pauseGenerationBatch(input?: {
  batchId?: string;
}): Promise<GenerationBatch | null> {
  return callGeneration(
    (api) => api.pauseGenerationBatch(input),
    "Unable to pause generation batch",
    { fallback: null, hasFallback: true, map: (data) => data.batch },
  );
}
export async function stopGenerationBatch(input?: {
  batchId?: string;
}): Promise<GenerationBatch | null> {
  return callGeneration(
    (api) => api.stopGenerationBatch(input),
    "Unable to stop generation batch",
    { fallback: null, hasFallback: true, map: (data) => data.batch },
  );
}
export async function resumeGenerationBatch(input: {
  batchId: string;
  confirmConfigChange?: boolean;
}): Promise<GenerationBatch> {
  return callGeneration(
    (api) => api.resumeGenerationBatch(input),
    "Unable to resume generation batch",
    { map: (data) => data.batch },
  );
}
export async function continueGenerationBatch(input: {
  batchId: string;
  confirmConfigChange?: boolean;
}): Promise<GenerationBatch> {
  return callGeneration(
    (api) => api.continueGenerationBatch(input),
    "Unable to continue generation batch",
    { map: (data) => data.batch },
  );
}
export async function retryFailedGenerationBatch(input: {
  batchId: string;
}): Promise<GenerationBatch> {
  return callGeneration(
    (api) => api.retryFailedGenerationBatch(input),
    "Unable to retry failed generation batch",
    { map: (data) => data.batch },
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
export async function getGenerationRuntimeSnapshot(): Promise<GenerationRuntimeSnapshot> {
  return callGeneration(
    (api) => api.getGenerationRuntimeSnapshot(),
    "Unable to read generation runtime snapshot",
    {
      fallback: {
        runtimeId: "renderer-fallback",
        sequence: 0,
        runtime: { state: "idle", status: "idle" },
        batch: null,
        capabilities: {},
      },
      hasFallback: true,
    },
  );
}
export async function previewCancelPendingGenerationBatch(input: {
  batchId: string;
}): Promise<GenerationBatchCancelPreview> {
  return callGeneration(
    (api) => api.previewCancelPendingGenerationBatch(input),
    "Unable to preview pending generation cancellation",
    {
      fallback: {
        batchId: input.batchId,
        pendingCount: 0,
        runningCount: 0,
        cancelledCount: 0,
        canCancel: false,
      },
      hasFallback: true,
    },
  );
}
export async function cancelPendingGenerationBatch(input: {
  batchId: string;
  confirmed: true;
}): Promise<GenerationBatch> {
  return callGeneration(
    (api) => api.cancelPendingGenerationBatch(input),
    "Unable to cancel pending generation tasks",
    { map: (data) => data.batch },
  );
}

export async function listContentTemplates(
  platform?: string,
): Promise<ContentTemplate[]> {
  return callCoreContent(
    (api) => api.listTemplates(platform),
    "Unable to load templates",
    [],
    true,
    (wire) => wire.templates,
  );
}
export async function listContentTemplateCatalog(): Promise<ContentTemplateCatalog> {
  return callCoreContent(
    (api) => api.listTemplateCatalog(),
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
  return callCoreContent(
    (api) => api.generateArticle(input),
    "Unable to generate article",
    undefined,
    false,
    (wire) => wire.article,
  );
}
export async function saveContentArticle(
  article: GeneratedContentArticle,
): Promise<GeneratedContentArticle> {
  return callCoreContent(
    (api) => api.saveArticle(article),
    "Unable to save article",
    undefined,
    false,
    (wire) => wire.article,
  );
}
export async function listContentArticles(
  clientId: string,
): Promise<GeneratedContentArticle[]> {
  return callCoreContent(
    (api) => api.listGeneratedArticles(clientId),
    "Unable to load generated articles",
    [],
    true,
    (wire) => wire.articles,
  );
}
export async function retryContentMaterial(input: {
  clientId: string;
  materialId: string;
}): Promise<ContentMaterial> {
  return callCoreContent(
    (api) => api.retryMaterial(input),
    "Unable to retry material",
    undefined,
    false,
    (wire) => wire.material,
  );
}
export async function reviewContentArticles(
  articles: ArticleReviewSelection[],
): Promise<ArticleReviewResult> {
  return callCoreContent(
    (api) => api.reviewArticles(articles),
    "Unable to review articles",
  );
}
export async function listContentTrash(
  clientId: string,
): Promise<ArticleTrashRecord[]> {
  return callCoreContent(
    (api) => api.listArticleTrash(clientId),
    "Unable to load article trash",
    [],
    true,
    (wire) => wire.trash,
  );
}
export async function copyContentArticleVersion(input: {
  clientId: string;
  sourceArticleId: string;
}): Promise<GeneratedContentArticle> {
  return callCoreContent(
    (api) => api.copyArticleVersion(input),
    "Unable to copy article version",
    undefined,
    false,
    (wire) => wire.article,
  );
}

export async function trashContentArticles(
  input: ArticleTrashCommitInput & { articles: ArticleReviewSelection[] },
): Promise<ArticleTrashResult> {
  const request: ArticleTrashCommitInput = input.legacy
    ? { articles: input.articles, confirmed: true }
    : { ...input, selections: input.articles };
  return callCoreContent(
    (api) =>
      input.legacy
        ? api.trashArticles(request)
        : api.applyArticleRemovalImpact(request),
    "Unable to move articles to trash",
  );
}
export async function getArticleManagementSnapshot(
  clientId: string,
): Promise<ArticleManagementSnapshot> {
  return callCoreContent(
    (api) => api.getArticleManagementSnapshot({ clientId }),
    "Unable to load article management snapshot",
    emptySnapshot(clientId),
    true,
    (wire) => {
      const { workflowItems, publicationSummaryItems, ...snapshot } = wire;
      return {
        ...snapshot,
        workflowByArticle: Object.fromEntries(
          workflowItems.map((item) => [item.articleId, item.workflow]),
        ),
        publicationSummaries: Object.fromEntries(
          publicationSummaryItems.map((item) => [item.articleId, item.summary]),
        ),
      };
    },
  );
}
export async function previewContentArticleRemoval(
  articles: ArticleReviewSelection[],
): Promise<ArticleTrashPreview> {
  return callCoreContent(
    (api) =>
      api.previewArticleRemovalImpact({ selections: articles, articles }),
    "Unable to preview moving articles to trash",
  );
}
export async function previewTrashedArticleQueueResidue(): Promise<TrashedArticleQueueResiduePreview> {
  return callSubmission(
    (api) => api.previewTrashedArticleQueueResidue(),
    "Unable to inspect trashed article queue residue",
    {
      fallback: {
        items: [],
        cleanableItems: [],
        reportedItems: [],
        cleanableCount: 0,
        reportedCount: 0,
      },
      hasFallback: true,
    },
  );
}
export async function cleanupTrashedArticleQueueResidue(): Promise<
  TrashedArticleQueueResiduePreview & { cleanedCount: number }
> {
  return callSubmission(
    (api) => api.cleanupTrashedArticleQueueResidue({ confirmed: true }),
    "Unable to clean trashed article queue residue",
    {
      fallback: {
        items: [],
        cleanableItems: [],
        reportedItems: [],
        cleanableCount: 0,
        reportedCount: 0,
        cleanedCount: 0,
      },
      hasFallback: true,
    },
  );
}
export async function getContentArticleRemovalTransaction(
  transactionId: string,
): Promise<ArticleRemovalTransaction | null> {
  const result = await callCoreContent(
    (api) => api.getArticleRemovalTransaction(transactionId),
    "Unable to read article removal transaction",
    { transaction: null },
    true,
  );
  return result.transaction;
}
export async function listContentArticleRemovalTransactions(): Promise<
  ArticleRemovalTransaction[]
> {
  const result = await callCoreContent(
    (api) => api.listArticleRemovalTransactions(),
    "Unable to list article removal transactions",
    { transactions: [] },
    true,
  );
  return result.transactions;
}
export function onContentArticleRemovalTransaction(
  transactionId: string,
  listener: (transaction: ArticleRemovalTransaction) => void,
): () => void {
  if (!isElectron()) return () => {};
  const subscribe = (
    window.desktopConsole?.content as CoreContentApi | undefined
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
  const result = await callCoreContent(
    (api) =>
      api.retryArticleRemovalTransaction({ transactionId, confirmed: true }),
    "Unable to repair article removal transaction",
  );
  return result.transaction;
}
export async function restoreContentArticle(
  input: ArticleReviewSelection,
): Promise<GeneratedContentArticle> {
  return callCoreContent(
    (api) => api.restoreArticle(input),
    "Unable to restore article",
    undefined,
    false,
    (wire) => wire.article,
  );
}
export async function preparePermanentDeleteContentArticle(
  input: ArticleReviewSelection,
): Promise<ArticlePermanentDeleteConfirmation> {
  return callCoreContent(
    (api) => api.preparePermanentDeleteArticle(input),
    "Unable to prepare permanent article deletion",
  );
}
export async function permanentlyDeleteContentArticle(
  input: ArticlePermanentDeleteRequest,
): Promise<ArticlePermanentDeleteResult> {
  return callCoreContent(
    (api) => api.permanentlyDeleteArticle(input),
    "Unable to permanently delete article",
  );
}
export async function previewExport(
  input: ContentExportInput,
): Promise<ContentExportPreview> {
  return callSubmission(
    (api) => api.previewExport(input),
    "preview export failed",
  );
}
export async function exportToSubmissionQueue(
  input: ContentExportInput,
): Promise<ContentExportPreview> {
  return callSubmission((api) => api.exportArticle(input), "export failed");
}
export async function previewContentSubmissionBatch(
  input: ContentSubmissionBatchInput,
): Promise<ContentSubmissionBatchPreview> {
  return callSubmission(
    (api) => api.previewSubmissionBatch(input),
    "submission batch preview failed",
  );
}
export async function listContentSubmissionPlatforms(): Promise<
  ContentSubmissionPlatform[]
> {
  return callSubmission(
    (api) => api.listSubmissionPlatforms(),
    "submission platform discovery failed",
    { map: (wire) => wire.platforms, fallback: [], hasFallback: true },
  );
}
export async function listContentSubmissionBatches(
  clientId: string,
): Promise<ContentSubmissionBatchRecord[]> {
  return callSubmission(
    (api) => api.listSubmissionBatches({ clientId }),
    "submission batch history failed",
    { map: (wire) => wire.batches, fallback: [], hasFallback: true },
  );
}
export async function createContentSubmissionBatch(
  input: ContentSubmissionBatchInput & { confirmed: true },
): Promise<ContentSubmissionBatchPreview> {
  return callSubmission(
    (api) => api.createSubmissionBatch(input),
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
  return callSubmission(
    (api) => api.cancelSubmissionBatch({ batchId, planId, confirmed: true }),
    "submission batch cancellation failed",
  );
}
export async function previewCancelContentSubmissionBatch(
  batchId: string,
): Promise<ContentSubmissionCancellationPreview> {
  return callSubmission(
    (api) => api.previewCancelSubmissionBatch({ batchId }),
    "submission batch cancellation preview failed",
  );
}
export async function previewCleanupFailedContentSubmissionItems(
  batchId: string,
): Promise<ContentSubmissionCleanupPreview> {
  return callSubmission(
    (api) => api.previewCleanupFailedSubmissionItems({ batchId }),
    "failed submission cleanup preview failed",
  );
}
export async function cleanupFailedContentSubmissionItems(
  batchId: string,
): Promise<ContentSubmissionCleanupResult> {
  return callSubmission(
    (api) => api.cleanupFailedSubmissionItems({ batchId, confirmed: true }),
    "failed submission cleanup failed",
  );
}
export async function previewGenerationSubmissionHandoff(
  input: GenerationHandoffPreviewInput,
): Promise<GenerationSubmissionHandoffPreview> {
  return callGeneration(
    (api) => api.previewGenerationSubmissionHandoff(input),
    "Unable to preview generation submission handoff",
  );
}
export async function commitGenerationSubmissionHandoff(
  input: GenerationHandoffCommitInput,
): Promise<GenerationSubmissionHandoffResult> {
  return callGeneration(
    (api) => api.commitGenerationSubmissionHandoff(input),
    "Unable to commit generation submission handoff",
  );
}
export async function previewRetryFailedPublication(input: {
  publicationId: string;
}): Promise<FailedPublicationRetryPreview> {
  return callSubmission(
    (api) => api.previewRetryFailedPublication(input),
    "failed publication retry preview failed",
  );
}
export async function retryFailedPublication(input: {
  publicationId: string;
  expectedRevision?: number;
  confirmed: true;
}): Promise<FailedPublicationRetryResult> {
  return callSubmission(
    (api) => api.retryFailedPublication(input),
    "failed publication retry failed",
  );
}

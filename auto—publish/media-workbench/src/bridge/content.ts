import type {
  ArticleManagementSnapshot,
  ContentSubmissionActionPlanItem,
  ContentSubmissionBatchItem,
  ContentSubmissionBatchRecord,
  ContentSubmissionCancellationPreview,
  ContentSubmissionCleanupPreview,
  ContentSubmissionCleanupResult,
  ContentSubmissionPlatform,
  PaidMediaAdmissionResult,
  PaidMediaConfirmationInput,
  PaidMediaExecutionBatch,
  PaidMediaExecutionResult,
  PaidMediaPreflight,
  PaidMediaPreflightInput,
  PendingQueueRemovalInput,
  PendingQueueRemovalResult,
  RegularQueueAdmissionInput,
  RegularQueueAdmissionPreview,
  RegularQueueAdmissionResult,
  RegularQueueGroupSnapshot,
} from "../types/publication";
import type {
  ContentClient,
  ContentMaterial,
  ContentQuestion,
  ContentResearch,
  ContentTemplate,
  ContentTemplateCatalog,
  DoubaoBatchMode,
  DoubaoBatchPreview,
  DoubaoBatchTask,
  DoubaoLoginState,
  DoubaoQueueState,
} from "../types/content";
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
export type ArticleEditorSnapshot = {
  article: GeneratedContentArticle;
  editFingerprint: string;
};
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
  listTemplateCatalog: () => Promise<
    ContentIpcResponse<ContentTemplateCatalog>
  >;
  retryMaterial: (input: {
    clientId: string;
    materialId: string;
  }) => Promise<ContentIpcResponse<{ material: ContentMaterial }>>;
  getArticleManagementSnapshot: (input: {
    clientId: string;
  }) => Promise<ContentIpcResponse<ArticleManagementSnapshotWire>>;
  getArticleEditor: (input: {
    clientId: string;
    articleId: string;
  }) => Promise<ContentIpcResponse<ArticleEditorSnapshot>>;
};

async function callCoreContent<TWire, TResult = TWire>(
  invoke: (api: CoreContentApi) => Promise<ContentIpcResponse<TWire>>,
  message: string,
  map?: (wire: TWire) => TResult,
): Promise<TResult> {
  const api = requireContentApi<CoreContentApi>();
  const result = await invoke(api);
  if (result.ok === false) throw ipcError(result.error, message);
  if (result.data === undefined || result.data === null)
    throw ipcError(undefined, message);
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
  listSubmissionPlatforms: () => Promise<
    ContentIpcResponse<{ platforms: ContentSubmissionPlatform[] }>
  >;
  previewRegularQueueAdmission: (
    input: RegularQueueAdmissionInput,
  ) => Promise<ContentIpcResponse<RegularQueueAdmissionPreview>>;
  admitRegularQueueItems: (
    input: RegularQueueAdmissionInput & { confirmed: true },
  ) => Promise<ContentIpcResponse<RegularQueueAdmissionResult>>;
  previewPaidMediaPreflight: (
    input: PaidMediaPreflightInput,
  ) => Promise<ContentIpcResponse<PaidMediaPreflight>>;
  confirmPaidMediaBatch: (
    input: PaidMediaConfirmationInput & { confirmed: true },
  ) => Promise<ContentIpcResponse<PaidMediaAdmissionResult>>;
  listPaidMediaBatches: () => Promise<
    ContentIpcResponse<{ items: PaidMediaExecutionBatch[] }>
  >;
  startPaidMediaBatch: (input: {
    batchId: string;
  }) => Promise<ContentIpcResponse<PaidMediaExecutionResult>>;
  pausePaidMediaBatch: (input: {
    batchId: string;
  }) => Promise<ContentIpcResponse<PaidMediaExecutionResult>>;
  removePendingQueueItems: (
    input: PendingQueueRemovalInput,
  ) => Promise<ContentIpcResponse<PendingQueueRemovalResult>>;
  listRegularQueueGroups: () => Promise<
    ContentIpcResponse<{ items: RegularQueueGroupSnapshot[] }>
  >;
  startRegularQueueGroup: (input: { queueGroupId: string }) => Promise<
    ContentIpcResponse<{ items: RegularQueueGroupSnapshot[] }>
  >;
  pauseRegularQueueGroup: (input: { queueGroupId: string }) => Promise<
    ContentIpcResponse<{ items: RegularQueueGroupSnapshot[] }>
  >;
  startAllRegularQueueGroups: () => Promise<
    ContentIpcResponse<{ items: RegularQueueGroupSnapshot[] }>
  >;
  pauseAllRegularQueueGroups: () => Promise<
    ContentIpcResponse<{ items: RegularQueueGroupSnapshot[] }>
  >;
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
};

async function callDoubao<TWire, TResult>(
  invoke: (api: DoubaoContentApi) => Promise<ContentIpcResponse<TWire>>,
  message: string,
  map: (wire: TWire) => TResult,
): Promise<TResult> {
  const api = requireContentApi<DoubaoContentApi>();
  const result = await invoke(api);
  if (result.ok === false) throw ipcError(result.error, message);
  if (result.data === undefined || result.data === null)
    throw ipcError(undefined, message);
  return map(result.data);
}

async function callSubmission<TWire, TResult = TWire>(
  invoke: (api: SubmissionContentApi) => Promise<ContentIpcResponse<TWire>>,
  message: string,
  options?: {
    map?: (wire: TWire) => TResult;
  },
): Promise<TResult> {
  const api = requireContentApi<SubmissionContentApi>();
  const result = await invoke(api);
  if (result.ok === false) throw ipcError(result.error, message);
  if (result.data === undefined || result.data === null)
    throw ipcError(undefined, message);
  return options?.map
    ? options.map(result.data)
    : (result.data as unknown as TResult);
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
    (api) => requireBridgeMethod(api.listClients)(),
    "Unable to load clients",
    (wire) => wire.clients,
  );
}
export async function listContentResearch(
  clientId: string,
): Promise<ContentResearch[]> {
  return callCoreContent(
    (api) => requireBridgeMethod(api.listResearch)(clientId),
    "Unable to load research",
    (wire) => wire.research,
  );
}
export async function listContentQuestions(
  clientId: string,
): Promise<ContentQuestion[]> {
  return callDoubao(
    (api) => requireBridgeMethod(api.listQuestions)(clientId),
    "Unable to load questions",
    (wire) => wire.questions,
  );
}
export async function createContentQuestion(input: {
  clientId: string;
  text: string;
  enabled?: boolean;
}): Promise<ContentQuestion> {
  return callDoubao(
    (api) => requireBridgeMethod(api.createQuestion)(input),
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
    (api) => requireBridgeMethod(api.updateQuestion)(input),
    "Unable to update question",
    (wire) => wire.question,
  );
}
export async function deleteContentQuestion(input: {
  clientId: string;
  questionId: string;
}): Promise<ContentQuestion> {
  return callDoubao(
    (api) => requireBridgeMethod(api.deleteQuestion)(input),
    "Unable to delete question",
    (wire) => wire.question,
  );
}

export async function getDoubaoLoginStatus(): Promise<DoubaoLoginState> {
  const raw = await callDoubao(
    (api) => requireBridgeMethod(api.getDoubaoLoginState)(),
    "Unable to read Doubao login state",
    (wire) => wire.loginState,
  );
  return normalizeLoginState(raw);
}
export async function openDoubaoLogin(): Promise<DoubaoLoginState> {
  const raw = await callDoubao(
    (api) => requireBridgeMethod(api.openDoubaoLogin)(),
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
    (api) => requireBridgeMethod(api.collectDoubaoOne)(input),
    "Unable to collect Doubao answer",
    (wire) => wire.research,
  );
}
export async function previewDoubaoBatch(input: {
  clientIds: string[];
  mode: DoubaoBatchMode;
}): Promise<DoubaoBatchPreview> {
  return callDoubao(
    (api) => requireBridgeMethod(api.previewDoubaoBatch)(input),
    "Unable to preview Doubao batch",
    (wire) => wire.preview,
  );
}
export async function startPreparedDoubaoBatch(
  tasks: DoubaoBatchTask[],
): Promise<DoubaoQueueState> {
  return callDoubao(
    (api) => requireBridgeMethod(api.startPreparedDoubaoBatch)({ tasks }),
    "Unable to start prepared Doubao batch",
    (wire) => wire.queue,
  );
}
export async function pauseDoubaoBatch(): Promise<DoubaoQueueState> {
  return callDoubao(
    (api) => requireBridgeMethod(api.pauseDoubaoBatch)(),
    "Unable to pause Doubao batch",
    (wire) => wire.queue,
  );
}
export async function resumeDoubaoBatch(): Promise<DoubaoQueueState> {
  return callDoubao(
    (api) => requireBridgeMethod(api.resumeDoubaoBatch)(),
    "Unable to resume Doubao batch",
    (wire) => wire.queue,
  );
}
export async function stopDoubaoBatch(): Promise<DoubaoQueueState> {
  return callDoubao(
    (api) => requireBridgeMethod(api.stopDoubaoBatch)(),
    "Unable to stop Doubao batch",
    (wire) => wire.queue,
  );
}
export async function retryFailedDoubao(): Promise<DoubaoQueueState> {
  return callDoubao(
    (api) => requireBridgeMethod(api.retryFailedDoubao)(),
    "Unable to retry Doubao tasks",
    (wire) => wire.queue,
  );
}
export async function getDoubaoQueueState(): Promise<DoubaoQueueState> {
  return callDoubao(
    (api) => requireBridgeMethod(api.getDoubaoQueueState)(),
    "Unable to read Doubao queue",
    (wire) => wire.queue,
  );
}
export function subscribeDoubaoQueue(
  listener: (state: DoubaoQueueState) => void,
): () => void {
  const subscribe = requireBridgeMethod(
    requireContentApi<DoubaoContentApi>().onDoubaoQueueState,
  );
  return subscribe(listener);
}
export async function saveManualResearch(input: {
  clientId: string;
  questionId: string;
  answerText: string;
  references: ContentResearch["references"];
}): Promise<ContentResearch> {
  return callDoubao(
    (api) => requireBridgeMethod(api.saveManualResearch)(input),
    "Unable to save manual research",
    (wire) => wire.research,
  );
}

export async function listContentTemplateCatalog(): Promise<ContentTemplateCatalog> {
  return callCoreContent(
    (api) => requireBridgeMethod(api.listTemplateCatalog)(),
    "Unable to load template catalog",
  );
}
export async function retryContentMaterial(input: {
  clientId: string;
  materialId: string;
}): Promise<ContentMaterial> {
  return callCoreContent(
    (api) => requireBridgeMethod(api.retryMaterial)(input),
    "Unable to retry material",
    (wire) => wire.material,
  );
}

export async function getArticleManagementSnapshot(
  clientId: string,
): Promise<ArticleManagementSnapshot> {
  return callCoreContent(
    (api) =>
      requireBridgeMethod(api.getArticleManagementSnapshot)({ clientId }),
    "Unable to load article management snapshot",
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

export async function getArticleEditor(input: {
  clientId: string;
  articleId: string;
}): Promise<ArticleEditorSnapshot> {
  return callCoreContent(
    (api) => requireBridgeMethod(api.getArticleEditor)(input),
    "Unable to load article editor",
  );
}
export async function previewRegularQueueAdmission(
  input: RegularQueueAdmissionInput,
): Promise<RegularQueueAdmissionPreview> {
  return callSubmission(
    (api) => requireBridgeMethod(api.previewRegularQueueAdmission)(input),
    "regular queue admission preview failed",
  );
}
export async function admitRegularQueueItems(
  input: RegularQueueAdmissionInput,
): Promise<RegularQueueAdmissionResult> {
  return callSubmission(
    (api) =>
      requireBridgeMethod(api.admitRegularQueueItems)({
        ...input,
        confirmed: true,
      }),
    "regular queue admission failed",
  );
}
export async function listRegularQueueGroups(): Promise<RegularQueueGroupSnapshot[]> {
  return callSubmission(
    (api) => requireBridgeMethod(api.listRegularQueueGroups)(),
    "regular queue group query failed",
    { map: (wire) => wire.items },
  );
}
export async function startRegularQueueGroup(input: {
  queueGroupId: string;
}): Promise<RegularQueueGroupSnapshot[]> {
  return callSubmission(
    (api) => requireBridgeMethod(api.startRegularQueueGroup)(input),
    "regular queue group start failed",
    { map: (wire) => wire.items },
  );
}
export async function pauseRegularQueueGroup(input: {
  queueGroupId: string;
}): Promise<RegularQueueGroupSnapshot[]> {
  return callSubmission(
    (api) => requireBridgeMethod(api.pauseRegularQueueGroup)(input),
    "regular queue group pause failed",
    { map: (wire) => wire.items },
  );
}
export async function startAllRegularQueueGroups(): Promise<RegularQueueGroupSnapshot[]> {
  return callSubmission(
    (api) => requireBridgeMethod(api.startAllRegularQueueGroups)(),
    "regular queue groups start failed",
    { map: (wire) => wire.items },
  );
}
export async function pauseAllRegularQueueGroups(): Promise<RegularQueueGroupSnapshot[]> {
  return callSubmission(
    (api) => requireBridgeMethod(api.pauseAllRegularQueueGroups)(),
    "regular queue groups pause failed",
    { map: (wire) => wire.items },
  );
}
export async function previewPaidMediaPreflight(
  input: PaidMediaPreflightInput,
): Promise<PaidMediaPreflight> {
  return callSubmission(
    (api) => requireBridgeMethod(api.previewPaidMediaPreflight)(input),
    "paid media preflight failed",
  );
}
export async function confirmPaidMediaBatch(
  input: PaidMediaConfirmationInput,
): Promise<PaidMediaAdmissionResult> {
  return callSubmission(
    (api) =>
      requireBridgeMethod(api.confirmPaidMediaBatch)({
        ...input,
        confirmed: true,
      }),
    "paid media confirmation failed",
  );
}

export async function listPaidMediaBatches(): Promise<
  PaidMediaExecutionBatch[]
> {
  return callSubmission(
    (api) => requireBridgeMethod(api.listPaidMediaBatches)(),
    "paid media batch query failed",
    { map: (wire) => wire.items },
  );
}

export async function startPaidMediaBatch(input: {
  batchId: string;
}): Promise<PaidMediaExecutionResult> {
  return callSubmission(
    (api) => requireBridgeMethod(api.startPaidMediaBatch)(input),
    "paid media batch start failed",
  );
}

export async function pausePaidMediaBatch(input: {
  batchId: string;
}): Promise<PaidMediaExecutionResult> {
  return callSubmission(
    (api) => requireBridgeMethod(api.pausePaidMediaBatch)(input),
    "paid media batch pause failed",
  );
}
export async function removePendingQueueItems(
  input: Omit<PendingQueueRemovalInput, "confirmed">,
): Promise<PendingQueueRemovalResult> {
  return callSubmission(
    (api) =>
      requireBridgeMethod(api.removePendingQueueItems)({
        ...input,
        confirmed: true,
      }),
    "pending queue removal failed",
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
    (api) =>
      requireBridgeMethod(api.cancelSubmissionBatch)({
        batchId,
        planId,
        confirmed: true,
      }),
    "submission batch cancellation failed",
  );
}
export async function previewCleanupFailedContentSubmissionItems(
  batchId: string,
): Promise<ContentSubmissionCleanupPreview> {
  return callSubmission(
    (api) =>
      requireBridgeMethod(api.previewCleanupFailedSubmissionItems)({ batchId }),
    "failed submission cleanup preview failed",
  );
}
export async function cleanupFailedContentSubmissionItems(
  batchId: string,
): Promise<ContentSubmissionCleanupResult> {
  return callSubmission(
    (api) =>
      requireBridgeMethod(api.cleanupFailedSubmissionItems)({
        batchId,
        confirmed: true,
      }),
    "failed submission cleanup failed",
  );
}

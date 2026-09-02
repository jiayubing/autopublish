import type {
  GeneratedContentArticle,
  ContentGenerationOperation,
  GenerationBatch,
  GenerationBatchCancelPreview,
  GenerationBatchPreview,
  GenerationBatchSourceSelection,
  GenerationBatchState,
  GenerationBatchTemplateSelection,
} from "../types/generation";
import { ipcError, requireBridgeMethod, requireContentApi } from "./transport";

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
type GenerationContentApi = {
  generateArticle: (input: {
    generationOperationId?: string;
    articleCount?: number;
    clientId: string;
    materialIds: string[];
    researchQueryIds: string[];
    platform: string;
    templateId: string;
    templateCatalogRevision?: string;
  }) => Promise<GenerationIpcResponse<{ article: GeneratedContentArticle | ContentGenerationOperation }>>;
  saveArticle: (input: {
    article: GeneratedContentArticle;
    expectedFingerprint: string;
  }) => Promise<
    GenerationIpcResponse<
      | {
          outcome: "saved";
          article: GeneratedContentArticle;
          editFingerprint: string;
        }
      | {
          outcome: "conflict";
          code: "ARTICLE_EDIT_CONFLICT";
          articleId: string;
          refreshRequired: true;
        }
      | {
          outcome: "result-uncertain";
          code: "ARTICLE_MUTATION_RESULT_UNCERTAIN";
          articleId: string;
          refreshRequired: true;
        }
    >
  >;
  getArticleEditor?: (input: {
    clientId: string;
    articleId: string;
  }) => Promise<
    GenerationIpcResponse<{
      article: GeneratedContentArticle;
      editFingerprint: string;
    }>
  >;
  previewGenerationBatch: (
    input: GenerationPlanInput,
  ) => Promise<GenerationIpcResponse<GenerationBatchPreview>>;
  createAndStartGenerationBatch: (
    input: GenerationPlanInput,
  ) => Promise<GenerationIpcResponse<{ batch: GenerationBatch }>>;
  pauseGenerationBatch: (input?: {
    batchId?: string;
  }) => Promise<GenerationIpcResponse<{ batch: GenerationBatch | null }>>;
  abandonGenerationBatch: (input: {
    batchId: string;
    confirmed: true;
  }) => Promise<GenerationIpcResponse<{ batch: GenerationBatch | null }>>;
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
  getGenerationRuntimeSnapshot: () => Promise<
    GenerationIpcResponse<GenerationRuntimeSnapshot>
  >;
};

export type SavedContentArticle = {
  article: GeneratedContentArticle;
  editFingerprint: string;
};

function generationIpcError(
  error: SafeGenerationIpcError | undefined,
  fallback: string,
): Error & { code?: string } {
  return ipcError(error, fallback);
}

async function callGeneration<TWire, TResult = TWire>(
  invoke: (api: GenerationContentApi) => Promise<GenerationIpcResponse<TWire>>,
  message: string,
  options?: { map?: (data: TWire) => TResult },
): Promise<TResult> {
  const api = requireContentApi<GenerationContentApi>();
  const result = await invoke(api);
  if (result.ok === false) throw generationIpcError(result.error, message);
  if (result.data === undefined || result.data === null)
    throw generationIpcError(undefined, message);
  return options?.map
    ? options.map(result.data)
    : (result.data as unknown as TResult);
}

export async function generateContentArticle(input: {
  generationOperationId?: string;
  articleCount?: number;
  clientId: string;
  materialIds: string[];
  researchQueryIds: string[];
  platform: string;
  templateId: string;
  templateCatalogRevision?: string;
}): Promise<GeneratedContentArticle | ContentGenerationOperation> {
  return callGeneration(
    (api) => requireBridgeMethod(api.generateArticle)(input),
    "Unable to generate article",
    { map: (wire) => wire.article },
  );
}

export async function saveContentArticle(
  article: GeneratedContentArticle,
  expectedFingerprint: string,
): Promise<SavedContentArticle> {
  if (!expectedFingerprint) {
    const error = new Error(
      "文章编辑凭证缺失，请重新打开文章后重试。",
    ) as Error & { code?: string };
    error.code = "ARTICLE_EDIT_FINGERPRINT_REQUIRED";
    throw error;
  }
  const api = requireContentApi<GenerationContentApi>();
  const result = await requireBridgeMethod(api.saveArticle)({
    article,
    expectedFingerprint,
  });
  if (result.ok === false)
    throw generationIpcError(result.error, "Unable to save article");
  const data = result.data;
  if (!data) throw generationIpcError(undefined, "Unable to save article");
  if (data.outcome === "conflict") {
    const error = new Error(
      "文章已被其他编辑会话修改，请刷新后重试。",
    ) as Error & { code?: string; refreshRequired?: boolean };
    error.code = "ARTICLE_EDIT_CONFLICT";
    error.refreshRequired = true;
    throw error;
  }
  if (data.outcome === "result-uncertain") {
    const error = new Error(
      "文章操作结果需要人工核对，请勿自动重试。",
    ) as Error & { code?: string; refreshRequired?: boolean };
    error.code = "ARTICLE_MUTATION_RESULT_UNCERTAIN";
    error.refreshRequired = true;
    throw error;
  }
  if (data.outcome !== "saved" || !data.article || !data.editFingerprint)
    throw generationIpcError(undefined, "Unable to save article");
  return { article: data.article, editFingerprint: data.editFingerprint };
}

export async function previewGenerationBatch(
  input: GenerationPlanInput,
): Promise<GenerationBatchPreview> {
  return callGeneration(
    (api) => requireBridgeMethod(api.previewGenerationBatch)(input),
    "Unable to preview generation batch",
  );
}

export async function createAndStartGenerationBatch(
  input: GenerationPlanInput,
): Promise<GenerationBatch> {
  return callGeneration(
    (api) => requireBridgeMethod(api.createAndStartGenerationBatch)(input),
    "Unable to create and start generation batch",
    { map: (data) => data.batch },
  );
}

export async function pauseGenerationBatch(input?: {
  batchId?: string;
}): Promise<GenerationBatch | null> {
  return callGeneration(
    (api) => requireBridgeMethod(api.pauseGenerationBatch)(input),
    "Unable to pause generation batch",
    { map: (data) => data.batch },
  );
}

export async function abandonGenerationBatch(input: {
  batchId: string;
  confirmed: true;
}): Promise<GenerationBatch | null> {
  return callGeneration(
    (api) => requireBridgeMethod(api.abandonGenerationBatch)(input),
    "Unable to end generation batch",
    { map: (data) => data.batch },
  );
}

export async function resumeGenerationBatch(input: {
  batchId: string;
  confirmConfigChange?: boolean;
}): Promise<GenerationBatch> {
  return callGeneration(
    (api) => requireBridgeMethod(api.resumeGenerationBatch)(input),
    "Unable to resume generation batch",
    { map: (data) => data.batch },
  );
}

export async function retryFailedGenerationBatch(input: {
  batchId: string;
}): Promise<GenerationBatch> {
  return callGeneration(
    (api) => requireBridgeMethod(api.retryFailedGenerationBatch)(input),
    "Unable to retry failed generation batch",
    { map: (data) => data.batch },
  );
}

export function subscribeGenerationBatchState(
  listener: (state: GenerationBatchState) => void,
): () => void {
  const subscribe = requireBridgeMethod(
    requireContentApi<{
      onGenerationBatchState: (
        value: (state: GenerationBatchState) => void,
      ) => () => void;
    }>().onGenerationBatchState,
  );
  return subscribe(listener);
}

export async function getGenerationRuntimeSnapshot(): Promise<GenerationRuntimeSnapshot> {
  return callGeneration(
    (api) => requireBridgeMethod(api.getGenerationRuntimeSnapshot)(),
    "Unable to read generation runtime snapshot",
  );
}

export async function previewCancelPendingGenerationBatch(input: {
  batchId: string;
}): Promise<GenerationBatchCancelPreview> {
  return callGeneration(
    (api) =>
      requireBridgeMethod(api.previewCancelPendingGenerationBatch)(input),
    "Unable to preview pending generation cancellation",
  );
}

export async function cancelPendingGenerationBatch(input: {
  batchId: string;
  confirmed: true;
}): Promise<GenerationBatch> {
  return callGeneration(
    (api) => requireBridgeMethod(api.cancelPendingGenerationBatch)(input),
    "Unable to cancel pending generation tasks",
    { map: (data) => data.batch },
  );
}

export type {
  GenerationBatch,
  GenerationBatchCancelPreview,
  GenerationBatchPreview,
  GenerationBatchSourceSelection,
  GenerationBatchState,
  GenerationBatchTemplateSelection,
  GeneratedContentArticle,
};

import type {
  GeneratedContentArticle,
  GenerationBatch,
  GenerationBatchCancelPreview,
  GenerationBatchPreview,
  GenerationBatchSourceSelection,
  GenerationBatchState,
  GenerationBatchTemplateSelection,
  GenerationSubmissionHandoffPreview,
  GenerationSubmissionHandoffResult,
} from "../types/generation";
import type { ContentSubmissionPlatform } from "../types/publication";
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
  generateArticle: (input: {
    clientId: string;
    materialIds: string[];
    researchQueryIds: string[];
    platform: string;
    templateId: string;
    templateCatalogRevision?: string;
  }) => Promise<GenerationIpcResponse<{ article: GeneratedContentArticle }>>;
  saveArticle: (
    article: GeneratedContentArticle,
  ) => Promise<GenerationIpcResponse<{ article: GeneratedContentArticle }>>;
  copyArticleVersion: (input: {
    clientId: string;
    sourceArticleId: string;
  }) => Promise<GenerationIpcResponse<{ article: GeneratedContentArticle }>>;
  previewGenerationBatch: (
    input: GenerationPlanInput,
  ) => Promise<GenerationIpcResponse<GenerationBatchPreview>>;
  createAndStartGenerationBatch: (
    input: GenerationPlanInput,
  ) => Promise<GenerationIpcResponse<{ batch: GenerationBatch }>>;
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

type SubmissionContentApi = {
  listSubmissionPlatforms: () => Promise<
    GenerationIpcResponse<{ platforms: ContentSubmissionPlatform[] }>
  >;
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

async function callSubmission<TWire, TResult = TWire>(
  invoke: (api: SubmissionContentApi) => Promise<GenerationIpcResponse<TWire>>,
  message: string,
  map?: (data: TWire) => TResult,
): Promise<TResult> {
  const api = requireContentApi<SubmissionContentApi>();
  const result = await invoke(api);
  if (result.ok === false) throw generationIpcError(result.error, message);
  if (result.data === undefined || result.data === null)
    throw generationIpcError(undefined, message);
  return map ? map(result.data) : (result.data as unknown as TResult);
}

export async function generateContentArticle(input: {
  clientId: string;
  materialIds: string[];
  researchQueryIds: string[];
  platform: string;
  templateId: string;
  templateCatalogRevision?: string;
}): Promise<GeneratedContentArticle> {
  return callGeneration(
    (api) => requireBridgeMethod(api.generateArticle)(input),
    "Unable to generate article",
    { map: (wire) => wire.article },
  );
}

export async function saveContentArticle(
  article: GeneratedContentArticle,
): Promise<GeneratedContentArticle> {
  return callGeneration(
    (api) => requireBridgeMethod(api.saveArticle)(article),
    "Unable to save article",
    { map: (wire) => wire.article },
  );
}

export async function copyContentArticleVersion(input: {
  clientId: string;
  sourceArticleId: string;
}): Promise<GeneratedContentArticle> {
  return callGeneration(
    (api) => requireBridgeMethod(api.copyArticleVersion)(input),
    "Unable to copy article version",
    { map: (wire) => wire.article },
  );
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

export async function stopGenerationBatch(input?: {
  batchId?: string;
}): Promise<GenerationBatch | null> {
  return callGeneration(
    (api) => requireBridgeMethod(api.stopGenerationBatch)(input),
    "Unable to stop generation batch",
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

export async function continueGenerationBatch(input: {
  batchId: string;
  confirmConfigChange?: boolean;
}): Promise<GenerationBatch> {
  return callGeneration(
    (api) => requireBridgeMethod(api.continueGenerationBatch)(input),
    "Unable to continue generation batch",
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

export async function previewGenerationSubmissionHandoff(
  input: GenerationHandoffPreviewInput,
): Promise<GenerationSubmissionHandoffPreview> {
  return callGeneration(
    (api) => requireBridgeMethod(api.previewGenerationSubmissionHandoff)(input),
    "Unable to preview generation submission handoff",
  );
}

export async function commitGenerationSubmissionHandoff(
  input: GenerationHandoffCommitInput,
): Promise<GenerationSubmissionHandoffResult> {
  return callGeneration(
    (api) => requireBridgeMethod(api.commitGenerationSubmissionHandoff)(input),
    "Unable to commit generation submission handoff",
  );
}

export async function listContentSubmissionPlatforms(): Promise<
  ContentSubmissionPlatform[]
> {
  return callSubmission(
    (api) => requireBridgeMethod(api.listSubmissionPlatforms)(),
    "submission platform discovery failed",
    (wire) => wire.platforms,
  );
}

export type {
  GenerationBatch,
  GenerationBatchCancelPreview,
  GenerationBatchPreview,
  GenerationBatchSourceSelection,
  GenerationBatchState,
  GenerationBatchTemplateSelection,
  GenerationSubmissionHandoffPreview,
  GenerationSubmissionHandoffResult,
  GeneratedContentArticle,
};

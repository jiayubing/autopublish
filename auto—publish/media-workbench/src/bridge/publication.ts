import type {
  ArticleAttentionItem,
  ArticleAttentionList,
  ArticleAttentionPreview,
  ArticleAttentionResolution,
  PublicationHistoryRecord,
} from "../types";
import type {
  PublicationTargetDto,
  SafeOperationalErrorDto,
} from "../contracts/phase-01-domain";
import { ipcError, requireBridgeApi } from "./transport";

export type { PublicationTargetDto, SafeOperationalErrorDto };

type PublicationIpcResponse<T> = {
  ok: boolean;
  data?: T;
  error?: SafeOperationalErrorDto;
};
type PublicationReconcileInput = {
  publicationId: string;
  status: "published" | "failed";
  reasonCode: string;
  confirmed: true;
};
type PublicationApi = {
  reconcile?: (
    input: PublicationReconcileInput,
  ) => Promise<PublicationIpcResponse<{ record: PublicationHistoryRecord }>>;
};
type AttentionContentApi = {
  listArticleAttention?: (input?: {
    clientId: string;
  }) => Promise<PublicationIpcResponse<ArticleAttentionList>>;
  previewArticleAttention?: (input: {
    attentionId: string;
    action: string;
  }) => Promise<PublicationIpcResponse<ArticleAttentionPreview>>;
  resolveArticleAttention?: (input: {
    attentionId: string;
    action: string;
    expectedRevision: number;
    confirmed?: boolean;
  }) => Promise<PublicationIpcResponse<ArticleAttentionResolution>>;
};

function publicationApi(): PublicationApi {
  return requireBridgeApi<PublicationApi>("publication");
}

function attentionContentApi(): AttentionContentApi {
  return requireBridgeApi<AttentionContentApi>("content");
}

function publicationError(
  error: SafeOperationalErrorDto | undefined,
  fallback: string,
): Error & { code?: string } {
  return ipcError(error, fallback);
}

export async function reconcilePublicationHistory(input: {
  publicationId: string;
  status: "published" | "failed";
  reasonCode: string;
}): Promise<PublicationHistoryRecord> {
  const api = publicationApi();
  const result = await api.reconcile!({
    ...input,
    confirmed: true,
  });
  if (result.ok === false)
    throw publicationError(
      result.error,
      "Unable to reconcile publication result",
    );
  if (!result.data?.record)
    throw publicationError(undefined, "Unable to reconcile publication result");
  return result.data.record;
}
export async function listArticleAttentionSnapshot(
  clientId?: string,
): Promise<ArticleAttentionList> {
  const content = attentionContentApi();
  const result = await content.listArticleAttention!(
    clientId ? { clientId } : undefined,
  );
  if (!result.ok || !result.data)
    throw ipcError(result.error, "listArticleAttention failed");
  return result.data;
}
export async function listArticleAttention(
  clientId?: string,
): Promise<ArticleAttentionItem[]> {
  return (await listArticleAttentionSnapshot(clientId)).items;
}
export async function previewArticleAttention(input: {
  attentionId: string;
  action: string;
}): Promise<ArticleAttentionPreview> {
  const content = attentionContentApi();
  const result = await content.previewArticleAttention!(input);
  if (!result.ok || !result.data)
    throw ipcError(result.error, "previewArticleAttention failed");
  return result.data;
}
export async function resolveArticleAttention(input: {
  attentionId: string;
  action: string;
  expectedRevision: number;
  confirmed?: boolean;
}): Promise<ArticleAttentionResolution> {
  const content = attentionContentApi();
  const result = await content.resolveArticleAttention!(input);
  if (!result.ok || !result.data)
    throw ipcError(result.error, "resolveArticleAttention failed");
  return result.data;
}

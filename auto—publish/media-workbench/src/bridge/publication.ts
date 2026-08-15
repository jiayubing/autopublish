import type {
  ArticleAttentionItem,
  ArticleAttentionList,
  ArticleAttentionPreview,
  ArticleAttentionResolution,
} from "../types/publication";
import type {
  PublicationTargetDto,
  SafeOperationalErrorDto,
} from "../contracts/phase-01-domain";
import {
  ipcError,
  requireBridgeMethod,
  requireContentApi,
} from "./transport";

export type { PublicationTargetDto, SafeOperationalErrorDto };

type PublicationIpcResponse<T> = {
  ok: boolean;
  data?: T;
  error?: SafeOperationalErrorDto;
};
type AttentionContentApi = {
  listArticleAttention?: (input?: {
    clientId: string;
  }) => Promise<PublicationIpcResponse<ArticleAttentionList>>;
  previewArticleAttention?: (input: {
    attentionId: string;
    action: string;
    expectedRevision?: number;
    resolutionInput?: {
      orderId?: string;
      observedAt?: string;
      remoteUrl?: string;
      reasonCode?: string;
    };
  }) => Promise<PublicationIpcResponse<ArticleAttentionPreview>>;
  resolveArticleAttention?: (input: {
    attentionId: string;
    action: string;
    expectedRevision: number;
    confirmed?: boolean;
    confirmationToken?: string;
    resolutionInput?: {
      orderId?: string;
      observedAt?: string;
      remoteUrl?: string;
      reasonCode?: string;
    };
  }) => Promise<PublicationIpcResponse<ArticleAttentionResolution>>;
};

function attentionContentApi(): AttentionContentApi {
  return requireContentApi<AttentionContentApi>();
}

function publicationError(
  error: SafeOperationalErrorDto | undefined,
  fallback: string,
): Error & { code?: string } {
  return ipcError(error, fallback);
}

export async function listArticleAttentionSnapshot(
  clientId?: string,
): Promise<ArticleAttentionList> {
  const content = attentionContentApi();
  const result = await requireBridgeMethod(content.listArticleAttention)(
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
  expectedRevision?: number;
  resolutionInput?: {
    orderId?: string;
    observedAt?: string;
    remoteUrl?: string;
    reasonCode?: string;
  };
}): Promise<ArticleAttentionPreview> {
  const content = attentionContentApi();
  const result = await requireBridgeMethod(content.previewArticleAttention)(
    input,
  );
  if (!result.ok || !result.data)
    throw ipcError(result.error, "previewArticleAttention failed");
  return result.data;
}
export async function resolveArticleAttention(input: {
  attentionId: string;
  action: string;
  expectedRevision: number;
  confirmed?: boolean;
  confirmationToken?: string;
  resolutionInput?: {
    orderId?: string;
    observedAt?: string;
    remoteUrl?: string;
    reasonCode?: string;
  };
}): Promise<ArticleAttentionResolution> {
  const content = attentionContentApi();
  const result = await requireBridgeMethod(content.resolveArticleAttention)(
    input,
  );
  if (!result.ok || !result.data)
    throw ipcError(result.error, "resolveArticleAttention failed");
  return result.data;
}

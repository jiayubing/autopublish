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
import { ipcError, isElectron, unavailable } from "./transport";

export type { PublicationTargetDto, SafeOperationalErrorDto };

type PublicationIpcResponse<T> = {
  ok: boolean;
  data?: T;
  error?: SafeOperationalErrorDto;
};
type PublicationListInput = { clientId: string; articleIds: string[] };
type PublicationReconcileInput = {
  publicationId: string;
  status: "published" | "failed";
  reasonCode: string;
  confirmed: true;
};
type PublicationApi = {
  listForArticles?: (
    input: PublicationListInput,
  ) => Promise<PublicationIpcResponse<{ records: PublicationHistoryRecord[] }>>;
  reconcile?: (
    input: PublicationReconcileInput,
  ) => Promise<PublicationIpcResponse<{ record: PublicationHistoryRecord }>>;
};
type AttentionContentApi = {
  listArticleAttention?: (input?: {
    clientId: string;
  }) => Promise<PublicationIpcResponse<ArticleAttentionList>>;
  getArticleAttention?: (input: {
    attentionId: string;
  }) => Promise<PublicationIpcResponse<{ item: ArticleAttentionItem | null }>>;
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

function publicationApi(): PublicationApi | undefined {
  return window.desktopConsole?.publication as PublicationApi | undefined;
}

function attentionContentApi(): AttentionContentApi | undefined {
  return window.desktopConsole?.content as AttentionContentApi | undefined;
}

function publicationError(
  error: SafeOperationalErrorDto | undefined,
  fallback: string,
): Error & { code?: string } {
  return Object.assign(new Error(error?.userMessage || fallback), {
    code: error?.code,
  });
}

export async function listPublicationHistory(
  clientId: string,
  articleIds: string[],
): Promise<PublicationHistoryRecord[]> {
  if (!isElectron()) return [];
  const api = publicationApi();
  if (typeof api?.listForArticles !== "function") return [];
  const result = await api.listForArticles({
    clientId,
    articleIds,
  });
  if (result.ok === false)
    throw publicationError(result.error, "publication history failed");
  return result.data?.records || [];
}
export async function reconcilePublicationHistory(input: {
  publicationId: string;
  status: "published" | "failed";
  reasonCode: string;
}): Promise<PublicationHistoryRecord> {
  if (!isElectron())
    throw unavailable("Publication reconciliation requires the desktop app");
  const api = publicationApi();
  if (typeof api?.reconcile !== "function")
    throw unavailable("Publication reconciliation requires the desktop app");
  const result = await api.reconcile({
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
  if (!isElectron())
    return { revision: 0, items: [], counts: { total: 0, actionable: 0 } };
  const content = attentionContentApi();
  if (typeof content?.listArticleAttention !== "function")
    return { revision: 0, items: [], counts: { total: 0, actionable: 0 } };
  const result = await content.listArticleAttention(
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
export async function getArticleAttention(
  attentionId: string,
): Promise<ArticleAttentionItem | null> {
  if (!isElectron()) return null;
  const content = attentionContentApi();
  if (typeof content?.getArticleAttention !== "function") return null;
  const result = await content.getArticleAttention({ attentionId });
  if (!result.ok) throw ipcError(result.error, "getArticleAttention failed");
  return result.data?.item || null;
}
export async function previewArticleAttention(input: {
  attentionId: string;
  action: string;
}): Promise<ArticleAttentionPreview> {
  if (!isElectron()) throw unavailable("需处理中心不可用");
  const content = attentionContentApi();
  if (typeof content?.previewArticleAttention !== "function")
    throw unavailable("需处理中心不可用");
  const result = await content.previewArticleAttention(input);
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
  if (!isElectron()) throw unavailable("需处理中心不可用");
  const content = attentionContentApi();
  if (typeof content?.resolveArticleAttention !== "function")
    throw unavailable("需处理中心不可用");
  const result = await content.resolveArticleAttention(input);
  if (!result.ok || !result.data)
    throw ipcError(result.error, "resolveArticleAttention failed");
  return result.data;
}

import type {
  ArticleAttentionItem,
  ArticleAttentionList,
  ArticleAttentionPreview,
  ArticleAttentionResolution,
  PublicationHistoryRecord,
} from "../types";
import { ipcError, isElectron, unavailable } from "./transport";

export async function listPublicationHistory(
  clientId: string,
  articleIds: string[],
): Promise<PublicationHistoryRecord[]> {
  if (
    !isElectron() ||
    typeof window.desktopConsole?.publication?.listForArticles !== "function"
  )
    return [];
  const result = await window.desktopConsole.publication.listForArticles({
    clientId,
    articleIds,
  });
  if (!result.ok) throw ipcError(result.error, "publication history failed");
  return result.data || [];
}
export async function reconcilePublicationHistory(input: {
  publicationId: string;
  status: "published" | "failed";
  reasonCode: string;
}): Promise<PublicationHistoryRecord> {
  if (
    !isElectron() ||
    typeof window.desktopConsole?.publication?.reconcile !== "function"
  )
    throw unavailable("Publication reconciliation requires the desktop app");
  const result = await window.desktopConsole.publication.reconcile({
    ...input,
    confirmed: true,
  });
  if (!result.ok || !result.data)
    throw ipcError(result.error, "Unable to reconcile publication result");
  return result.data;
}
export async function listArticleAttentionSnapshot(
  clientId?: string,
): Promise<ArticleAttentionList> {
  if (!isElectron())
    return { revision: 0, items: [], counts: { total: 0, actionable: 0 } };
  const attention = window.desktopConsole!.articleAttention;
  const content = window.desktopConsole!.content;
  const list =
    typeof attention?.list === "function"
      ? attention.list.bind(attention)
      : typeof content?.listArticleAttention === "function"
        ? content.listArticleAttention.bind(content)
        : undefined;
  if (!list)
    return { revision: 0, items: [], counts: { total: 0, actionable: 0 } };
  const result = await list(clientId ? { clientId } : undefined);
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
  const attention = window.desktopConsole!.articleAttention;
  const content = window.desktopConsole!.content;
  const get =
    typeof attention?.get === "function"
      ? attention.get.bind(attention)
      : typeof content?.getArticleAttention === "function"
        ? content.getArticleAttention.bind(content)
        : undefined;
  if (!get) return null;
  const result = await get({ attentionId });
  if (!result.ok) throw ipcError(result.error, "getArticleAttention failed");
  return result.data || null;
}
export async function previewArticleAttention(input: {
  attentionId: string;
  action: string;
}): Promise<ArticleAttentionPreview> {
  if (!isElectron()) throw unavailable("需处理中心不可用");
  const attention = window.desktopConsole!.articleAttention;
  const content = window.desktopConsole!.content;
  const preview =
    typeof attention?.preview === "function"
      ? attention.preview.bind(attention)
      : typeof content?.previewArticleAttention === "function"
        ? content.previewArticleAttention.bind(content)
        : undefined;
  if (!preview) throw unavailable("需处理中心不可用");
  const result = await preview(input);
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
  const attention = window.desktopConsole!.articleAttention;
  const content = window.desktopConsole!.content;
  const resolve =
    typeof attention?.resolve === "function"
      ? attention.resolve.bind(attention)
      : typeof content?.resolveArticleAttention === "function"
        ? content.resolveArticleAttention.bind(content)
        : undefined;
  if (!resolve) throw unavailable("需处理中心不可用");
  const result = await resolve(input);
  if (!result.ok || !result.data)
    throw ipcError(result.error, "resolveArticleAttention failed");
  return result.data;
}

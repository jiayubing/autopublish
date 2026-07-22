import type {
  Article,
  Draft,
  IpcResponse,
  MediaResource,
  RealOrder,
} from "../types";
import { formatBeijingTime } from "../time-format";
import { ipcError, isElectron, unavailable } from "./transport";

type Command = (...args: unknown[]) => Promise<IpcResponse<unknown>>;

async function callMedia<T>(
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
  const api = window.desktopConsole?.media as unknown as
    Record<string, unknown> | undefined;
  const command = api?.[method] as Command | undefined;
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

function normalizeArticle(raw: Record<string, unknown>): Article {
  const content = typeof raw.content === "string" ? raw.content : "";
  return {
    filename: String(raw.filename || ""),
    title: String(raw.title || ""),
    content,
    words:
      typeof raw.words === "number" && raw.words > 0
        ? raw.words
        : content.replace(/\s/g, "").length,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    selectedResources: Array.isArray(raw.selectedResources)
      ? (raw.selectedResources as MediaResource[])
      : [],
    lastModified: formatBeijingTime(
      raw.lastModified || new Date().toISOString(),
    ),
    filePath: String(raw.filePath || ""),
    autoTitle: String(raw.autoTitle || ""),
    remark: String(raw.remark || ""),
    hasImages: Boolean(raw.hasImages),
    imageCount: typeof raw.imageCount === "number" ? raw.imageCount : 0,
    ignoreImages: Boolean(raw.ignoreImages),
  };
}

function normalizeResource(raw: Record<string, unknown>): MediaResource {
  return {
    resourceId: String(raw.resourceId || raw.id || ""),
    name: String(raw.name || ""),
    price: Number(raw.price || 0),
    type: (raw.type === "video" ? "video" : "image") as MediaResource["type"],
    url: typeof raw.url === "string" ? raw.url : undefined,
    duration: typeof raw.duration === "string" ? raw.duration : undefined,
    resolution: typeof raw.resolution === "string" ? raw.resolution : undefined,
    size: typeof raw.size === "string" ? raw.size : undefined,
    createdAt: String(raw.createdAt || ""),
  };
}

function normalizeOrder(raw: Record<string, unknown>): RealOrder {
  return {
    title: String(raw.title || ""),
    filename: String(raw.filename || ""),
    orderNid: String(raw.orderNid || ""),
    statusCode: String(raw.statusCode || ""),
    statusLabel: String(raw.statusLabel || ""),
    submittedAt: formatBeijingTime(raw.submittedAt || ""),
    publishedAt: formatBeijingTime(raw.publishedAt || ""),
    resourceId: String(raw.resourceId || ""),
    resourceName: String(raw.resourceName || ""),
    price: String(raw.price || "0"),
    orderUrl: String(raw.orderUrl || ""),
    publicationId:
      typeof raw.publicationId === "string" ? raw.publicationId : undefined,
    attemptId: typeof raw.attemptId === "string" ? raw.attemptId : undefined,
    publicationStatus:
      typeof raw.publicationStatus === "string"
        ? raw.publicationStatus
        : undefined,
    errorCode: typeof raw.errorCode === "string" ? raw.errorCode : undefined,
  };
}

export async function scanArticles(): Promise<Article[]> {
  const raw = await callMedia<unknown[]>(
    "scanArticles",
    [],
    "scanArticles failed",
    [],
    true,
  );
  return raw.map((item) => normalizeArticle(item as Record<string, unknown>));
}
export async function previewArticle(filename: string): Promise<Article> {
  return normalizeArticle(
    await callMedia<Record<string, unknown>>(
      "previewArticle",
      [filename],
      "previewArticle failed",
    ),
  );
}
export async function getDrafts(): Promise<Draft[]> {
  return callMedia("getDrafts", [], "getDrafts failed", [], true);
}
export async function getDraft(filename: string): Promise<Draft> {
  return callMedia("getDraft", [filename], "getDraft failed: " + filename);
}
export async function setDraft(filename: string, draft: Draft): Promise<void> {
  const { filename: _filename, selectedResources, ...fields } = draft;
  await callMedia(
    "setDraft",
    [
      filename,
      {
        ...fields,
        selectedResources: selectedResources.map((resource) => ({
          resourceId: resource.resourceId,
          name: resource.name,
          price: resource.price,
        })),
      },
    ],
    "setDraft failed",
    undefined,
    true,
  );
}
export async function removeDraft(filename: string): Promise<void> {
  await callMedia(
    "removeDraft",
    [filename],
    "removeDraft failed",
    undefined,
    true,
  );
}
export async function buildConfirmation(articles: Article[]): Promise<unknown> {
  return callMedia(
    "buildConfirmation",
    [
      articles.map((article) => ({
        filename: article.filename,
        resourceIds: article.selectedResources.map(
          (resource) => resource.resourceId,
        ),
      })),
    ],
    "buildConfirmation failed",
  );
}
export async function submitSelected(articles: Article[]): Promise<unknown> {
  return callMedia(
    "submitSelected",
    [
      articles.map((article) => ({
        filename: article.filename,
        resourceIds: article.selectedResources.map(
          (resource) => resource.resourceId,
        ),
      })),
    ],
    "submitSelected failed",
  );
}
export async function stopSubmit(): Promise<void> {
  await callMedia("stopSubmit", [], "stopSubmit failed", undefined, true);
}
export async function refreshResources(
  opts?: Record<string, unknown>,
): Promise<void> {
  await callMedia(
    "refreshResources",
    [opts],
    "refreshResources failed",
    undefined,
    true,
  );
}
export async function getResourcePage(opts: {
  page?: number;
  pageSize?: number;
}): Promise<{
  items: MediaResource[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const raw = await callMedia<{
    items?: unknown[];
    total: number;
    page: number;
    pageSize: number;
  }>(
    "getResourcePage",
    [opts],
    "getResourcePage failed",
    {
      items: [],
      total: 0,
      page: opts.page || 1,
      pageSize: opts.pageSize || 20,
    },
    true,
  );
  return {
    ...raw,
    items: (raw.items || []).map((item) =>
      normalizeResource(item as Record<string, unknown>),
    ),
  };
}
export async function searchResourcePage(opts: {
  query: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  items: MediaResource[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const raw = await callMedia<{
    items?: unknown[];
    total: number;
    page: number;
    pageSize: number;
  }>(
    "searchResourcePage",
    [opts],
    "searchResourcePage failed",
    {
      items: [],
      total: 0,
      page: opts.page || 1,
      pageSize: opts.pageSize || 20,
    },
    true,
  );
  return {
    ...raw,
    items: (raw.items || []).map((item) =>
      normalizeResource(item as Record<string, unknown>),
    ),
  };
}
export async function getPool(): Promise<MediaResource[]> {
  const raw = await callMedia<unknown[]>(
    "getPool",
    [],
    "getPool failed",
    [],
    true,
  );
  return raw.map((item) => normalizeResource(item as Record<string, unknown>));
}
export async function addToPool(resource: MediaResource): Promise<void> {
  await callMedia("addToPool", [resource], "addToPool failed", undefined, true);
}
export async function removeFromPool(resourceId: string): Promise<void> {
  await callMedia(
    "removeFromPool",
    [resourceId],
    "removeFromPool failed",
    undefined,
    true,
  );
}
export async function getBalance(): Promise<number> {
  const raw = await callMedia<{ balance?: string | number }>(
    "getBalance",
    [],
    "getBalance failed",
    { balance: 0 },
    true,
  );
  return Number(raw.balance || 0);
}
export async function getOrders(): Promise<RealOrder[]> {
  if (!isElectron()) return [];
  const api = window.desktopConsole?.orders as unknown as
    Record<string, unknown> | undefined;
  const command = api?.getOrders as Command | undefined;
  if (typeof command !== "function") return [];
  const result = (await command()) as IpcResponse<unknown[]>;
  if (!result.ok) throw ipcError(result.error, "getOrders failed");
  return (result.data || []).map((item) =>
    normalizeOrder(item as Record<string, unknown>),
  );
}
export async function syncOrder(orderNid: string): Promise<unknown> {
  if (!isElectron()) return null;
  const api = window.desktopConsole?.orders as unknown as
    Record<string, unknown> | undefined;
  const command = api?.syncOrder as Command | undefined;
  if (typeof command !== "function") return null;
  const result = (await command(orderNid)) as IpcResponse<unknown>;
  if (!result.ok) throw ipcError(result.error, "syncOrder failed");
  return result.data;
}

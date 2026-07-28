import type {
  Article,
  Draft,
  IpcResponse,
  MediaResource,
  RealOrder,
} from "../types";
import { formatBeijingTime } from "../time-format";
import { ipcError, isElectron, unavailable } from "./transport";

type MediaRefreshResult = {
  status: "complete" | "truncated";
  complete: boolean;
  truncated: boolean;
  truncationReason: string | null;
  pageCount: number;
  resourceCount: number;
  diagnostics: Array<Record<string, unknown>>;
  refreshedAt: string;
};

type MediaApi = {
  scanArticles: () => Promise<
    IpcResponse<{ items: Record<string, unknown>[] }>
  >;
  previewArticle: (
    filename: string,
  ) => Promise<IpcResponse<{ article: Record<string, unknown> }>>;
  getDrafts: () => Promise<IpcResponse<{ items: Draft[] }>>;
  getDraft: (filename: string) => Promise<IpcResponse<{ draft: Draft | null }>>;
  setDraft: (
    filename: string,
    draft: Omit<Draft, "filename">,
  ) => Promise<IpcResponse<{ completed: boolean }>>;
  removeDraft: (
    filename: string,
  ) => Promise<IpcResponse<{ completed: boolean }>>;
  buildConfirmation: (submissions: unknown[]) => Promise<IpcResponse<unknown>>;
  submitSelected: (submissions: unknown[]) => Promise<IpcResponse<unknown>>;
  stopSubmit: () => Promise<IpcResponse<{ stopped: boolean }>>;
  refreshResources: (
    input: Record<string, never>,
  ) => Promise<IpcResponse<MediaRefreshResult>>;
  getResourcePage: (input: { page: number; pageSize: number }) => Promise<
    IpcResponse<{
      items: Record<string, unknown>[];
      total: number;
      page: number;
      pageSize: number;
    }>
  >;
  searchResourcePage: (input: {
    query: string;
    page: number;
    pageSize: number;
  }) => Promise<
    IpcResponse<{
      items: Record<string, unknown>[];
      total: number;
      page: number;
      pageSize: number;
    }>
  >;
  getPool: (input: {
    page: number;
    pageSize: number;
    resourceIds: string[];
  }) => Promise<
    IpcResponse<{
      items: Record<string, unknown>[];
      memberResourceIds: string[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      hasPrev: boolean;
      hasNext: boolean;
    }>
  >;
  addToPool: (
    resource: MediaResource,
  ) => Promise<IpcResponse<{ resource: Record<string, unknown> }>>;
  removeFromPool: (
    resourceId: string,
  ) => Promise<IpcResponse<{ completed: boolean }>>;
  getBalance: () => Promise<IpcResponse<{ balance: string }>>;
};

type OrdersApi = {
  getOrders: () => Promise<IpcResponse<{ items: Record<string, unknown>[] }>>;
  syncOrder: (
    orderNid: string,
  ) => Promise<IpcResponse<{ order: Record<string, unknown> }>>;
  openPublishedUrl: (
    orderNid: string,
  ) => Promise<IpcResponse<{ completed: boolean }>>;
};

function mediaApi(): MediaApi | null {
  if (!isElectron()) return null;
  return window.desktopConsole?.media as MediaApi | null;
}

function ordersApi(): OrdersApi | null {
  if (!isElectron()) return null;
  return window.desktopConsole?.orders as OrdersApi | null;
}

async function unwrap<T>(
  request: Promise<IpcResponse<T>>,
  message: string,
): Promise<T> {
  const result = await request;
  if (!result.ok) throw ipcError(result.error, message);
  if (result.data === undefined || result.data === null) {
    throw ipcError(result.error, message);
  }
  return result.data;
}

type ArticleSummary = Omit<
  Article,
  "content" | "words" | "tags" | "lastModified"
>;

function normalizeArticleSummary(raw: Record<string, unknown>): ArticleSummary {
  return {
    filename: String(raw.filename || ""),
    title: String(raw.title || ""),
    selectedResources: Array.isArray(raw.selectedResources)
      ? (raw.selectedResources as MediaResource[])
      : [],
    autoTitle: String(raw.autoTitle || ""),
    remark: String(raw.remark || ""),
    hasImages: Boolean(raw.hasImages),
    imageCount: typeof raw.imageCount === "number" ? raw.imageCount : 0,
    ignoreImages: Boolean(raw.ignoreImages),
  };
}

function normalizeArticlePreview(raw: Record<string, unknown>): Article {
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
    price: typeof raw.price === "string" ? raw.price : "",
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

export async function scanArticles(): Promise<ArticleSummary[]> {
  const api = mediaApi();
  if (!api) return [];
  const data = await unwrap(api.scanArticles(), "scanArticles failed");
  return data.items.map(normalizeArticleSummary);
}
export async function previewArticle(filename: string): Promise<Article> {
  const api = mediaApi();
  if (!api) throw unavailable("previewArticle failed");
  const data = await unwrap(
    api.previewArticle(filename),
    "previewArticle failed",
  );
  return normalizeArticlePreview(data.article);
}
export async function getDrafts(): Promise<Draft[]> {
  const api = mediaApi();
  if (!api) return [];
  return (await unwrap(api.getDrafts(), "getDrafts failed")).items;
}
export async function getDraft(filename: string): Promise<Draft> {
  const api = mediaApi();
  if (!api) throw unavailable("getDraft failed: " + filename);
  const data = await unwrap(
    api.getDraft(filename),
    "getDraft failed: " + filename,
  );
  if (!data.draft) throw unavailable("draft is unavailable: " + filename);
  return data.draft;
}
export async function setDraft(filename: string, draft: Draft): Promise<void> {
  const api = mediaApi();
  if (!api) return;
  const { filename: _filename, selectedResources, ...fields } = draft;
  await unwrap(
    api.setDraft(filename, {
      ...fields,
      selectedResources: selectedResources.map((resource) => ({
        resourceId: resource.resourceId,
        name: resource.name,
        price: resource.price,
      })) as MediaResource[],
    }),
    "setDraft failed",
  );
}
export async function removeDraft(filename: string): Promise<void> {
  const api = mediaApi();
  if (!api) return;
  await unwrap(api.removeDraft(filename), "removeDraft failed");
}
export async function buildConfirmation(articles: Article[]): Promise<unknown> {
  const api = mediaApi();
  if (!api) throw unavailable("buildConfirmation failed");
  return unwrap(
    api.buildConfirmation(
      articles.map((article) => ({
        filename: article.filename,
        resourceIds: article.selectedResources.map(
          (resource) => resource.resourceId,
        ),
      })),
    ),
    "buildConfirmation failed",
  );
}
export async function submitSelected(articles: Article[]): Promise<unknown> {
  const api = mediaApi();
  if (!api) throw unavailable("submitSelected failed");
  return unwrap(
    api.submitSelected(
      articles.map((article) => ({
        filename: article.filename,
        resourceIds: article.selectedResources.map(
          (resource) => resource.resourceId,
        ),
      })),
    ),
    "submitSelected failed",
  );
}
export async function stopSubmit(): Promise<void> {
  const api = mediaApi();
  if (!api) return;
  await unwrap(api.stopSubmit(), "stopSubmit failed");
}
export async function refreshResources(): Promise<
  MediaRefreshResult | undefined
> {
  const api = mediaApi();
  if (!api) return;
  return unwrap(api.refreshResources({}), "refreshResources failed");
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
  const api = mediaApi();
  const input = { page: opts.page || 1, pageSize: opts.pageSize || 50 };
  if (!api) return { items: [], total: 0, ...input };
  const raw = await unwrap(
    api.getResourcePage(input),
    "getResourcePage failed",
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
  const api = mediaApi();
  const input = {
    query: opts.query,
    page: opts.page || 1,
    pageSize: opts.pageSize || 50,
  };
  if (!api)
    return { items: [], total: 0, page: input.page, pageSize: input.pageSize };
  const raw = await unwrap(
    api.searchResourcePage(input),
    "searchResourcePage failed",
  );
  return {
    ...raw,
    items: (raw.items || []).map((item) =>
      normalizeResource(item as Record<string, unknown>),
    ),
  };
}
export async function getPoolPage(input: {
  page: number;
  pageSize: number;
  resourceIds: string[];
}): Promise<{
  items: MediaResource[];
  memberResourceIds: string[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}> {
  const api = mediaApi();
  if (!api)
    return {
      items: [],
      memberResourceIds: [],
      total: 0,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: 0,
      hasPrev: false,
      hasNext: false,
    };
  const data = await unwrap(api.getPool(input), "getPool failed");
  return { ...data, items: data.items.map(normalizeResource) };
}
export async function addToPool(resource: MediaResource): Promise<void> {
  const api = mediaApi();
  if (!api) return;
  await unwrap(api.addToPool(resource), "addToPool failed");
}
export async function removeFromPool(resourceId: string): Promise<void> {
  const api = mediaApi();
  if (!api) return;
  await unwrap(api.removeFromPool(resourceId), "removeFromPool failed");
}
export async function getBalance(): Promise<number> {
  const api = mediaApi();
  if (!api) return 0;
  const raw = await unwrap(api.getBalance(), "getBalance failed");
  return Number(raw.balance || 0);
}
export async function getOrders(): Promise<RealOrder[]> {
  const api = ordersApi();
  if (!api) return [];
  const data = await unwrap(api.getOrders(), "getOrders failed");
  return data.items.map(normalizeOrder);
}
export async function syncOrder(orderNid: string): Promise<unknown> {
  const api = ordersApi();
  if (!api) return null;
  return unwrap(api.syncOrder(orderNid), "syncOrder failed");
}
export async function openPublishedUrl(orderNid: string): Promise<void> {
  const api = ordersApi();
  if (!api) throw unavailable("openPublishedUrl");
  await unwrap(api.openPublishedUrl(orderNid), "openPublishedUrl failed");
}

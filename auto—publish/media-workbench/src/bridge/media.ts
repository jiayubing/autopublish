import type { Article, Draft, MediaResource, RealOrder } from "../types/media";
import type { IpcResponse } from "../types/ipc";
import { formatBeijingTime } from "../time-format";
import {
  ipcError,
  requireBridgeMethod,
  requireMediaApi,
  requireOrdersApi,
  unavailable,
} from "./transport";

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
  syncAllOrders: () => Promise<IpcResponse<OrderSyncAllResult>>;
  prepareOrderCancellation: (input: { orderId: string }) => Promise<IpcResponse<OrderCancellationPreparation>>;
  cancelOrder: (input: { orderId: string; confirmationToken: string }) => Promise<IpcResponse<OrderCancellationResult>>;
  prepareCancellationResolution: (input: { cancellationAttemptId: string }) => Promise<IpcResponse<CancellationResolutionPreparation>>;
  confirmCancellationSucceeded: (input: CancellationResolutionInput) => Promise<IpcResponse<CancellationResolutionResult>>;
  confirmCancellationNotApplied: (input: CancellationResolutionInput) => Promise<IpcResponse<CancellationResolutionResult>>;
  prepareOrderStatusAnomalyResolution: (input: {
    orderId: string;
  }) => Promise<IpcResponse<OrderAnomalyPreparation>>;
  resumeOrderTracking: (
    input: OrderAnomalyResolutionInput,
  ) => Promise<IpcResponse<OrderAnomalyResolutionResult>>;
  confirmOrderPublished: (
    input: OrderAnomalyResolutionInput,
  ) => Promise<IpcResponse<OrderAnomalyResolutionResult>>;
  confirmOrderNotPublished: (
    input: OrderAnomalyResolutionInput,
  ) => Promise<IpcResponse<OrderAnomalyResolutionResult>>;
  openPublishedUrl: (
    orderNid: string,
  ) => Promise<IpcResponse<{ completed: boolean }>>;
  prepareBindPaidOrderNumber: (input: {
    orderCreationAttemptId: string;
    orderId: string;
  }) => Promise<IpcResponse<PaidOrderResolutionPreparation>>;
  bindPaidOrderNumber: (input: {
    orderCreationAttemptId: string;
    orderId: string;
    confirmationToken: string;
  }) => Promise<IpcResponse<PaidOrderResolutionResult>>;
  prepareConfirmPaidOrderAbsent: (input: {
    orderCreationAttemptId: string;
  }) => Promise<IpcResponse<PaidOrderResolutionPreparation>>;
  confirmPaidOrderAbsent: (input: {
    orderCreationAttemptId: string;
    confirmationToken: string;
  }) => Promise<IpcResponse<PaidOrderResolutionResult>>;
};

export type OrderSyncAllResult = {
  items: Array<{ orderNid: string; ok: boolean; errorCode: string | null }>;
  succeeded: number;
  failed: number;
};

export type OrderCancellationPreparation = {
  orderId: string;
  cancellationAttemptId: string;
  actionLabel: "取消订单" | "尝试取消";
  riskCode: "CANCELLATION_MAY_BE_REJECTED" | null;
  confirmationToken: string;
  expiresAt: string;
};
export type OrderCancellationResult = {
  status: "cancelled" | "rejected" | "uncertain";
  cancellationAttemptId: string;
  manualCheckRequired: boolean;
  idempotent: boolean;
  publishedWins: boolean;
};
export type CancellationResolutionPreparation = {
  cancellationAttemptId: string;
  classification: "verified_cancelled" | "verified_active" | "inconclusive";
  evidenceFingerprint: string;
  confirmationToken: string;
};
export type CancellationResolutionInput = {
  cancellationAttemptId: string;
  evidenceFingerprint: string;
  confirmationToken: string;
};
export type CancellationResolutionResult = {
  status: "cancelled" | "rejected";
  idempotent: boolean;
};

export type OrderAnomalyPreparation = {
  orderId: string;
  classification:
    | "verified_trackable"
    | "verified_published"
    | "verified_non_published_terminal"
    | "inconclusive";
  confirmationToken: string;
  expiresAt: string;
  allowedActions: Array<
    "resumeOrderTracking" | "confirmOrderPublished" | "confirmOrderNotPublished"
  >;
};

export type OrderAnomalyResolutionInput = {
  orderId: string;
  confirmationToken: string;
};

export type OrderAnomalyResolutionResult = {
  orderId: string;
  status: "tracking_resumed" | "published" | "not_published";
  idempotent: boolean;
};

type PaidOrderResolutionPreparation = {
  orderCreationAttemptId: string;
  action: "bind_verified_order" | "confirm_no_order";
  confirmationToken: string;
  expiresAt: string;
  orderId?: string;
  observationFingerprint?: string;
};

type PaidOrderResolutionResult = {
  orderCreationAttemptId: string;
  orderId?: string;
  status: "order_bound" | "no_order";
  idempotent: boolean;
};

function mediaApi(): MediaApi {
  return requireMediaApi<MediaApi>();
}

function ordersApi(): OrdersApi {
  return requireOrdersApi<OrdersApi>();
}

async function unwrap<T>(
  request: Promise<IpcResponse<T>>,
  message: string,
): Promise<T> {
  const result = await request;
  if (!result || typeof result !== "object") {
    throw ipcError(undefined, message);
  }
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
    selectedResources: normalizeResources(raw.selectedResources),
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
    selectedResources: normalizeResources(raw.selectedResources),
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
  const type = ["image", "video", "audio", "document"].includes(
    String(raw.type),
  )
    ? (raw.type as MediaResource["type"])
    : "image";
  return {
    resourceId: String(raw.resourceId || raw.id || ""),
    name: String(raw.name || ""),
    price:
      typeof raw.price === "number" && Number.isFinite(raw.price)
        ? raw.price
        : null,
    type,
    url: typeof raw.url === "string" ? raw.url : undefined,
    duration: typeof raw.duration === "string" ? raw.duration : undefined,
    resolution: typeof raw.resolution === "string" ? raw.resolution : undefined,
    size: typeof raw.size === "string" ? raw.size : undefined,
    createdAt: String(raw.createdAt || ""),
  };
}

function normalizeResources(value: unknown): MediaResource[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    )
    .map(normalizeResource);
}

function normalizeOrder(raw: Record<string, unknown>): RealOrder {
  return {
    title: String(raw.title || ""),
    orderNid: String(raw.orderNid || ""),
    statusCode: String(raw.statusCode || ""),
    createdAt: String(raw.createdAt || ""),
    submittedAt: String(raw.submittedAt || ""),
    publishedAt: String(raw.publishedAt || ""),
    resourceName: String(raw.resourceName || ""),
    price: typeof raw.price === "string" ? raw.price : "",
    actualAmount: typeof raw.actualAmount === "string" ? raw.actualAmount : "",
    hasPublishedUrl: raw.hasPublishedUrl === true,
    anomaly:
      raw.anomaly && typeof raw.anomaly === "object"
        ? (raw.anomaly as RealOrder["anomaly"])
        : null,
    cancellation:
      raw.cancellation && typeof raw.cancellation === "object"
        ? (raw.cancellation as RealOrder["cancellation"])
        : null,
  };
}

export async function scanArticles(): Promise<ArticleSummary[]> {
  const api = mediaApi();
  const data = await unwrap(
    requireBridgeMethod(api.scanArticles)(),
    "scanArticles failed",
  );
  return data.items.map(normalizeArticleSummary);
}
export async function previewArticle(filename: string): Promise<Article> {
  const api = mediaApi();
  const data = await unwrap(
    requireBridgeMethod(api.previewArticle)(filename),
    "previewArticle failed",
  );
  return normalizeArticlePreview(data.article);
}
export async function getDrafts(): Promise<Draft[]> {
  const api = mediaApi();
  return (
    await unwrap(requireBridgeMethod(api.getDrafts)(), "getDrafts failed")
  ).items.map((draft) => ({
    ...draft,
    selectedResources: normalizeResources(draft.selectedResources),
  }));
}
export async function getDraft(filename: string): Promise<Draft> {
  const api = mediaApi();
  const data = await unwrap(
    requireBridgeMethod(api.getDraft)(filename),
    "getDraft failed: " + filename,
  );
  if (!data.draft) throw unavailable("Draft is unavailable");
  return {
    ...data.draft,
    selectedResources: normalizeResources(data.draft.selectedResources),
  };
}
export async function setDraft(filename: string, draft: Draft): Promise<void> {
  const api = mediaApi();
  const { filename: _filename, selectedResources, ...fields } = draft;
  await unwrap(
    requireBridgeMethod(api.setDraft)(filename, {
      ...fields,
      selectedResources: selectedResources.map((resource) => ({
        resourceId: resource.resourceId,
        name: resource.name,
        price: resource.price,
        type: resource.type,
      })) as MediaResource[],
    }),
    "setDraft failed",
  );
}
export async function refreshResources(): Promise<
  MediaRefreshResult | undefined
> {
  const api = mediaApi();
  return unwrap(
    requireBridgeMethod(api.refreshResources)({}),
    "refreshResources failed",
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
  const api = mediaApi();
  const input = { page: opts.page || 1, pageSize: opts.pageSize || 50 };
  const raw = await unwrap(
    requireBridgeMethod(api.getResourcePage)(input),
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
  const raw = await unwrap(
    requireBridgeMethod(api.searchResourcePage)(input),
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
  const data = await unwrap(
    requireBridgeMethod(api.getPool)(input),
    "getPool failed",
  );
  return { ...data, items: data.items.map(normalizeResource) };
}
export async function addToPool(resource: MediaResource): Promise<void> {
  const api = mediaApi();
  await unwrap(
    requireBridgeMethod(api.addToPool)(resource),
    "addToPool failed",
  );
}
export async function removeFromPool(resourceId: string): Promise<void> {
  const api = mediaApi();
  await unwrap(
    requireBridgeMethod(api.removeFromPool)(resourceId),
    "removeFromPool failed",
  );
}
export async function getBalance(): Promise<number> {
  const api = mediaApi();
  const raw = await unwrap(
    requireBridgeMethod(api.getBalance)(),
    "getBalance failed",
  );
  const balance = Number(raw.balance);
  if (!Number.isFinite(balance)) throw ipcError(undefined, "getBalance failed");
  return balance;
}
export async function getOrders(): Promise<RealOrder[]> {
  const api = ordersApi();
  const data = await unwrap(
    requireBridgeMethod(api.getOrders)(),
    "getOrders failed",
  );
  return data.items.map(normalizeOrder);
}
export async function syncOrder(orderNid: string): Promise<unknown> {
  const api = ordersApi();
  return unwrap(
    requireBridgeMethod(api.syncOrder)(orderNid),
    "syncOrder failed",
  );
}
export async function syncAllOrders(): Promise<OrderSyncAllResult> {
  const api = ordersApi();
  return unwrap(
    requireBridgeMethod(api.syncAllOrders)(),
    "syncAllOrders failed",
  );
}
export async function prepareOrderCancellation(orderId: string): Promise<OrderCancellationPreparation> {
  const api = ordersApi();
  return unwrap(requireBridgeMethod(api.prepareOrderCancellation)({ orderId }), "prepareOrderCancellation failed");
}
export async function cancelOrder(input: { orderId: string; confirmationToken: string }): Promise<OrderCancellationResult> {
  const api = ordersApi();
  return unwrap(requireBridgeMethod(api.cancelOrder)(input), "cancelOrder failed");
}
export async function prepareCancellationResolution(cancellationAttemptId: string): Promise<CancellationResolutionPreparation> {
  const api = ordersApi();
  return unwrap(requireBridgeMethod(api.prepareCancellationResolution)({ cancellationAttemptId }), "prepareCancellationResolution failed");
}
export async function confirmCancellationSucceeded(input: CancellationResolutionInput): Promise<CancellationResolutionResult> {
  const api = ordersApi();
  return unwrap(requireBridgeMethod(api.confirmCancellationSucceeded)(input), "confirmCancellationSucceeded failed");
}
export async function confirmCancellationNotApplied(input: CancellationResolutionInput): Promise<CancellationResolutionResult> {
  const api = ordersApi();
  return unwrap(requireBridgeMethod(api.confirmCancellationNotApplied)(input), "confirmCancellationNotApplied failed");
}
export async function prepareOrderStatusAnomalyResolution(
  orderId: string,
): Promise<OrderAnomalyPreparation> {
  const api = ordersApi();
  return unwrap(
    requireBridgeMethod(api.prepareOrderStatusAnomalyResolution)({ orderId }),
    "prepareOrderStatusAnomalyResolution failed",
  );
}
export async function resumeOrderTracking(
  input: OrderAnomalyResolutionInput,
): Promise<OrderAnomalyResolutionResult> {
  const api = ordersApi();
  return unwrap(
    requireBridgeMethod(api.resumeOrderTracking)(input),
    "resumeOrderTracking failed",
  );
}
export async function confirmOrderPublished(
  input: OrderAnomalyResolutionInput,
): Promise<OrderAnomalyResolutionResult> {
  const api = ordersApi();
  return unwrap(
    requireBridgeMethod(api.confirmOrderPublished)(input),
    "confirmOrderPublished failed",
  );
}
export async function confirmOrderNotPublished(
  input: OrderAnomalyResolutionInput,
): Promise<OrderAnomalyResolutionResult> {
  const api = ordersApi();
  return unwrap(
    requireBridgeMethod(api.confirmOrderNotPublished)(input),
    "confirmOrderNotPublished failed",
  );
}
export async function openPublishedUrl(orderNid: string): Promise<void> {
  const api = ordersApi();
  await unwrap(
    requireBridgeMethod(api.openPublishedUrl)(orderNid),
    "openPublishedUrl failed",
  );
}

export async function prepareBindPaidOrderNumber(input: {
  orderCreationAttemptId: string;
  orderId: string;
}): Promise<PaidOrderResolutionPreparation> {
  const api = ordersApi();
  return unwrap(
    requireBridgeMethod(api.prepareBindPaidOrderNumber)(input),
    "prepareBindPaidOrderNumber failed",
  );
}

export async function bindPaidOrderNumber(input: {
  orderCreationAttemptId: string;
  orderId: string;
  confirmationToken: string;
}): Promise<PaidOrderResolutionResult> {
  const api = ordersApi();
  return unwrap(
    requireBridgeMethod(api.bindPaidOrderNumber)(input),
    "bindPaidOrderNumber failed",
  );
}

export async function prepareConfirmPaidOrderAbsent(input: {
  orderCreationAttemptId: string;
}): Promise<PaidOrderResolutionPreparation> {
  const api = ordersApi();
  return unwrap(
    requireBridgeMethod(api.prepareConfirmPaidOrderAbsent)(input),
    "prepareConfirmPaidOrderAbsent failed",
  );
}

export async function confirmPaidOrderAbsent(input: {
  orderCreationAttemptId: string;
  confirmationToken: string;
}): Promise<PaidOrderResolutionResult> {
  const api = ordersApi();
  return unwrap(
    requireBridgeMethod(api.confirmPaidOrderAbsent)(input),
    "confirmPaidOrderAbsent failed",
  );
}

import { Article, ContentClient, ContentResearch, ContentTemplate, Draft, GeneratedContentArticle, IpcResponse, MediaResource, PlatformArticle, PlatformStatus, PlatformTarget, PlatformSubmitPlan, PlatformSubmitResult, RealOrder } from "./types";

// 鈹€鈹€鈹€ Global type declaration for desktopConsole 鈹€鈹€鈹€

interface DraftPayload extends Omit<Draft, "filename" | "selectedResources"> {
  selectedResources: Array<{ resourceId: string; name?: string; price?: number }>;
}

interface DesktopConsoleMedia {
  scanArticles(): Promise<IpcResponse<unknown[]>>;
  previewArticle(filename: string): Promise<IpcResponse<Record<string, unknown>>>;
  getDrafts(): Promise<IpcResponse<Draft[]>>;
  getDraft(filename: string): Promise<IpcResponse<Draft>>;
  setDraft(filename: string, draft: DraftPayload): Promise<IpcResponse<void>>;
  removeDraft(filename: string): Promise<IpcResponse<void>>;
  buildConfirmation(articles: MediaSubmission[]): Promise<IpcResponse<unknown>>;
  submitSelected(articles: MediaSubmission[]): Promise<IpcResponse<unknown>>;
  stopSubmit(): Promise<IpcResponse<void>>;
  refreshResources(opts?: Record<string, unknown>): Promise<IpcResponse<unknown>>;
  getResourcePage(opts: { page?: number; pageSize?: number }): Promise<IpcResponse<{ items: MediaResource[]; total: number; page: number; pageSize: number }>>;
  searchResourcePage(opts: { query: string; page?: number; pageSize?: number }): Promise<IpcResponse<{ items: MediaResource[]; total: number; page: number; pageSize: number }>>;
  getPool(): Promise<IpcResponse<MediaResource[]>>;
  addToPool(resource: MediaResource): Promise<IpcResponse<void>>;
  removeFromPool(resourceId: string): Promise<IpcResponse<void>>;
  getBalance(): Promise<IpcResponse<{ balance: string; raw?: unknown }>>;
}

interface DesktopConsoleOrders {
  getOrders(): Promise<IpcResponse<RealOrder[]>>;
  syncOrder(orderNid: string): Promise<IpcResponse<unknown>>;
}

interface DesktopConsolePlatforms {
  getQueue(): Promise<IpcResponse<unknown>>;
  buildSelectedPlan(input: PlatformSubmission): Promise<IpcResponse<unknown>>;
  submitSelectedPlan(input: PlatformSubmission): Promise<IpcResponse<unknown>>;
  pauseSubmit(): Promise<IpcResponse<unknown>>;
  stopSubmit(): Promise<IpcResponse<unknown>>;
  getState(): Promise<IpcResponse<PlatformStatus>>;
  onState(listener: (state: PlatformStatus) => void): () => void;
}

interface MediaSubmission { filename: string; resourceIds: string[]; draftRevision?: string; }
interface PlatformSubmission { sourcePlatformId: string; filename: string; targetPlatformIds: string[]; }

interface DesktopConsoleContent {
  listClients(): Promise<IpcResponse<ContentClient[]>>;
  listResearch(clientId: string): Promise<IpcResponse<ContentResearch[]>>;
  listTemplates(platform: string): Promise<IpcResponse<ContentTemplate[]>>;
  generateArticle(input: { clientId: string; researchQueryId: string; platform: string; templateId: string }): Promise<IpcResponse<GeneratedContentArticle>>;
  saveArticle(article: GeneratedContentArticle): Promise<IpcResponse<GeneratedContentArticle>>;
  listGeneratedArticles(clientId: string): Promise<IpcResponse<GeneratedContentArticle[]>>;
}

interface DesktopConsole {
  media: DesktopConsoleMedia;
  orders: DesktopConsoleOrders;
  platforms: DesktopConsolePlatforms;
  content: DesktopConsoleContent;
}

declare global {
  interface Window {
    desktopConsole?: DesktopConsole;
  }
}

// 鈹€鈹€鈹€ Helper utilities 鈹€鈹€鈹€

export function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.desktopConsole;
}

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Silently ignore quota/access errors
  }
}

function getIpcError(value: unknown, fallback: string): Error {
  if (value && typeof value === "object" && "message" in value) return new Error(String((value as { message: unknown }).message));
  return new Error(typeof value === "string" ? value : fallback);
}

export async function listContentClients(): Promise<ContentClient[]> {
  if (!isElectron()) return [];
  const result = await window.desktopConsole!.content.listClients();
  if (!result.ok) throw getIpcError(result.error, "Unable to load clients");
  return result.data || [];
}

export async function listContentResearch(clientId: string): Promise<ContentResearch[]> {
  if (!isElectron()) return [];
  const result = await window.desktopConsole!.content.listResearch(clientId);
  if (!result.ok) throw getIpcError(result.error, "Unable to load research");
  return result.data || [];
}

export async function listContentTemplates(platform: string): Promise<ContentTemplate[]> {
  if (!isElectron()) return [];
  const result = await window.desktopConsole!.content.listTemplates(platform);
  if (!result.ok) throw getIpcError(result.error, "Unable to load templates");
  return result.data || [];
}

export async function generateContentArticle(input: { clientId: string; researchQueryId: string; platform: string; templateId: string }): Promise<GeneratedContentArticle> {
  if (!isElectron()) throw new Error("AI content generation requires the desktop app");
  const result = await window.desktopConsole!.content.generateArticle(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to generate article");
  return result.data;
}

export async function saveContentArticle(article: GeneratedContentArticle): Promise<GeneratedContentArticle> {
  if (!isElectron()) throw new Error("AI content saving requires the desktop app");
  const result = await window.desktopConsole!.content.saveArticle(article);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to save article");
  return result.data;
}

export async function listContentArticles(clientId: string): Promise<GeneratedContentArticle[]> {
  if (!isElectron()) return [];
  const result = await window.desktopConsole!.content.listGeneratedArticles(clientId);
  if (!result.ok) throw getIpcError(result.error, "Unable to load generated articles");
  return result.data || [];
}

// 鈹€鈹€鈹€ Data normalization (backend 鈫?React types) 鈹€鈹€鈹€

function normalizeArticle(raw: Record<string, unknown>): Article {
  return {
    filename: String(raw.filename || ""),
    title: String(raw.title || ""),
    content: String(raw.content || ""),
    words: typeof raw.words === "number" && raw.words > 0 ? raw.words : (typeof raw.content === "string" ? raw.content.replace(/\s/g, "").length : 0),
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    selectedResources: Array.isArray(raw.selectedResources)
      ? (raw.selectedResources as MediaResource[])
      : [],
    lastModified: String(
      raw.lastModified ||
        new Date().toISOString().replace("T", " ").substring(0, 16)
    ),
    // IPC fields preserved from scanArticles service
    filePath: String(raw.filePath || ""),
    autoTitle: String(raw.autoTitle || ""),
    remark: String(raw.remark || ""),
    hasImages: Boolean(raw.hasImages),
    imageCount: typeof raw.imageCount === "number" ? raw.imageCount : 0,
    ignoreImages: Boolean(raw.ignoreImages),
  };
}

function normalizeOrder(raw: Record<string, unknown>): RealOrder {
  return {
    title: String(raw.title || ""),
    filename: String(raw.filename || ""),
    orderNid: String(raw.orderNid || ""),
    statusCode: String(raw.statusCode || ""),
    statusLabel: String(raw.statusLabel || ""),
    submittedAt: String(raw.submittedAt || ""),
    publishedAt: String(raw.publishedAt || ""),
    resourceId: String(raw.resourceId || ""),
    resourceName: String(raw.resourceName || ""),
    price: String(raw.price != null ? raw.price : ""),
    orderUrl: String(raw.orderUrl || ""),
  };
}

function normalizeResource(raw: Record<string, unknown>): MediaResource {
  return {
    resourceId: String(raw.resourceId || ""),
    name: String(raw.name || ""),
    price: Number(raw.price) || 0,
    type: (raw.type as MediaResource["type"]) || "image",
    url: raw.url ? String(raw.url) : undefined,
    duration: raw.duration ? String(raw.duration) : undefined,
    resolution: raw.resolution ? String(raw.resolution) : undefined,
    size: raw.size ? String(raw.size) : undefined,
    createdAt: String(raw.createdAt || ""),
  };
}

// 鈹€鈹€鈹€ Fallback implementations (dev / no-Electron mode) 鈹€鈹€鈹€

async function fallbackScanArticles(): Promise<Article[]> {
  return readLocalStorage<Article[]>("mw_articles", []);
}

async function fallbackPreviewArticle(filename: string): Promise<Article> {
  const articles = readLocalStorage<Article[]>("mw_articles", []);
  const article = articles.find((a) => a.filename === filename);
  if (!article) throw new Error("Article not found: " + filename);
  return article;
}

async function fallbackGetDrafts(): Promise<Draft[]> {
  return readLocalStorage<Draft[]>("mw_drafts", []);
}

async function fallbackGetDraft(filename: string): Promise<Draft> {
  const drafts = readLocalStorage<Draft[]>("mw_drafts", []);
  const draft = drafts.find((d) => d.filename === filename);
  if (!draft) throw new Error("Draft not found: " + filename);
  return draft;
}

async function fallbackSetDraft(
  filename: string,
  draft: Draft
): Promise<void> {
  const drafts = readLocalStorage<Draft[]>("mw_drafts", []);
  const idx = drafts.findIndex((d) => d.filename === filename);
  if (idx >= 0) drafts[idx] = draft;
  else drafts.push(draft);
  writeLocalStorage("mw_drafts", drafts);
}

async function fallbackRemoveDraft(filename: string): Promise<void> {
  const drafts = readLocalStorage<Draft[]>("mw_drafts", []);
  writeLocalStorage("mw_drafts", drafts.filter((d) => d.filename !== filename));
}

async function fallbackBuildConfirmation(
  articles: Article[]
): Promise<unknown> {
  // Return a minimal confirmation shape for dev mode
  return { articleCount: articles.length, platforms: [] };
}

async function fallbackSubmitSelected(
  articles: Article[]
): Promise<unknown> {
  // No-op in dev; return empty success envelope
  return { ok: 1, fail: 0, skipped: 0, results: [] };
}

async function fallbackStopSubmit(): Promise<void> {
  // No-op
}

async function fallbackRefreshResources(
  _opts?: Record<string, unknown>
): Promise<void> {
  // No-op
}

async function fallbackGetResourcePage(_opts: {
  page?: number;
  pageSize?: number;
}): Promise<{
  items: MediaResource[];
  total: number;
  page: number;
  pageSize: number;
}> {
  return { items: [], total: 0, page: 1, pageSize: 20 };
}

async function fallbackSearchResourcePage(_opts: {
  query: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  items: MediaResource[];
  total: number;
  page: number;
  pageSize: number;
}> {
  return { items: [], total: 0, page: 1, pageSize: 20 };
}

async function fallbackGetPool(): Promise<MediaResource[]> {
  return readLocalStorage<MediaResource[]>("mw_pool", []);
}

async function fallbackAddToPool(resource: MediaResource): Promise<void> {
  const pool = readLocalStorage<MediaResource[]>("mw_pool", []);
  if (!pool.some((r) => r.resourceId === resource.resourceId)) {
    pool.push(resource);
    writeLocalStorage("mw_pool", pool);
  }
}

async function fallbackRemoveFromPool(resourceId: string): Promise<void> {
  const pool = readLocalStorage<MediaResource[]>("mw_pool", []);
  writeLocalStorage(
    "mw_pool",
    pool.filter((r) => r.resourceId !== resourceId)
  );
}

async function fallbackGetBalance(): Promise<number> {
  return 0;
}

async function fallbackGetOrders(): Promise<RealOrder[]> {
  return [];
}

async function fallbackSyncOrder(_orderNid: string): Promise<unknown> {
  return { synced: false };
}

// 鈹€鈹€鈹€ Public API exports 鈹€鈹€鈹€

export async function scanArticles(): Promise<Article[]> {
  if (isElectron()) {
    const result = await window.desktopConsole!.media.scanArticles();
    if (!result.ok) throw getIpcError(result.error, "scanArticles failed");
    const rawList = result.data || [];
    return rawList.map((item: unknown) =>
      normalizeArticle(item as Record<string, unknown>)
    );
  }
  return fallbackScanArticles();
}

export async function previewArticle(
  filename: string
): Promise<Article> {
  if (isElectron()) {
    const result =
      await window.desktopConsole!.media.previewArticle(filename);
    if (!result.ok)
      throw getIpcError(result.error, "previewArticle failed");
    return normalizeArticle(result.data as Record<string, unknown>);
  }
  return fallbackPreviewArticle(filename);
}

export async function getDrafts(): Promise<Draft[]> {
  if (isElectron()) {
    const result = await window.desktopConsole!.media.getDrafts();
    if (!result.ok) throw getIpcError(result.error, "getDrafts failed");
    return (result.data || []) as Draft[];
  }
  return fallbackGetDrafts();
}

export async function getDraft(filename: string): Promise<Draft> {
  if (isElectron()) {
    const result = await window.desktopConsole!.media.getDraft(filename);
    if (!result.ok)
      throw getIpcError(result.error, "getDraft failed: " + filename);
    return result.data as Draft;
  }
  return fallbackGetDraft(filename);
}

export async function setDraft(
  filename: string,
  draft: Draft
): Promise<void> {
  if (isElectron()) {
    const { filename: _filename, selectedResources, ...fields } = draft;
    const result = await window.desktopConsole!.media.setDraft(filename, {
      ...fields,
      selectedResources: selectedResources.map((resource) => ({ resourceId: resource.resourceId, name: resource.name, price: resource.price })),
    });
    if (!result.ok) throw getIpcError(result.error, "setDraft failed");
    return;
  }
  await fallbackSetDraft(filename, draft);
}

export async function removeDraft(filename: string): Promise<void> {
  if (isElectron()) {
    const result = await window.desktopConsole!.media.removeDraft(filename);
    if (!result.ok) throw getIpcError(result.error, "removeDraft failed");
    return;
  }
  await fallbackRemoveDraft(filename);
}

export async function buildConfirmation(
  articles: Article[]
): Promise<unknown> {
  if (isElectron()) {
    const result =
      await window.desktopConsole!.media.buildConfirmation(articles.map((article) => ({ filename: article.filename, resourceIds: article.selectedResources.map((resource) => resource.resourceId) })));
    if (!result.ok)
      throw getIpcError(result.error, "buildConfirmation failed");
    return result.data;
  }
  return fallbackBuildConfirmation(articles);
}

export async function submitSelected(
  articles: Article[]
): Promise<unknown> {
  if (isElectron()) {
    const result =
      await window.desktopConsole!.media.submitSelected(articles.map((article) => ({ filename: article.filename, resourceIds: article.selectedResources.map((resource) => resource.resourceId) })));
    if (!result.ok)
      throw getIpcError(result.error, "submitSelected failed");
    return result.data;
  }
  return fallbackSubmitSelected(articles);
}

export async function stopSubmit(): Promise<void> {
  if (isElectron()) {
    const result = await window.desktopConsole!.media.stopSubmit();
    if (!result.ok) throw getIpcError(result.error, "stopSubmit failed");
    return;
  }
  await fallbackStopSubmit();
}

export async function refreshResources(
  opts?: Record<string, unknown>
): Promise<void> {
  if (isElectron()) {
    const result =
      await window.desktopConsole!.media.refreshResources(opts);
    if (!result.ok)
      throw getIpcError(result.error, "refreshResources failed");
    return;
  }
  await fallbackRefreshResources(opts);
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
  if (isElectron()) {
    const result =
      await window.desktopConsole!.media.getResourcePage(opts);
    if (!result.ok)
      throw getIpcError(result.error, "getResourcePage failed");
    const raw = result.data!;
    return {
      items: (raw.items || []).map((r: unknown) => normalizeResource(r as Record<string, unknown>)),
      total: raw.total,
      page: raw.page,
      pageSize: raw.pageSize,
    };
  }
  return fallbackGetResourcePage(opts);
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
  if (isElectron()) {
    const result =
      await window.desktopConsole!.media.searchResourcePage(opts);
    if (!result.ok)
      throw getIpcError(result.error, "searchResourcePage failed");
    const raw = result.data!;
    return {
      items: (raw.items || []).map((r: unknown) => normalizeResource(r as Record<string, unknown>)),
      total: raw.total,
      page: raw.page,
      pageSize: raw.pageSize,
    };
  }
  return fallbackSearchResourcePage(opts);
}

export async function getPool(): Promise<MediaResource[]> {
  if (isElectron()) {
    const result = await window.desktopConsole!.media.getPool();
    if (!result.ok) throw getIpcError(result.error, "getPool failed");
    const rawPool = result.data || [];
    return rawPool.map((r: unknown) => normalizeResource(r as Record<string, unknown>));
  }
  return fallbackGetPool();
}

export async function addToPool(resource: MediaResource): Promise<void> {
  if (isElectron()) {
    const result =
      await window.desktopConsole!.media.addToPool(resource);
    if (!result.ok) throw getIpcError(result.error, "addToPool failed");
    return;
  }
  await fallbackAddToPool(resource);
}

export async function removeFromPool(resourceId: string): Promise<void> {
  if (isElectron()) {
    const result =
      await window.desktopConsole!.media.removeFromPool(resourceId);
    if (!result.ok)
      throw getIpcError(result.error, "removeFromPool failed");
    return;
  }
  await fallbackRemoveFromPool(resourceId);
}

export async function getBalance(): Promise<number> {
  if (isElectron()) {
    const result = await window.desktopConsole!.media.getBalance();
    if (!result.ok) throw getIpcError(result.error, "getBalance failed");
    return Number((result.data as { balance: string }).balance || 0);
  }
  return fallbackGetBalance();
}

export async function getOrders(): Promise<RealOrder[]> {
  if (isElectron()) {
    const result = await window.desktopConsole!.orders.getOrders();
    if (!result.ok) throw getIpcError(result.error, "getOrders failed");
    const rawList = result.data || [];
    return rawList.map((item: unknown) =>
      normalizeOrder(item as Record<string, unknown>)
    );
  }
  return fallbackGetOrders();
}

export async function syncOrder(orderNid: string): Promise<unknown> {
  if (isElectron()) {
    const result =
      await window.desktopConsole!.orders.syncOrder(orderNid);
    if (!result.ok) throw getIpcError(result.error, "syncOrder failed");
    return result.data;
  }
  return fallbackSyncOrder(orderNid);
}

// ============ Platform APIs ============

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  lieju: '列举网',
  toutiao: '头条',
  hepan: '蓝色河畔',
};

export function getPlatformDisplayName(id: string): string {
  return PLATFORM_DISPLAY_NAMES[id] || id;
}

export async function getPlatformQueue(): Promise<{
  platforms: PlatformTarget[];
  queue: PlatformArticle[];
}> {
  if (isElectron()) {
    const result = await window.desktopConsole!.platforms.getQueue();
    if (!result.ok) throw getIpcError(result.error, 'getPlatformQueue failed');
    const data = result.data as {
      platforms: Array<{ id: string; scanDir: string }>;
      queue: PlatformArticle[];
    };
    return {
      platforms: data.platforms.map((p) => ({
        id: p.id,
        displayName: getPlatformDisplayName(p.id),
        scanDir: p.scanDir,
      })),
      queue: data.queue || [],
    };
  }
  return { platforms: [], queue: [] };
}

export async function buildPlatformPlan(input: {
  articles: PlatformArticle[];
  platformIds: string[];
}): Promise<PlatformSubmitPlan> {
  if (isElectron()) {
    const plans = await Promise.all(input.articles.map(async (article) => {
      const result = await window.desktopConsole!.platforms.buildSelectedPlan({ sourcePlatformId: article.sourcePlatformId, filename: article.filename, targetPlatformIds: input.platformIds });
      if (!result.ok) throw getIpcError(result.error, 'buildPlatformPlan failed');
      return result.data as PlatformSubmitPlan;
    }));
    return { taskCount: plans.reduce((count, plan) => count + plan.taskCount, 0), tasks: plans.flatMap((plan) => plan.tasks) };
  }
  return { taskCount: 0, tasks: [] };
}

export async function submitPlatformPlan(
  plan: PlatformSubmitPlan
): Promise<PlatformSubmitResult> {
  if (isElectron()) {
    const submissions = new Map<string, PlatformSubmission>();
    plan.tasks.forEach((task) => {
      const key = task.sourcePlatformId + "\u0000" + task.filename;
      const submission = submissions.get(key) || { sourcePlatformId: task.sourcePlatformId, filename: task.filename, targetPlatformIds: [] };
      if (!submission.targetPlatformIds.includes(task.targetPlatformId)) submission.targetPlatformIds.push(task.targetPlatformId);
      submissions.set(key, submission);
    });
    const results = await Promise.all([...submissions.values()].map(async (submission) => {
      const result = await window.desktopConsole!.platforms.submitSelectedPlan(submission);
      if (!result.ok) throw getIpcError(result.error, 'submitPlatformPlan failed');
      return result.data as PlatformSubmitResult;
    }));
    return results.reduce<PlatformSubmitResult>((total, result) => ({ ok: total.ok + result.ok, fail: total.fail + result.fail, skipped: total.skipped + result.skipped, results: total.results.concat(result.results) }), { ok: 0, fail: 0, skipped: 0, results: [] });
  }
  return { ok: 0, fail: 0, skipped: 0, results: [] };
}

export async function pausePlatformSubmit(): Promise<void> {
  if (isElectron()) {
    const result = await window.desktopConsole!.platforms.pauseSubmit();
    if (!result.ok) throw getIpcError(result.error, "pausePlatformSubmit failed");
    return;
  }
}

export async function stopPlatformSubmit(): Promise<void> {
  if (isElectron()) {
    const result = await window.desktopConsole!.platforms.stopSubmit();
    if (!result.ok) throw getIpcError(result.error, "stopPlatformSubmit failed");
    return;
  }
}

export async function getPlatformState(): Promise<PlatformStatus> {
  if (isElectron()) {
    const result = await window.desktopConsole!.platforms.getState();
    if (!result.ok) return { isBatchRunning: false, isStopPending: false, isPlatformRunning: false };
    return result.data || { isBatchRunning: false, isStopPending: false, isPlatformRunning: false };
  }
  return { isBatchRunning: false, isStopPending: false, isPlatformRunning: false };
}

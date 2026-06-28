import { Article, Draft, MediaResource, Order } from "./types";
import { INITIAL_ARTICLES, INITIAL_RESOURCES, INITIAL_ORDERS } from "./mockData";

// 鈹€鈹€ Global type declaration for desktopConsole 鈹€鈹€

interface DesktopConsoleMedia {
  scanArticles(): Promise<{ ok: boolean; data?: unknown[]; error?: string }>;
  previewArticle(filename: string): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }>;
  getDrafts(): Promise<{ ok: boolean; data?: Draft[]; error?: string }>;
  getDraft(filename: string): Promise<{ ok: boolean; data?: Draft; error?: string }>;
  setDraft(filename: string, draft: Draft): Promise<{ ok: boolean; error?: string }>;
  removeDraft(filename: string): Promise<{ ok: boolean; error?: string }>;
  buildConfirmation(articles: Article[]): Promise<{ ok: boolean; data?: unknown; error?: string }>;
  submitSelected(articles: Article[]): Promise<{ ok: boolean; data?: unknown; error?: string }>;
  stopSubmit(): Promise<{ ok: boolean; error?: string }>;
  refreshResources(opts?: Record<string, unknown>): Promise<{ ok: boolean; data?: unknown; error?: string }>;
  getResourcePage(opts: { page?: number; pageSize?: number }): Promise<{ ok: boolean; data?: { items: MediaResource[]; total: number; page: number; pageSize: number }; error?: string }>;
  searchResourcePage(opts: { query: string; page?: number; pageSize?: number }): Promise<{ ok: boolean; data?: { items: MediaResource[]; total: number; page: number; pageSize: number }; error?: string }>;
  getPool(): Promise<{ ok: boolean; data?: MediaResource[]; error?: string }>;
  addToPool(resource: MediaResource): Promise<{ ok: boolean; error?: string }>;
  removeFromPool(resourceId: string): Promise<{ ok: boolean; error?: string }>;
  getBalance(): Promise<{ ok: boolean; data?: number; error?: string }>;
}

interface DesktopConsoleOrders {
  getOrders(): Promise<{ ok: boolean; data?: Order[]; error?: string }>;
  syncOrder(orderNid: string): Promise<{ ok: boolean; data?: unknown; error?: string }>;
}

interface DesktopConsole {
  media: DesktopConsoleMedia;
  orders: DesktopConsoleOrders;
}

declare global {
  interface Window {
    desktopConsole?: DesktopConsole;
  }
}

// 鈹€鈹€ Helper utilities 鈹€鈹€

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

// 鈹€鈹€ Data normalization (backend 鈫?React types) 鈹€鈹€

function normalizeArticle(raw: Record<string, unknown>): Article {
  return {
    filename: String(raw.filename || ""),
    title: String(raw.title || ""),
    content: String(raw.content || ""),
    words: typeof raw.words === "number" ? raw.words : 0,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    selectedResources: Array.isArray(raw.selectedResources)
      ? (raw.selectedResources as MediaResource[])
      : [],
    lastModified: String(
      raw.lastModified ||
        new Date().toISOString().replace("T", " ").substring(0, 16)
    ),
  };
}

// 鈹€鈹€ Fallback implementations (dev / no-Electron mode) 鈹€鈹€

async function fallbackScanArticles(): Promise<Article[]> {
  return readLocalStorage<Article[]>("mw_articles", INITIAL_ARTICLES);
}

async function fallbackPreviewArticle(filename: string): Promise<Article> {
  const articles = readLocalStorage<Article[]>("mw_articles", INITIAL_ARTICLES);
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

async function fallbackSetDraft(filename: string, draft: Draft): Promise<void> {
  const drafts = readLocalStorage<Draft[]>("mw_drafts", []);
  const idx = drafts.findIndex((d) => d.filename === filename);
  if (idx >= 0) {
    drafts[idx] = draft;
  } else {
    drafts.push(draft);
  }
  writeLocalStorage("mw_drafts", drafts);
}

async function fallbackRemoveDraft(filename: string): Promise<void> {
  const drafts = readLocalStorage<Draft[]>("mw_drafts", []);
  writeLocalStorage(
    "mw_drafts",
    drafts.filter((d) => d.filename !== filename)
  );
}

async function fallbackBuildConfirmation(
  _articles: Article[]
): Promise<unknown> {
  return { built: _articles.length };
}

async function fallbackSubmitSelected(
  _articles: Article[]
): Promise<unknown> {
  return { submitted: _articles.length };
}

async function fallbackStopSubmit(): Promise<void> {
  // No-op in fallback
}

async function fallbackRefreshResources(
  _opts?: Record<string, unknown>
): Promise<void> {
  // No-op in fallback 鈥?data lives in localStorage
}

async function fallbackGetResourcePage(opts: {
  page?: number;
  pageSize?: number;
}): Promise<{
  items: MediaResource[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const all = readLocalStorage<MediaResource[]>(
    "mw_resources",
    INITIAL_RESOURCES
  );
  const page = opts.page || 1;
  const pageSize = opts.pageSize || 20;
  const start = (page - 1) * pageSize;
  return {
    items: all.slice(start, start + pageSize),
    total: all.length,
    page,
    pageSize,
  };
}

async function fallbackSearchResourcePage(opts: {
  query: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  items: MediaResource[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const all = readLocalStorage<MediaResource[]>(
    "mw_resources",
    INITIAL_RESOURCES
  );
  const q = (opts.query || "").toLowerCase();
  const filtered = all.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.resourceId.toLowerCase().includes(q)
  );
  const page = opts.page || 1;
  const pageSize = opts.pageSize || 20;
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
  };
}

async function fallbackGetPool(): Promise<MediaResource[]> {
  return readLocalStorage<MediaResource[]>("mw_pool", []);
}

async function fallbackAddToPool(resource: MediaResource): Promise<void> {
  const pool = readLocalStorage<MediaResource[]>("mw_pool", []);
  if (!pool.find((r) => r.resourceId === resource.resourceId)) {
    pool.push(resource);
  }
  writeLocalStorage("mw_pool", pool);
}

async function fallbackRemoveFromPool(resourceId: string): Promise<void> {
  const pool = readLocalStorage<MediaResource[]>("mw_pool", []);
  writeLocalStorage(
    "mw_pool",
    pool.filter((r) => r.resourceId !== resourceId)
  );
}

async function fallbackGetBalance(): Promise<number> {
  return readLocalStorage<number>("mw_balance", 3420.5);
}

async function fallbackGetOrders(): Promise<Order[]> {
  return readLocalStorage<Order[]>("mw_orders", INITIAL_ORDERS);
}

async function fallbackSyncOrder(_orderNid: string): Promise<unknown> {
  return { synced: _orderNid };
}

// 鈹€鈹€ Public API functions 鈹€鈹€

export async function scanArticles(): Promise<Article[]> {
  if (isElectron()) {
    const result = await window.desktopConsole!.media.scanArticles();
    if (!result.ok) throw new Error(result.error || "scanArticles failed");
    const rawArticles = result.data || [];
    return rawArticles.map((r: unknown) => normalizeArticle(r as Record<string, unknown>));
  }
  return fallbackScanArticles();
}

export async function previewArticle(filename: string): Promise<Article> {
  if (isElectron()) {
    const result =
      await window.desktopConsole!.media.previewArticle(filename);
    if (!result.ok)
      throw new Error(result.error || "previewArticle failed");
    return normalizeArticle(result.data || {});
  }
  return fallbackPreviewArticle(filename);
}

export async function getDrafts(): Promise<Draft[]> {
  if (isElectron()) {
    const result = await window.desktopConsole!.media.getDrafts();
    if (!result.ok) throw new Error(result.error || "getDrafts failed");
    return result.data!;
  }
  return fallbackGetDrafts();
}

export async function getDraft(filename: string): Promise<Draft> {
  if (isElectron()) {
    const result = await window.desktopConsole!.media.getDraft(filename);
    if (!result.ok) throw new Error(result.error || "getDraft failed");
    return result.data!;
  }
  return fallbackGetDraft(filename);
}

export async function setDraft(
  filename: string,
  draft: Draft
): Promise<void> {
  if (isElectron()) {
    const result = await window.desktopConsole!.media.setDraft(filename, draft);
    if (!result.ok) throw new Error(result.error || "setDraft failed");
    return;
  }
  await fallbackSetDraft(filename, draft);
}

export async function removeDraft(filename: string): Promise<void> {
  if (isElectron()) {
    const result = await window.desktopConsole!.media.removeDraft(filename);
    if (!result.ok) throw new Error(result.error || "removeDraft failed");
    return;
  }
  await fallbackRemoveDraft(filename);
}

export async function buildConfirmation(
  articles: Article[]
): Promise<unknown> {
  if (isElectron()) {
    const result =
      await window.desktopConsole!.media.buildConfirmation(articles);
    if (!result.ok)
      throw new Error(result.error || "buildConfirmation failed");
    return result.data;
  }
  return fallbackBuildConfirmation(articles);
}

export async function submitSelected(
  articles: Article[]
): Promise<unknown> {
  if (isElectron()) {
    const result =
      await window.desktopConsole!.media.submitSelected(articles);
    if (!result.ok)
      throw new Error(result.error || "submitSelected failed");
    return result.data;
  }
  return fallbackSubmitSelected(articles);
}

export async function stopSubmit(): Promise<void> {
  if (isElectron()) {
    const result = await window.desktopConsole!.media.stopSubmit();
    if (!result.ok) throw new Error(result.error || "stopSubmit failed");
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
      throw new Error(result.error || "refreshResources failed");
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
      throw new Error(result.error || "getResourcePage failed");
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
      throw new Error(result.error || "searchResourcePage failed");
    return result.data!;
  }
  return fallbackSearchResourcePage(opts);
}

export async function getPool(): Promise<MediaResource[]> {
  if (isElectron()) {
    const result = await window.desktopConsole!.media.getPool();
    if (!result.ok) throw new Error(result.error || "getPool failed");
    const rawPool = result.data || [];
    return rawPool.map((r: unknown) => normalizeResource(r as Record<string, unknown>));
  }
  return fallbackGetPool();
}

export async function addToPool(resource: MediaResource): Promise<void> {
  if (isElectron()) {
    const result =
      await window.desktopConsole!.media.addToPool(resource);
    if (!result.ok) throw new Error(result.error || "addToPool failed");
    return;
  }
  await fallbackAddToPool(resource);
}

export async function removeFromPool(resourceId: string): Promise<void> {
  if (isElectron()) {
    const result =
      await window.desktopConsole!.media.removeFromPool(resourceId);
    if (!result.ok)
      throw new Error(result.error || "removeFromPool failed");
    return;
  }
  await fallbackRemoveFromPool(resourceId);
}

export async function getBalance(): Promise<number> {
  if (isElectron()) {
    const result = await window.desktopConsole!.media.getBalance();
    if (!result.ok) throw new Error(result.error || "getBalance failed");
    return result.data!;
  }
  return fallbackGetBalance();
}

export async function getOrders(): Promise<Order[]> {
  if (isElectron()) {
    const result = await window.desktopConsole!.orders.getOrders();
    if (!result.ok) throw new Error(result.error || "getOrders failed");
    return result.data!;
  }
  return fallbackGetOrders();
}

export async function syncOrder(orderNid: string): Promise<unknown> {
  if (isElectron()) {
    const result =
      await window.desktopConsole!.orders.syncOrder(orderNid);
    if (!result.ok) throw new Error(result.error || "syncOrder failed");
    return result.data;
  }
  return fallbackSyncOrder(orderNid);
}

// 鈹€鈹€ Fallback persistence helpers (for App.tsx to use when not in Electron) 鈹€鈹€

export function persistArticles(articles: Article[]): void {
  writeLocalStorage("mw_articles", articles);
}

export function persistResources(resources: MediaResource[]): void {
  writeLocalStorage("mw_resources", resources);
}

export function persistOrders(orders: Order[]): void {
  writeLocalStorage("mw_orders", orders);
}

export function persistBalance(balance: number): void {
  writeLocalStorage("mw_balance", balance);
}
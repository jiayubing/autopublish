import { AiProviderClearResult, AiProviderConfigInput, AiProviderStatus, AiProviderTestResult, Article, ContentClient, ContentQuestion, ContentResearch, ContentTemplate, Draft, DoubaoBatchMode, DoubaoBatchPreview, DoubaoBatchTask, DoubaoLoginState, DoubaoQueueState, GeneratedContentArticle, GenerationBatchState, IpcResponse, MediaResource, PlatformArticle, PlatformStatus, PlatformTarget, PlatformSubmitPlan, PlatformSubmitResult, RealOrder, WorkspaceBootstrapState, WorkspaceConfirmationResult, WorkspaceCurrent, WorkspaceSelectionToken } from "./types";


// Global type declaration for desktopConsole

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
  submitSelectedPlan(input: PlatformSubmission | PlatformSubmission[]): Promise<IpcResponse<unknown>>;
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
  listQuestions(clientId: string): Promise<IpcResponse<ContentQuestion[]>>;
  createQuestion(input: { clientId: string; text: string; enabled?: boolean }): Promise<IpcResponse<ContentQuestion>>;
  updateQuestion(input: { clientId: string; questionId: string; text?: string; enabled?: boolean }): Promise<IpcResponse<ContentQuestion>>;
  deleteQuestion(input: { clientId: string; questionId: string }): Promise<IpcResponse<ContentQuestion>>;
  getDoubaoLoginState(): Promise<IpcResponse<Record<string, unknown>>>;
  openDoubaoLogin(): Promise<IpcResponse<Record<string, unknown>>>;
  collectDoubaoOne(input: { clientId: string; questionId: string; force?: boolean }): Promise<IpcResponse<ContentResearch>>;
  previewDoubaoBatch(input: { clientIds: string[]; mode: DoubaoBatchMode }): Promise<IpcResponse<DoubaoBatchPreview>>;
  startDoubaoBatch(tasks: Array<{ clientId: string; questionId: string; force?: boolean }>): Promise<IpcResponse<DoubaoQueueState>>;
  startPreparedDoubaoBatch(input: { tasks: DoubaoBatchTask[] }): Promise<IpcResponse<DoubaoQueueState>>;
  pauseDoubaoBatch(): Promise<IpcResponse<DoubaoQueueState>>;
  resumeDoubaoBatch(): Promise<IpcResponse<DoubaoQueueState>>;
  stopDoubaoBatch(): Promise<IpcResponse<DoubaoQueueState>>;
  retryFailedDoubao(): Promise<IpcResponse<DoubaoQueueState>>;
  getDoubaoQueueState(): Promise<IpcResponse<DoubaoQueueState>>;
  saveManualResearch(input: { clientId: string; questionId: string; answerText: string; references: ContentResearch["references"] }): Promise<IpcResponse<ContentResearch>>;
  onDoubaoQueueState(listener: (state: DoubaoQueueState) => void): () => void;
  listTemplates(platform: string): Promise<IpcResponse<ContentTemplate[]>>;
  generateArticle(input: { clientId: string; researchQueryIds: string[]; platform: string; templateId: string }): Promise<IpcResponse<GeneratedContentArticle>>;
  saveArticle(article: GeneratedContentArticle): Promise<IpcResponse<GeneratedContentArticle>>;
  listGeneratedArticles(clientId: string): Promise<IpcResponse<GeneratedContentArticle[]>>;
  previewExport(input: ContentExportInput): Promise<IpcResponse<ContentExportPreview>>;
  exportArticle(input: ContentExportInput): Promise<IpcResponse<ContentExportPreview>>;
  getGenerationBatchState?: () => Promise<IpcResponse<GenerationBatchState>>;
  onGenerationBatchState?: (listener: (state: GenerationBatchState) => void) => () => void;
}

interface DesktopConsoleBatch {
  getState(): Promise<IpcResponse<GenerationBatchState>>;
  onState(listener: (state: GenerationBatchState) => void): () => void;
}

interface DesktopConsoleAiProvider {
  getStatus(): Promise<IpcResponse<AiProviderStatus>>;
  save(input: AiProviderConfigInput): Promise<IpcResponse<AiProviderStatus>>;
  testConnection(input: AiProviderConfigInput): Promise<IpcResponse<AiProviderTestResult>>;
  clear(): Promise<IpcResponse<AiProviderClearResult>>;
}

interface DesktopConsoleWorkspace {
  getBootstrapState(): Promise<IpcResponse<WorkspaceBootstrapState>>;
  chooseDirectory(): Promise<IpcResponse<WorkspaceBootstrapState>>;
  confirmSelection(input: WorkspaceSelectionToken): Promise<IpcResponse<WorkspaceConfirmationResult>>;
  cancelSelection(): Promise<IpcResponse<WorkspaceBootstrapState>>;
  getCurrent(): Promise<IpcResponse<WorkspaceCurrent>>;
  openCurrent(): Promise<IpcResponse<void>>;
  requestSwitch(): Promise<IpcResponse<WorkspaceBootstrapState>>;
}

export interface ContentExportInput { clientId: string; generatedArticleId: string; targetPlatform: "media" | "lieju" | "toutiao" | "hepan"; confirmed: true; }
export interface ContentExportPreview { filename: string; targetPlatform: string; contentHash: string; markdown: string; status: "queued"; }

interface DesktopConsole {
  workspace: DesktopConsoleWorkspace;
  aiProvider: DesktopConsoleAiProvider;
  batch: DesktopConsoleBatch;
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

// Helper utilities

export function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.desktopConsole;
}

function fixturesEnabled(): boolean {
  const env = (import.meta as unknown as { env: { DEV: boolean; VITE_ENABLE_FIXTURES?: string } }).env;
  return Boolean(env.DEV && env.VITE_ENABLE_FIXTURES === "true");
}

function readLocalStorage<T>(key: string, fallback: T): T {
  if (!fixturesEnabled()) return fallback;
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalStorage<T>(key: string, value: T): void {
  if (!fixturesEnabled()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Silently ignore quota/access errors
  }
}

const DOUBAO_LOGIN_STATE_KEY = "auto-publish:doubao-login-state";

export function getCachedDoubaoLoginState(): DoubaoLoginState {
  if (typeof localStorage === "undefined") return { status: "unknown" };
  try {
    const saved = JSON.parse(localStorage.getItem(DOUBAO_LOGIN_STATE_KEY) || "null") as { status?: unknown } | null;
    if (saved?.status === "authenticated" || saved?.status === "login_required") return { status: saved.status };
  } catch {
    // Ignore malformed or unavailable browser storage.
  }
  return { status: "unknown" };
}

export function rememberDoubaoLoginState(state: DoubaoLoginState): void {
  if (state.status !== "authenticated" && state.status !== "login_required") return;
  try {
    localStorage.setItem(DOUBAO_LOGIN_STATE_KEY, JSON.stringify({ status: state.status }));
  } catch {
    // Ignore unavailable browser storage.
  }
}

function getIpcError(value: unknown, fallback: string): Error {
  const message = value && typeof value === "object" && "message" in value
    ? String((value as { message: unknown }).message)
    : typeof value === "string" ? value : fallback;
  const error = new Error(message);
  if (value && typeof value === "object" && "code" in value && typeof (value as { code?: unknown }).code === "string") {
    (error as Error & { code?: string }).code = (value as { code: string }).code;
  }
  return error;
}

export async function getWorkspaceBootstrapState(): Promise<WorkspaceBootstrapState> {
  if (!isElectron()) return { state: "selection_required", workspacePath: null, envOverride: false };
  const result = await window.desktopConsole!.workspace.getBootstrapState();
  if (!result.ok) throw getIpcError(result.error, "Unable to read workspace bootstrap state");
  return result.data || { state: "checking", workspacePath: null, envOverride: false };
}

export async function chooseWorkspaceDirectory(): Promise<WorkspaceBootstrapState> {
  if (!isElectron()) return { state: "selection_required", workspacePath: null, envOverride: false };
  const result = await window.desktopConsole!.workspace.chooseDirectory();
  if (!result.ok) throw getIpcError(result.error, "Unable to choose a workspace");
  return result.data || { state: "selection_required", workspacePath: null, envOverride: false };
}

export async function confirmWorkspaceSelection(input: WorkspaceSelectionToken): Promise<WorkspaceConfirmationResult> {
  if (!isElectron()) throw new Error("Workspace selection requires the desktop app");
  const result = await window.desktopConsole!.workspace.confirmSelection(input);
  if (!result.ok) throw getIpcError(result.error, "Unable to confirm workspace selection");
  return result.data || { state: "relaunching" };
}

export async function cancelWorkspaceSelection(): Promise<WorkspaceBootstrapState> {
  if (!isElectron()) return { state: "selection_required", workspacePath: null, envOverride: false };
  const result = await window.desktopConsole!.workspace.cancelSelection();
  if (!result.ok) throw getIpcError(result.error, "Unable to cancel workspace selection");
  return result.data || { state: "selection_required", workspacePath: null, envOverride: false };
}

export async function getCurrentWorkspace(): Promise<WorkspaceCurrent> {
  if (!isElectron()) return { workspacePath: null, envOverride: false, validation: null };
  const result = await window.desktopConsole!.workspace.getCurrent();
  if (!result.ok) throw getIpcError(result.error, "Unable to read the current workspace");
  return result.data || { workspacePath: null, envOverride: false, validation: null };
}

export async function openCurrentWorkspace(): Promise<void> {
  if (!isElectron()) throw new Error("Opening a workspace requires the desktop app");
  const result = await window.desktopConsole!.workspace.openCurrent();
  if (!result.ok) throw getIpcError(result.error, "Unable to open the current workspace");
}

export async function requestWorkspaceSwitch(): Promise<WorkspaceBootstrapState> {
  if (!isElectron()) return { state: "selection_required", workspacePath: null, envOverride: false };
  const result = await window.desktopConsole!.workspace.requestSwitch();
  if (!result.ok) throw getIpcError(result.error, "Unable to switch workspace");
  return result.data || { state: "selection_required", workspacePath: null, envOverride: false };
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

export async function listContentQuestions(clientId: string): Promise<ContentQuestion[]> {
  if (!isElectron()) return [];
  const result = await window.desktopConsole!.content.listQuestions(clientId);
  if (!result.ok) throw getIpcError(result.error, "Unable to load questions");
  return result.data || [];
}

export async function createContentQuestion(input: { clientId: string; text: string; enabled?: boolean }): Promise<ContentQuestion> {
  if (!isElectron()) throw new Error("Question editing requires the desktop app");
  const result = await window.desktopConsole!.content.createQuestion(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to create question");
  return result.data;
}

export async function updateContentQuestion(input: { clientId: string; questionId: string; text?: string; enabled?: boolean }): Promise<ContentQuestion> {
  if (!isElectron()) throw new Error("Question editing requires the desktop app");
  const result = await window.desktopConsole!.content.updateQuestion(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to update question");
  return result.data;
}

export async function deleteContentQuestion(input: { clientId: string; questionId: string }): Promise<ContentQuestion> {
  if (!isElectron()) throw new Error("Question editing requires the desktop app");
  const result = await window.desktopConsole!.content.deleteQuestion(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to delete question");
  return result.data;
}

function normalizeLoginState(raw: Record<string, unknown> | undefined): DoubaoLoginState {
  const status = raw && raw.status;
  if (status === "authenticated" || status === "login_required") return { status };
  if (status === "session_error" || status === "challenge" || status === "page_error") return { status: "session_error", errorText: raw && typeof raw.errorText === "string" ? raw.errorText : undefined };
  return { status: "unknown" };
}

export async function getDoubaoLoginStatus(): Promise<DoubaoLoginState> {
  if (!isElectron()) return { status: "unknown" };
  const result = await window.desktopConsole!.content.getDoubaoLoginState();
  if (!result.ok) throw getIpcError(result.error, "Unable to read Doubao login state");
  return normalizeLoginState(result.data);
}

export const getDoubaoLoginState = getDoubaoLoginStatus;

export async function openDoubaoLogin(): Promise<DoubaoLoginState> {
  if (!isElectron()) throw new Error("Doubao login requires the desktop app");
  const result = await window.desktopConsole!.content.openDoubaoLogin();
  if (!result.ok) throw getIpcError(result.error, "Unable to open Doubao login");
  return normalizeLoginState(result.data);
}

export async function collectDoubaoQuestion(input: { clientId: string; questionId: string; force?: boolean }): Promise<ContentResearch> {
  if (!isElectron()) throw new Error("Doubao collection requires the desktop app");
  const result = await window.desktopConsole!.content.collectDoubaoOne(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to collect Doubao answer");
  return result.data;
}

const EMPTY_AI_PROVIDER_STATUS: AiProviderStatus = {
  source: 'application',
  configured: false,
  baseUrl: '',
  model: '',
  timeoutMs: 60000,
  hasApiKey: false,
  apiKeyMask: '',
  lastTest: null,
};

export async function getAiProviderStatus(): Promise<AiProviderStatus> {
  if (!isElectron()) return EMPTY_AI_PROVIDER_STATUS;
  const result = await window.desktopConsole!.aiProvider.getStatus();
  if (!result.ok) throw getIpcError(result.error, "Unable to read AI provider settings");
  return result.data || EMPTY_AI_PROVIDER_STATUS;
}

export async function saveAiProviderConfig(input: AiProviderConfigInput): Promise<AiProviderStatus> {
  if (!isElectron()) throw new Error("AI provider settings require the desktop app");
  const result = await window.desktopConsole!.aiProvider.save(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to save AI provider settings");
  return result.data;
}

export async function testAiProviderConnection(input: AiProviderConfigInput): Promise<AiProviderTestResult> {
  if (!isElectron()) throw new Error("AI provider testing requires the desktop app");
  const result = await window.desktopConsole!.aiProvider.testConnection(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to test the AI provider connection");
  return result.data;
}

export async function clearAiProviderConfig(): Promise<AiProviderClearResult> {
  if (!isElectron()) throw new Error("AI provider settings require the desktop app");
  const result = await window.desktopConsole!.aiProvider.clear();
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to clear AI provider settings");
  return result.data;
}

export async function getGenerationBatchState(): Promise<GenerationBatchState> {
  if (!isElectron()) return { state: 'idle', status: 'idle' };
  const command = window.desktopConsole!.content.getGenerationBatchState;
  const result = typeof command === 'function'
    ? await command()
    : await window.desktopConsole!.batch.getState();
  if (!result.ok) throw getIpcError(result.error, "Unable to read generation batch state");
  return result.data || { state: 'idle', status: 'idle' };
}

export function subscribeGenerationBatchState(listener: (state: GenerationBatchState) => void): () => void {
  if (!isElectron()) return () => undefined;
  const subscribe = window.desktopConsole!.content.onGenerationBatchState;
  return typeof subscribe === 'function'
    ? subscribe(listener)
    : window.desktopConsole!.batch.onState(listener);
}

export async function previewDoubaoBatch(input: { clientIds: string[]; mode: DoubaoBatchMode }): Promise<DoubaoBatchPreview> {
  if (!isElectron()) throw new Error("Doubao batch preview requires the desktop app");
  const result = await window.desktopConsole!.content.previewDoubaoBatch(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to preview Doubao batch");
  return result.data;
}

export async function startDoubaoBatch(tasks: Array<{ clientId: string; questionId: string; force?: boolean }>): Promise<DoubaoQueueState> {
  if (!isElectron()) throw new Error("Doubao collection requires the desktop app");
  const result = await window.desktopConsole!.content.startDoubaoBatch(tasks);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to start Doubao batch");
  return result.data;
}

export async function startPreparedDoubaoBatch(tasks: DoubaoBatchTask[]): Promise<DoubaoQueueState> {
  return doubaoQueueCommand(() => window.desktopConsole!.content.startPreparedDoubaoBatch({ tasks }), "Unable to start prepared Doubao batch");
}

async function doubaoQueueCommand(command: () => Promise<IpcResponse<DoubaoQueueState>>, fallback: string): Promise<DoubaoQueueState> {
  if (!isElectron()) throw new Error("Doubao collection requires the desktop app");
  const result = await command();
  if (!result.ok || !result.data) throw getIpcError(result.error, fallback);
  return result.data;
}

export function pauseDoubaoBatch(): Promise<DoubaoQueueState> { return doubaoQueueCommand(() => window.desktopConsole!.content.pauseDoubaoBatch(), "Unable to pause Doubao batch"); }
export function resumeDoubaoBatch(): Promise<DoubaoQueueState> { return doubaoQueueCommand(() => window.desktopConsole!.content.resumeDoubaoBatch(), "Unable to resume Doubao batch"); }
export function stopDoubaoBatch(): Promise<DoubaoQueueState> { return doubaoQueueCommand(() => window.desktopConsole!.content.stopDoubaoBatch(), "Unable to stop Doubao batch"); }
export function retryFailedDoubao(): Promise<DoubaoQueueState> { return doubaoQueueCommand(() => window.desktopConsole!.content.retryFailedDoubao(), "Unable to retry Doubao tasks"); }
export function getDoubaoQueueState(): Promise<DoubaoQueueState> { return doubaoQueueCommand(() => window.desktopConsole!.content.getDoubaoQueueState(), "Unable to read Doubao queue"); }

export function subscribeDoubaoQueue(listener: (state: DoubaoQueueState) => void): () => void {
  if (!isElectron()) return () => undefined;
  return window.desktopConsole!.content.onDoubaoQueueState(listener);
}

export async function saveManualResearch(input: { clientId: string; questionId: string; answerText: string; references: ContentResearch["references"] }): Promise<ContentResearch> {
  if (!isElectron()) throw new Error("Manual research saving requires the desktop app");
  const result = await window.desktopConsole!.content.saveManualResearch(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to save manual research");
  return result.data;
}

export async function listContentTemplates(platform: string): Promise<ContentTemplate[]> {
  if (!isElectron()) return [];
  const result = await window.desktopConsole!.content.listTemplates(platform);
  if (!result.ok) throw getIpcError(result.error, "Unable to load templates");
  return result.data || [];
}

export async function generateContentArticle(input: { clientId: string; researchQueryIds: string[]; platform: string; templateId: string }): Promise<GeneratedContentArticle> {
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

// Data normalization from backend values to React types

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

// Fallback implementations for development and no-Electron mode

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

// Public API exports

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
    const result = await window.desktopConsole!.platforms.submitSelectedPlan([...submissions.values()]);
    if (!result.ok) throw getIpcError(result.error, 'submitPlatformPlan failed');
    return result.data as PlatformSubmitResult;
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

export async function previewExport(input: ContentExportInput): Promise<ContentExportPreview> {
  if (!isElectron()) throw new Error("Export requires the desktop app");
  const result = await window.desktopConsole!.content.previewExport(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "preview export failed");
  return result.data;
}

export async function exportToSubmissionQueue(input: ContentExportInput): Promise<ContentExportPreview> {
  if (!isElectron()) throw new Error("Export requires the desktop app");
  const result = await window.desktopConsole!.content.exportArticle(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "export failed");
  return result.data;
}

import { AiProviderClearResult, AiProviderConfigInput, AiProviderStatus, AiProviderTestResult, Article, ArticleAttentionItem, ArticleAttentionList, ArticleAttentionPreview, ArticleAttentionResolution, ArticleRemovalTransaction, ArticleReviewResult, ArticleReviewSelection, AuthState, ContentClient, ContentMaterial, ContentQuestion, ContentResearch, ContentTemplate, ContentTemplateCatalog, ContentSubmissionActionPlanItem, ContentSubmissionBatchInput, ContentSubmissionBatchItem, ContentSubmissionBatchPreview, ContentSubmissionBatchRecord, ContentSubmissionCancellationPreview, ContentSubmissionCleanupPreview, ContentSubmissionCleanupResult, ContentSubmissionPlatform, Draft, DoubaoBatchMode, DoubaoBatchPreview, DoubaoBatchTask, DoubaoLoginState, DoubaoQueueState, FailedPublicationRetryPreview, FailedPublicationRetryResult, GeneratedContentArticle, GenerationBatch, GenerationBatchCancelPreview, GenerationBatchPreview, GenerationBatchSourceSelection, GenerationBatchState, GenerationBatchTemplateSelection, GenerationSubmissionHandoffPreview, GenerationSubmissionHandoffResult, IpcResponse, MediaProviderStatus, HepanProviderStatus, LegacyProviderSettingsStatus, PlatformProviderStatus, PlatformProviderTestResult, MediaResource, PlatformArticle, PlatformQueueData, PlatformStatus, PlatformSubmitState, PlatformTarget, PlatformSubmitPlan, PlatformSubmitResult, PlatformTaskSnapshot, PublicationHistoryRecord, PublicationHistorySummary, RealOrder, WorkspaceBootstrapState, WorkspaceConfirmationResult, WorkspaceCurrent, WorkspaceDataInvalidatedEvent, WorkspaceSelectionToken } from "./types";
import { formatBeijingTime } from "./time-format";


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
  submitSelectedPlan(input: PlatformSubmission | PlatformSubmission[] | { submissions: PlatformSubmission[]; autoTrash?: boolean }): Promise<IpcResponse<unknown>>;
  pauseSubmit(runId?: string | null): Promise<IpcResponse<unknown>>;
  stopSubmit(runId?: string | null): Promise<IpcResponse<unknown>>;
  getState(): Promise<IpcResponse<PlatformTaskSnapshot>>;
  onState?: (listener: (state: PlatformSubmitState) => void) => () => void;
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
  listTemplates(platform?: string): Promise<IpcResponse<ContentTemplate[]>>;
  listTemplateCatalog(): Promise<IpcResponse<ContentTemplateCatalog>>;
  retryMaterial(input: { clientId: string; materialId: string }): Promise<IpcResponse<ContentMaterial>>;
  generateArticle(input: { clientId: string; materialIds: string[]; researchQueryIds: string[]; platform: string; templateId: string; templateCatalogRevision?: string }): Promise<IpcResponse<GeneratedContentArticle>>;
  copyArticleVersion(input: { clientId: string; sourceArticleId: string }): Promise<IpcResponse<GeneratedContentArticle>>;
  saveArticle(article: GeneratedContentArticle): Promise<IpcResponse<GeneratedContentArticle>>;
  listGeneratedArticles(clientId: string): Promise<IpcResponse<GeneratedContentArticle[]>>;
  reviewArticles(articles: ArticleReviewSelection[]): Promise<IpcResponse<ArticleReviewResult>>;
  listArticleTrash(clientId: string): Promise<IpcResponse<ArticleTrashRecord[]>>;
  previewTrashArticles?: (input: { selections: ArticleReviewSelection[]; articles?: ArticleReviewSelection[] }) => Promise<IpcResponse<ArticleTrashPreview>>;
  previewArticleRemovalImpact?: (input: { selections: ArticleReviewSelection[]; articles?: ArticleReviewSelection[] }) => Promise<IpcResponse<ArticleTrashPreview>>;
  applyArticleRemovalImpact?: (input: ArticleTrashCommitInput) => Promise<IpcResponse<ArticleTrashResult>>;
  trashArticles(input: ArticleTrashCommitInput): Promise<IpcResponse<ArticleTrashResult>>;
  getArticleRemovalTransaction?: (transactionId: string) => Promise<IpcResponse<ArticleRemovalTransaction | null>>;
  listArticleRemovalTransactions?: () => Promise<IpcResponse<ArticleRemovalTransaction[]>>;
  onArticleRemovalTransaction?: (listener: (transaction: ArticleRemovalTransaction) => void) => () => void;
  /** Compatibility surface for preload builds that group attention under content. */
  listArticleAttention?: (input?: { clientId?: string }) => Promise<IpcResponse<ArticleAttentionList>>;
  getArticleAttention?: (input: { attentionId: string }) => Promise<IpcResponse<ArticleAttentionItem | null>>;
  previewArticleAttention?: (input: { attentionId: string; action: string }) => Promise<IpcResponse<ArticleAttentionPreview>>;
  resolveArticleAttention?: (input: { attentionId: string; action: string; expectedRevision: number; confirmed?: boolean }) => Promise<IpcResponse<ArticleAttentionResolution>>;
  retryArticleRemovalTransaction?: (input: { transactionId: string; confirmed: true }) => Promise<IpcResponse<ArticleRemovalTransaction>>;
  previewTrashedArticleQueueResidue?(): Promise<IpcResponse<TrashedArticleQueueResiduePreview>>;
  cleanupTrashedArticleQueueResidue?(input: { confirmed: true }): Promise<IpcResponse<TrashedArticleQueueResiduePreview & { cleanedCount: number }>>;
  restoreArticle(input: ArticleReviewSelection): Promise<IpcResponse<GeneratedContentArticle>>;
  preparePermanentDeleteArticle(input: ArticleReviewSelection): Promise<IpcResponse<ArticlePermanentDeleteConfirmation>>;
  permanentlyDeleteArticle(input: ArticlePermanentDeleteRequest): Promise<IpcResponse<ArticlePermanentDeleteResult>>;
  previewExport(input: ContentExportInput): Promise<IpcResponse<ContentExportPreview>>;
  exportArticle(input: ContentExportInput): Promise<IpcResponse<ContentExportPreview>>;
  previewSubmissionBatch(input: ContentSubmissionBatchInput): Promise<IpcResponse<ContentSubmissionBatchPreview>>;
  previewCancelSubmissionBatch(input: { batchId: string }): Promise<IpcResponse<ContentSubmissionCancellationPreview>>;
  previewCleanupFailedSubmissionItems(input: { batchId: string }): Promise<IpcResponse<ContentSubmissionCleanupPreview>>;
  cleanupFailedSubmissionItems(input: { batchId: string; confirmed: true }): Promise<IpcResponse<ContentSubmissionCleanupResult>>;
  previewRetryFailedPublication(input: { publicationId: string }): Promise<IpcResponse<FailedPublicationRetryPreview>>;
  retryFailedPublication(input: { publicationId: string; expectedRevision?: number; confirmed: true }): Promise<IpcResponse<FailedPublicationRetryResult>>;
  listSubmissionPlatforms(): Promise<IpcResponse<ContentSubmissionPlatform[]>>;
  listSubmissionBatches(input: { clientId: string }): Promise<IpcResponse<ContentSubmissionBatchRecord[]>>;
  createSubmissionBatch(input: ContentSubmissionBatchInput & { confirmed: true }): Promise<IpcResponse<ContentSubmissionBatchPreview>>;
  cancelSubmissionBatch(input: { batchId: string; planId: string; confirmed: true }): Promise<IpcResponse<{ batchId: string; planId: string; cancelledCount: number; idempotentCount: number; blockedItems: ContentSubmissionActionPlanItem[]; batchStatus: string; changedScopes: string[]; items: ContentSubmissionBatchItem[] }>>;
  getSubmissionBatch(batchId: string): Promise<IpcResponse<ContentSubmissionBatchPreview>>;
  previewGenerationBatch(input: { clientIds: string[]; templates: GenerationBatchTemplateSelection[]; clientSources?: GenerationBatchSourceSelection[]; templateCatalogRevision?: string }): Promise<IpcResponse<GenerationBatchPreview>>;
  createGenerationBatch(input: { clientIds: string[]; templates: GenerationBatchTemplateSelection[]; clientSources?: GenerationBatchSourceSelection[]; templateCatalogRevision?: string }): Promise<IpcResponse<GenerationBatch>>;
  listGenerationBatches(): Promise<IpcResponse<GenerationBatch[]>>;
  getGenerationBatch(batchId: string): Promise<IpcResponse<GenerationBatch>>;
  startGenerationBatch(input: { batchId?: string; clientIds?: string[]; templates?: GenerationBatchTemplateSelection[]; clientSources?: GenerationBatchSourceSelection[] }): Promise<IpcResponse<GenerationBatch>>;
  pauseGenerationBatch(input?: { batchId?: string }): Promise<IpcResponse<GenerationBatch | null>>;
  continueGenerationBatch(input: { batchId: string; confirmConfigChange?: boolean }): Promise<IpcResponse<GenerationBatch>>;
  resumeGenerationBatch(input: { batchId: string; confirmConfigChange?: boolean }): Promise<IpcResponse<GenerationBatch>>;
  stopGenerationBatch(input?: { batchId?: string }): Promise<IpcResponse<GenerationBatch | null>>;
  retryFailedGenerationBatch(input: { batchId: string }): Promise<IpcResponse<GenerationBatch>>;
  previewCancelPendingGenerationBatch(input: { batchId: string }): Promise<IpcResponse<GenerationBatchCancelPreview>>;
  cancelPendingGenerationBatch(input: { batchId: string; confirmed: true }): Promise<IpcResponse<GenerationBatch>>;
  previewGenerationSubmissionHandoff(input: { generationBatchId: string; targetPlatformIds: string[] }): Promise<IpcResponse<GenerationSubmissionHandoffPreview>>;
  commitGenerationSubmissionHandoff(input: { generationBatchId: string; targetPlatformIds: string[]; previewToken: string; confirmed: true }): Promise<IpcResponse<GenerationSubmissionHandoffResult>>;
  getGenerationBatchState?: () => Promise<IpcResponse<GenerationBatchState>>;
  onGenerationBatchState?: (listener: (state: GenerationBatchState) => void) => () => void;
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

interface DesktopConsoleWorkspaceData {
  onInvalidated?: (listener: (event: WorkspaceDataInvalidatedEvent) => void) => () => void;
}

interface DesktopConsoleAuth {
  getState(): Promise<IpcResponse<AuthState>>;
  login(loginName: string, password: string): Promise<IpcResponse<AuthState>>;
  changePassword(loginName: string, currentPassword: string, newPassword: string): Promise<IpcResponse<AuthState>>;
  refresh(): Promise<IpcResponse<AuthState>>;
  logout(): Promise<IpcResponse<AuthState>>;
  onStateChanged?: (listener: (state: AuthState) => void) => () => void;
}

interface DesktopConsoleArticleAttention {
  list(input?: { clientId?: string }): Promise<IpcResponse<ArticleAttentionList>>;
  get(input: { attentionId: string }): Promise<IpcResponse<ArticleAttentionItem | null>>;
  preview(input: { attentionId: string; action: string }): Promise<IpcResponse<ArticleAttentionPreview>>;
  resolve(input: { attentionId: string; action: string; expectedRevision: number; confirmed?: boolean }): Promise<IpcResponse<ArticleAttentionResolution>>;
}

interface DesktopConsolePublication {
  listForArticles(input: { clientId: string; articleIds: string[] }): Promise<IpcResponse<PublicationHistoryRecord[]>>;
  reconcile(input: { publicationId: string; status: 'published' | 'failed'; reasonCode: string; confirmed: true }): Promise<IpcResponse<PublicationHistoryRecord>>;
}

interface DesktopConsolePlatformSettings {
  getStatus(platformId: string): Promise<IpcResponse<PlatformProviderStatus>>;
  save(platformId: string, draft: Record<string, unknown>): Promise<IpcResponse<PlatformProviderStatus>>;
  test(platformId: string, draft?: Record<string, unknown>): Promise<IpcResponse<PlatformProviderTestResult>>;
  clear(platformId: string): Promise<IpcResponse<{ cleared: boolean }>>;
  getLegacyStatus(): Promise<IpcResponse<LegacyProviderSettingsStatus>>;
  importLegacy(input: { confirmed: true }): Promise<IpcResponse<unknown>>;
}

export type RuntimeCapabilityState = "ready" | "not_checked" | "optional_unconfigured" | "unavailable";
export interface RuntimeCapability { state: RuntimeCapabilityState; source: string | null; errorCode: string | null; lastCheckedAt: string | null; available?: boolean; }
export interface RuntimeBrowserCapability extends RuntimeCapability { channel: string | null; configured: boolean; probed: boolean; }
export interface RuntimeDiagnostics {
  ok: boolean;
  buildInfo: { version: string; commit: string; dirty: boolean };
  browserChannel: RuntimeBrowserCapability;
  capabilities: {
    playwrightNode: RuntimeCapability;
    playwrightCli: RuntimeCapability;
    browserChannel: RuntimeBrowserCapability;
    docx: RuntimeCapability;
    hepan: RuntimeCapability;
  };
  tools?: { playwrightNode: RuntimeCapability; playwrightCli: RuntimeCapability; hepanPython: RuntimeCapability };
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
}

interface DesktopConsoleRuntimeDiagnostics {
  get(): Promise<IpcResponse<RuntimeDiagnostics>>;
  browserSmoke(): Promise<IpcResponse<{ ok: boolean; browserChannel: string; session: string }>>;
}

export interface ContentExportInput { clientId: string; generatedArticleId: string; targetPlatform: string; mediaResourceId?: string; confirmed: true; }
export interface ContentExportPreview { filename: string; targetPlatform: string; contentHash: string; markdown: string; status: "queued" | "queueable" | "idempotent" | "blockedPublished" | "blockedUncertain" | "conflict"; publicationId?: string | null; attemptId?: string | null; articleKey?: string; targetKey?: string; publicationStatus?: string | null; }
export interface ArticleTrashRecord {
  version: 1;
  deletedAt: string;
  clientId: string;
  articleId: string;
  status: string;
  references: Array<{ type: string; id: string }>;
  titleSnapshot?: string | null;
  publicationSummary?: PublicationHistorySummary | Record<string, unknown> | null;
  publicationRecords?: PublicationHistoryRecord[];
}
export interface ArticleTrashImpactItem {
  clientId?: string;
  articleId?: string;
  platformId?: string | null;
  targetPlatformId?: string | null;
  displayName?: string | null;
  reasonCode?: string | null;
  status?: string | null;
  [key: string]: unknown;
}
export interface ArticleTrashPreview {
  token?: string;
  articleCount: number;
  queuedToCancel: ArticleTrashImpactItem[];
  failedToClean: ArticleTrashImpactItem[];
  publishedToClean?: ArticleTrashImpactItem[];
  cancelledToClean?: ArticleTrashImpactItem[];
  terminalCleanupCount?: number;
  blockedItems: ArticleTrashImpactItem[];
  canCommit: boolean;
  selections?: ArticleReviewSelection[];
  expiresAt?: string;
  legacy?: boolean;
  transactionId?: string | null;
  openTransactionId?: string | null;
  transaction?: ArticleRemovalTransaction | null;
  openTransaction?: ArticleRemovalTransaction | null;
}
export interface ArticleTrashCommitInput {
  articles?: ArticleReviewSelection[];
  selections?: ArticleReviewSelection[];
  token?: string;
  legacy?: boolean;
  confirmed: true;
}
export interface ArticleTrashResult {
  moved?: ArticleTrashRecord[];
  skipped?: ArticleTrashRecord[];
  rejected?: Array<{ clientId: string; articleId: string; code: string }>;
  transactionId?: string;
  status?: ArticleRemovalTransaction['status'];
  articleCount?: number;
  queueActions?: ArticleTrashImpactItem[];
  errorCode?: string;
  reasonCode?: string | null;
  phase?: string | null;
  transaction?: ArticleRemovalTransaction | null;
}
export interface TrashedArticleQueueResidueItem extends ArticleTrashImpactItem {
  sourceArticleState: 'trashed';
  repairAction?: 'cancel' | 'cleanup' | 'cleanupPublishedLocal' | 'cleanupCancelledLocal' | null;
}
export interface TrashedArticleQueueResiduePreview {
  items: TrashedArticleQueueResidueItem[];
  cleanableItems: TrashedArticleQueueResidueItem[];
  reportedItems: TrashedArticleQueueResidueItem[];
  cleanableCount: number;
  reportedCount: number;
  failedCount?: number;
  remainingCount?: number;
  failedItems?: TrashedArticleQueueResidueItem[];
  status?: 'completed' | 'failed' | 'no-op' | string;
  remainingItems?: TrashedArticleQueueResidueItem[];
}
export interface ArticlePermanentDeleteConfirmation { token: string; clientId: string; articleId: string; deletedAt: string; status: string; }
export interface ArticlePermanentDeleteRequest { clientId: string; articleId: string; token: string; }
export interface ArticlePermanentDeleteResult { clientId: string; articleId: string; deleted: true; deletedAt: string; }

interface DesktopConsole {
  workspace: DesktopConsoleWorkspace;
  runtimeDiagnostics: DesktopConsoleRuntimeDiagnostics;
  aiProvider: DesktopConsoleAiProvider;
  platformSettings: DesktopConsolePlatformSettings;
  media: DesktopConsoleMedia;
  orders: DesktopConsoleOrders;
  platforms: DesktopConsolePlatforms;
  content: DesktopConsoleContent;
  auth: DesktopConsoleAuth;
  publication?: DesktopConsolePublication;
  workspaceData?: DesktopConsoleWorkspaceData;
  articleAttention?: DesktopConsoleArticleAttention;
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
  if (value && typeof value === "object") {
    ["platformId", "templateId", "diagnosticCode"].forEach((key) => {
      const next = (value as Record<string, unknown>)[key];
      if (typeof next === "string" && next.length <= 200 && !/[\\/\u0000-\u001F]/.test(next)) {
        (error as Error & Record<string, string>)[key] = next;
      }
    });
  }
  return error;
}

export function createUnauthenticatedState(): AuthState {
  return { authenticated: false, user: null, entitlements: [], errorCode: null };
}

export async function getAuthState(): Promise<AuthState> {
  if (!isElectron() || !window.desktopConsole?.auth) return createUnauthenticatedState();
  const result = await window.desktopConsole.auth.getState();
  return result.ok && result.data ? result.data : { ...createUnauthenticatedState(), errorCode: result.error?.code || "AUTH_SERVICE_UNAVAILABLE" };
}

export async function login(loginName: string, password: string): Promise<AuthState> {
  if (!isElectron() || !window.desktopConsole?.auth) throw new Error("桌面认证不可用");
  const result = await window.desktopConsole.auth.login(loginName, password);
  if (!result.ok || !result.data) throw Object.assign(new Error(result.error?.message || "登录失败"), { code: result.error?.code || "AUTH_SERVER_ERROR" });
  return result.data;
}

export async function changeAuthPassword(loginName: string, currentPassword: string, newPassword: string): Promise<AuthState> {
  if (!isElectron() || !window.desktopConsole?.auth) throw new Error("桌面认证不可用");
  const result = await window.desktopConsole.auth.changePassword(loginName, currentPassword, newPassword);
  if (!result.ok || !result.data) throw Object.assign(new Error(result.error?.message || "修改密码失败"), { code: result.error?.code || "AUTH_SERVER_ERROR" });
  return result.data;
}

export async function refreshAuth(): Promise<AuthState> {
  if (!isElectron() || !window.desktopConsole?.auth) return createUnauthenticatedState();
  const result = await window.desktopConsole.auth.refresh();
  return result.ok && result.data ? result.data : createUnauthenticatedState();
}

export async function logout(): Promise<AuthState> {
  if (!isElectron() || !window.desktopConsole?.auth) return createUnauthenticatedState();
  const result = await window.desktopConsole.auth.logout();
  return result.ok && result.data ? result.data : createUnauthenticatedState();
}

export function onAuthStateChanged(listener: (state: AuthState) => void): () => void {
  if (!isElectron() || typeof window.desktopConsole?.auth?.onStateChanged !== "function") return () => {};
  return window.desktopConsole.auth.onStateChanged(listener);
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

const EMPTY_RUNTIME_DIAGNOSTICS: RuntimeDiagnostics = {
  ok: false,
  buildInfo: { version: "unknown", commit: "unknown", dirty: false },
  browserChannel: { channel: "msedge", configured: true, state: "not_checked", probed: false, source: "default", errorCode: null, lastCheckedAt: null },
  capabilities: {
    playwrightNode: { state: "unavailable", source: null, errorCode: "PLAYWRIGHT_NODE_UNAVAILABLE", lastCheckedAt: null },
    playwrightCli: { state: "unavailable", source: null, errorCode: "PLAYWRIGHT_CLI_UNAVAILABLE", lastCheckedAt: null },
    browserChannel: { channel: "msedge", configured: true, state: "not_checked", probed: false, source: "default", errorCode: null, lastCheckedAt: null },
    docx: { state: "unavailable", source: "bundled", errorCode: "DOCX_RUNTIME_UNAVAILABLE", lastCheckedAt: null },
    hepan: { state: "optional_unconfigured", source: "optional", errorCode: "HEPAN_PYTHON_UNAVAILABLE", lastCheckedAt: null }
  },
  errors: [],
  warnings: []
};

export async function getRuntimeDiagnostics(): Promise<RuntimeDiagnostics> {
  if (!isElectron()) return EMPTY_RUNTIME_DIAGNOSTICS;
  const result = await window.desktopConsole!.runtimeDiagnostics.get();
  if (!result.ok) throw getIpcError(result.error, "Unable to read runtime diagnostics");
  return result.data || EMPTY_RUNTIME_DIAGNOSTICS;
}

export async function runBrowserSelfCheck(): Promise<{ ok: boolean; browserChannel: string; session: string; capability?: RuntimeBrowserCapability }> {
  if (!isElectron()) throw new Error("Browser self-check requires the desktop app");
  const result = await window.desktopConsole!.runtimeDiagnostics.browserSmoke();
  if (!result.ok || !result.data) throw getIpcError(result.error, "Browser self-check failed");
  return result.data;
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

export async function getPlatformSettingsStatus<T extends PlatformProviderStatus = PlatformProviderStatus>(platformId: string): Promise<T> {
  if (!isElectron()) return { source: 'application', configured: false, baseUrl: '', timeoutMs: 0, allowInsecure: false, transport: '未配置', apiKeyMask: '', lastTest: null } as T;
  const result = await window.desktopConsole!.platformSettings.getStatus(platformId);
  if (!result.ok) throw getIpcError(result.error, 'Unable to read platform settings');
  return result.data as T;
}

export async function savePlatformSettings(platformId: string, draft: Record<string, unknown>): Promise<PlatformProviderStatus> {
  if (!isElectron()) throw new Error('Platform settings require the desktop app');
  const result = await window.desktopConsole!.platformSettings.save(platformId, draft);
  if (!result.ok || !result.data) throw getIpcError(result.error, 'Unable to save platform settings');
  return result.data;
}

export async function testPlatformSettings(platformId: string, draft?: Record<string, unknown>): Promise<PlatformProviderTestResult> {
  if (!isElectron()) throw new Error('Platform settings require the desktop app');
  const result = await window.desktopConsole!.platformSettings.test(platformId, draft);
  if (!result.ok || !result.data) throw getIpcError(result.error, 'Platform connection test failed');
  return result.data;
}

export async function clearPlatformSettings(platformId: string): Promise<{ cleared: boolean }> {
  if (!isElectron()) throw new Error('Platform settings require the desktop app');
  const result = await window.desktopConsole!.platformSettings.clear(platformId);
  if (!result.ok) throw getIpcError(result.error, 'Unable to clear platform settings');
  return result.data || { cleared: false };
}

export async function getLegacyPlatformSettingsStatus(): Promise<LegacyProviderSettingsStatus> {
  if (!isElectron()) return { discover: { media: { available: false, sources: [] }, hepan: { available: false, sources: [], cookiePathAvailable: false }, sources: [], importable: false }, record: null };
  const result = await window.desktopConsole!.platformSettings.getLegacyStatus();
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to read legacy platform settings");
  return result.data;
}

export async function importLegacyPlatformSettings(): Promise<unknown> {
  if (!isElectron()) throw new Error("Legacy platform settings import requires the desktop app");
  const result = await window.desktopConsole!.platformSettings.importLegacy({ confirmed: true });
  if (!result.ok) throw getIpcError(result.error, "Unable to import legacy platform settings");
  return result.data;
}

export async function getGenerationBatchState(): Promise<GenerationBatchState> {
  if (!isElectron()) return { state: 'idle', status: 'idle' };
  const command = window.desktopConsole!.content?.getGenerationBatchState;
  if (typeof command !== 'function') return { state: 'idle', status: 'idle' };
  const result = await command();
  if (!result.ok) throw getIpcError(result.error, "Unable to read generation batch state");
  return result.data || { state: 'idle', status: 'idle' };
}

export async function previewGenerationBatch(input: { clientIds: string[]; templates: GenerationBatchTemplateSelection[]; clientSources?: GenerationBatchSourceSelection[]; templateCatalogRevision?: string }): Promise<GenerationBatchPreview> {
  if (!isElectron()) return { clientCount: input.clientIds.length, executableClientCount: 0, taskCount: 0, executableTaskCount: 0, excludedTaskCount: 0, excludedClients: [], templates: input.templates, clientSources: [] };
  const result = await window.desktopConsole!.content.previewGenerationBatch(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to preview generation batch");
  return result.data;
}

export async function createGenerationBatch(input: { clientIds: string[]; templates: GenerationBatchTemplateSelection[]; clientSources?: GenerationBatchSourceSelection[]; templateCatalogRevision?: string }): Promise<GenerationBatch> {
  if (!isElectron()) throw new Error("Batch generation requires the desktop app");
  const result = await window.desktopConsole!.content.createGenerationBatch(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to create generation batch");
  return result.data;
}

export async function listGenerationBatches(): Promise<GenerationBatch[]> {
  if (!isElectron()) return [];
  const result = await window.desktopConsole!.content.listGenerationBatches();
  if (!result.ok) throw getIpcError(result.error, "Unable to list generation batches");
  return result.data || [];
}

export async function getGenerationBatch(batchId: string): Promise<GenerationBatch> {
  if (!isElectron()) throw new Error("Batch generation requires the desktop app");
  const result = await window.desktopConsole!.content.getGenerationBatch(batchId);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to read generation batch");
  return result.data;
}

export async function startGenerationBatch(input: { batchId?: string; clientIds?: string[]; templates?: GenerationBatchTemplateSelection[]; clientSources?: GenerationBatchSourceSelection[] }): Promise<GenerationBatch> {
  if (!isElectron()) throw new Error("Batch generation requires the desktop app");
  const result = await window.desktopConsole!.content.startGenerationBatch(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to start generation batch");
  return result.data;
}

async function generationBatchCommand(command: () => Promise<IpcResponse<GenerationBatch | null>>, fallback: string): Promise<GenerationBatch | null> {
  if (!isElectron()) throw new Error("Batch generation requires the desktop app");
  const result = await command();
  if (!result.ok) throw getIpcError(result.error, fallback);
  return result.data || null;
}

export function pauseGenerationBatch(input?: { batchId?: string }): Promise<GenerationBatch | null> { return generationBatchCommand(() => window.desktopConsole!.content.pauseGenerationBatch(input), "Unable to pause generation batch"); }
export function stopGenerationBatch(input?: { batchId?: string }): Promise<GenerationBatch | null> { return generationBatchCommand(() => window.desktopConsole!.content.stopGenerationBatch(input), "Unable to stop generation batch"); }

export async function resumeGenerationBatch(input: { batchId: string; confirmConfigChange?: boolean }): Promise<GenerationBatch> {
  if (!isElectron()) throw new Error("Batch generation requires the desktop app");
  const result = await window.desktopConsole!.content.resumeGenerationBatch(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to resume generation batch");
  return result.data;
}

export async function continueGenerationBatch(input: { batchId: string; confirmConfigChange?: boolean }): Promise<GenerationBatch> {
  if (!isElectron()) throw new Error("Batch generation requires the desktop app");
  const result = await window.desktopConsole!.content.continueGenerationBatch(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to continue generation batch");
  return result.data;
}

export async function retryFailedGenerationBatch(input: { batchId: string }): Promise<GenerationBatch> {
  if (!isElectron()) throw new Error("Batch generation requires the desktop app");
  const result = await window.desktopConsole!.content.retryFailedGenerationBatch(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to retry failed generation batch");
  return result.data;
}

export function subscribeGenerationBatchState(listener: (state: GenerationBatchState) => void): () => void {
  if (!isElectron()) return () => undefined;
  const subscribe = window.desktopConsole!.content?.onGenerationBatchState;
  return typeof subscribe === 'function' ? subscribe(listener) : () => undefined;
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

export async function listContentTemplates(platform?: string): Promise<ContentTemplate[]> {
  if (!isElectron()) return [];
  const result = await window.desktopConsole!.content.listTemplates(platform);
  if (!result.ok) throw getIpcError(result.error, "Unable to load templates");
  return result.data || [];
}

export async function listContentTemplateCatalog(): Promise<ContentTemplateCatalog> {
  if (!isElectron()) return { revision: '', platforms: [], templates: [], diagnostics: [] };
  const result = await window.desktopConsole!.content.listTemplateCatalog();
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to load template catalog");
  return result.data;
}

export async function generateContentArticle(input: { clientId: string; materialIds: string[]; researchQueryIds: string[]; platform: string; templateId: string; templateCatalogRevision?: string }): Promise<GeneratedContentArticle> {
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

export async function retryContentMaterial(input: { clientId: string; materialId: string }): Promise<ContentMaterial> {
  if (!isElectron()) throw new Error("Material retry requires the desktop app");
  const result = await window.desktopConsole!.content.retryMaterial(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to retry material");
  return result.data;
}

  export async function reviewContentArticles(articles: ArticleReviewSelection[]): Promise<ArticleReviewResult> {
  if (!isElectron()) throw new Error("Article review requires the desktop app");
  const result = await window.desktopConsole!.content.reviewArticles(articles);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to review articles");
    return result.data;
  }

  export async function listContentTrash(clientId: string): Promise<ArticleTrashRecord[]> {
    if (!isElectron()) return [];
    const result = await window.desktopConsole!.content.listArticleTrash(clientId);
    if (!result.ok) throw getIpcError(result.error, "Unable to load article trash");
    return result.data || [];
  }

export async function trashContentArticles(input: ArticleTrashCommitInput & { articles: ArticleReviewSelection[] }): Promise<ArticleTrashResult> {
  if (!isElectron()) throw new Error("Article trash requires the desktop app");
  const request: ArticleTrashCommitInput = input.legacy
    ? { articles: input.articles, confirmed: true }
    : { ...input, selections: input.articles };
  const handler = window.desktopConsole!.content.applyArticleRemovalImpact || window.desktopConsole!.content.trashArticles;
  const result = await handler(request);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to move articles to trash");
  return result.data;
}

export async function previewContentArticleRemoval(articles: ArticleReviewSelection[]): Promise<ArticleTrashPreview> {
  if (!isElectron()) throw new Error("Article trash preview requires the desktop app");
  const content = window.desktopConsole!.content;
  const input = { selections: articles, articles };
  const handler = content.previewTrashArticles || content.previewArticleRemovalImpact;
  if (!handler) {
    // Old preload/mocks only expose trashArticles. Keep the renderer usable while
    // newer desktops provide the all-target transactional preview.
    return { articleCount: articles.length, queuedToCancel: [], failedToClean: [], blockedItems: [], canCommit: true, selections: articles, legacy: true };
  }
  const result = await handler(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to preview moving articles to trash");
  return result.data;
}

export async function previewTrashedArticleQueueResidue(): Promise<TrashedArticleQueueResiduePreview> {
  if (!isElectron() || typeof window.desktopConsole?.content?.previewTrashedArticleQueueResidue !== 'function') {
    return { items: [], cleanableItems: [], reportedItems: [], cleanableCount: 0, reportedCount: 0 };
  }
  const result = await window.desktopConsole.content.previewTrashedArticleQueueResidue();
  if (!result.ok || !result.data) throw getIpcError(result.error, 'Unable to inspect trashed article queue residue');
  return result.data;
}

export async function cleanupTrashedArticleQueueResidue(): Promise<TrashedArticleQueueResiduePreview & { cleanedCount: number }> {
  if (!isElectron() || typeof window.desktopConsole?.content?.cleanupTrashedArticleQueueResidue !== 'function') {
    return { items: [], cleanableItems: [], reportedItems: [], cleanableCount: 0, reportedCount: 0, cleanedCount: 0 };
  }
  const result = await window.desktopConsole.content.cleanupTrashedArticleQueueResidue({ confirmed: true });
  if (!result.ok || !result.data) throw getIpcError(result.error, 'Unable to clean trashed article queue residue');
  return result.data;
}

export async function getContentArticleRemovalTransaction(transactionId: string): Promise<ArticleRemovalTransaction | null> {
  if (!isElectron() || typeof window.desktopConsole?.content?.getArticleRemovalTransaction !== 'function') return null;
  const result = await window.desktopConsole.content.getArticleRemovalTransaction(transactionId);
  if (!result.ok) throw getIpcError(result.error, 'Unable to read article removal transaction');
  return result.data || null;
}

export async function listContentArticleRemovalTransactions(): Promise<ArticleRemovalTransaction[]> {
  if (!isElectron() || typeof window.desktopConsole?.content?.listArticleRemovalTransactions !== 'function') return [];
  const result = await window.desktopConsole.content.listArticleRemovalTransactions();
  if (!result.ok) throw getIpcError(result.error, 'Unable to list article removal transactions');
  return result.data || [];
}

export function onContentArticleRemovalTransaction(transactionId: string, listener: (transaction: ArticleRemovalTransaction) => void): () => void {
  const subscribe = window.desktopConsole?.content?.onArticleRemovalTransaction;
  if (!isElectron() || typeof subscribe !== 'function') return () => {};
  return subscribe((transaction) => {
    const id = transaction.transactionId || transaction.id;
    if (id === transactionId) listener(transaction);
  });
}

export async function retryContentArticleRemovalTransaction(transactionId: string): Promise<ArticleRemovalTransaction> {
  if (!isElectron() || typeof window.desktopConsole?.content?.retryArticleRemovalTransaction !== 'function') throw new Error('Article removal repair is unavailable');
  const result = await window.desktopConsole.content.retryArticleRemovalTransaction({ transactionId, confirmed: true });
  if (!result.ok || !result.data) throw getIpcError(result.error, 'Unable to repair article removal transaction');
  return result.data;
}

  export async function restoreContentArticle(input: ArticleReviewSelection): Promise<GeneratedContentArticle> {
    if (!isElectron()) throw new Error("Article restore requires the desktop app");
    const result = await window.desktopConsole!.content.restoreArticle(input);
    if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to restore article");
    return result.data;
  }

  export async function preparePermanentDeleteContentArticle(input: ArticleReviewSelection): Promise<ArticlePermanentDeleteConfirmation> {
    if (!isElectron()) throw new Error("Permanent article deletion requires the desktop app");
    const result = await window.desktopConsole!.content.preparePermanentDeleteArticle(input);
    if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to prepare permanent article deletion");
    return result.data;
  }

  export async function permanentlyDeleteContentArticle(input: ArticlePermanentDeleteRequest): Promise<ArticlePermanentDeleteResult> {
    if (!isElectron()) throw new Error("Permanent article deletion requires the desktop app");
    const result = await window.desktopConsole!.content.permanentlyDeleteArticle(input);
    if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to permanently delete article");
    return result.data;
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
    lastModified: formatBeijingTime(raw.lastModified || new Date().toISOString()),
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

export async function getPlatformQueue(): Promise<PlatformQueueData> {
  if (isElectron()) {
    const result = await window.desktopConsole!.platforms.getQueue();
    if (!result.ok) throw getIpcError(result.error, 'getPlatformQueue failed');
    const data = result.data as {
      revision?: number;
      platforms: Array<{ id: string; scanDir: string }>;
      queue: PlatformArticle[];
    };
    return {
      revision: typeof data.revision === 'number' ? data.revision : undefined,
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
  plan: PlatformSubmitPlan,
  options: { autoTrash?: boolean } = {}
): Promise<PlatformSubmitResult> {
  if (isElectron()) {
    const submissions = new Map<string, PlatformSubmission>();
    plan.tasks.forEach((task) => {
      const key = task.sourcePlatformId + "\u0000" + task.filename;
      const submission = submissions.get(key) || { sourcePlatformId: task.sourcePlatformId, filename: task.filename, targetPlatformIds: [] };
      if (!submission.targetPlatformIds.includes(task.targetPlatformId)) submission.targetPlatformIds.push(task.targetPlatformId);
      submissions.set(key, submission);
    });
    const result = await window.desktopConsole!.platforms.submitSelectedPlan({ submissions: [...submissions.values()], autoTrash: options.autoTrash === true });
    if (!result.ok) throw getIpcError(result.error, 'submitPlatformPlan failed');
    return result.data as PlatformSubmitResult;
  }
  return { ok: 0, fail: 0, skipped: 0, results: [] };
}

export async function pausePlatformSubmit(runId?: string | null): Promise<void> {
  if (isElectron()) {
    const result = await window.desktopConsole!.platforms.pauseSubmit(runId);
    if (!result.ok) throw getIpcError(result.error, "pausePlatformSubmit failed");
    return;
  }
}

export async function stopPlatformSubmit(runId?: string | null): Promise<void> {
  if (isElectron()) {
    const result = await window.desktopConsole!.platforms.stopSubmit(runId);
    if (!result.ok) throw getIpcError(result.error, "stopPlatformSubmit failed");
    return;
  }
}

export async function getPlatformState(): Promise<PlatformTaskSnapshot> {
  if (isElectron()) {
    const result = await window.desktopConsole!.platforms.getState();
    if (!result.ok) return createIdlePlatformTaskSnapshot();
    return result.data || createIdlePlatformTaskSnapshot();
  }
  return createIdlePlatformTaskSnapshot();
}

function createIdlePlatformTaskSnapshot(): PlatformTaskSnapshot {
  return {
    runId: null, phase: "idle", total: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0, uncertain: 0,
    currentTask: null, startedAt: null, updatedAt: null, terminalResult: null,
    isBatchRunning: false, isStopPending: false, isPlatformRunning: false, waitRemainingMs: 0,
  };
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

export async function previewContentSubmissionBatch(input: ContentSubmissionBatchInput): Promise<ContentSubmissionBatchPreview> {
  if (!isElectron()) throw new Error("Batch submission requires the desktop app");
  const result = await window.desktopConsole!.content.previewSubmissionBatch(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "submission batch preview failed");
  return result.data;
}

export async function previewCancelPendingGenerationBatch(input: { batchId: string }): Promise<GenerationBatchCancelPreview> {
  if (!isElectron()) return { batchId: input.batchId, pendingCount: 0, runningCount: 0, cancelledCount: 0, canCancel: false };
  const result = await window.desktopConsole!.content.previewCancelPendingGenerationBatch(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to preview pending generation cancellation");
  return result.data;
}

export async function cancelPendingGenerationBatch(input: { batchId: string; confirmed: true }): Promise<GenerationBatch> {
  if (!isElectron()) throw new Error("Batch generation requires the desktop app");
  const result = await window.desktopConsole!.content.cancelPendingGenerationBatch(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to cancel pending generation tasks");
  return result.data;
}

export async function listContentSubmissionPlatforms(): Promise<ContentSubmissionPlatform[]> {
  if (!isElectron()) return [];
  const result = await window.desktopConsole!.content.listSubmissionPlatforms();
  if (!result.ok) throw getIpcError(result.error, "submission platform discovery failed");
  return result.data || [];
}

export async function listContentSubmissionBatches(clientId: string): Promise<ContentSubmissionBatchRecord[]> {
  if (!isElectron()) return [];
  const result = await window.desktopConsole!.content.listSubmissionBatches({ clientId });
  if (!result.ok) throw getIpcError(result.error, "submission batch history failed");
  return (result.data || []) as ContentSubmissionBatchRecord[];
}

export async function previewGenerationSubmissionHandoff(input: { generationBatchId: string; targetPlatformIds: string[] }): Promise<GenerationSubmissionHandoffPreview> {
  if (!isElectron()) throw new Error("Generation submission handoff requires the desktop app");
  const result = await window.desktopConsole!.content.previewGenerationSubmissionHandoff(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to preview generation submission handoff");
  return result.data;
}

export async function commitGenerationSubmissionHandoff(input: { generationBatchId: string; targetPlatformIds: string[]; previewToken: string; confirmed: true }): Promise<GenerationSubmissionHandoffResult> {
  if (!isElectron()) throw new Error("Generation submission handoff requires the desktop app");
  const result = await window.desktopConsole!.content.commitGenerationSubmissionHandoff(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to commit generation submission handoff");
  return result.data;
}

export async function previewRetryFailedPublication(input: { publicationId: string }): Promise<FailedPublicationRetryPreview> {
  if (!isElectron()) throw new Error("失败投稿重试需要桌面应用");
  const result = await window.desktopConsole!.content.previewRetryFailedPublication(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "failed publication retry preview failed");
  return result.data;
}

export async function retryFailedPublication(input: { publicationId: string; expectedRevision?: number; confirmed: true }): Promise<FailedPublicationRetryResult> {
  if (!isElectron()) throw new Error("失败投稿重试需要桌面应用");
  const result = await window.desktopConsole!.content.retryFailedPublication(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "failed publication retry failed");
  return result.data;
}

export function onWorkspaceDataInvalidated(listener: (event: WorkspaceDataInvalidatedEvent) => void): () => void {
  if (!isElectron() || typeof window.desktopConsole?.workspaceData?.onInvalidated !== 'function') return () => {};
  return window.desktopConsole.workspaceData.onInvalidated(listener);
}

export async function listArticleAttention(clientId?: string): Promise<ArticleAttentionItem[]> {
  if (!isElectron()) return [];
  const attention = window.desktopConsole!.articleAttention;
  const list = typeof attention?.list === 'function'
    ? attention.list.bind(attention)
    : window.desktopConsole!.content.listArticleAttention?.bind(window.desktopConsole!.content);
  if (!list) return [];
  const result = await list(clientId ? { clientId } : undefined);
  if (!result.ok) throw getIpcError(result.error, 'listArticleAttention failed');
  return result.data?.items || [];
}

export async function listArticleAttentionSnapshot(clientId?: string): Promise<ArticleAttentionList> {
  if (!isElectron()) return { revision: 0, items: [], counts: { total: 0, actionable: 0 } };
  const attention = window.desktopConsole!.articleAttention;
  const list = typeof attention?.list === 'function'
    ? attention.list.bind(attention)
    : window.desktopConsole!.content.listArticleAttention?.bind(window.desktopConsole!.content);
  if (!list) return { revision: 0, items: [], counts: { total: 0, actionable: 0 } };
  const result = await list(clientId ? { clientId } : undefined);
  if (!result.ok || !result.data) throw getIpcError(result.error, 'listArticleAttention failed');
  return result.data;
}

export async function getArticleAttention(attentionId: string): Promise<ArticleAttentionItem | null> {
  if (!isElectron()) return null;
  const attention = window.desktopConsole!.articleAttention;
  const get = typeof attention?.get === 'function'
    ? attention.get.bind(attention)
    : window.desktopConsole!.content.getArticleAttention?.bind(window.desktopConsole!.content);
  if (!get) return null;
  const result = await get({ attentionId });
  if (!result.ok) throw getIpcError(result.error, 'getArticleAttention failed');
  return result.data || null;
}

export async function previewArticleAttention(input: { attentionId: string; action: string }): Promise<ArticleAttentionPreview> {
  if (!isElectron()) throw new Error('需处理中心不可用');
  const attention = window.desktopConsole!.articleAttention;
  const preview = typeof attention?.preview === 'function'
    ? attention.preview.bind(attention)
    : window.desktopConsole!.content.previewArticleAttention?.bind(window.desktopConsole!.content);
  if (!preview) throw new Error('需处理中心不可用');
  const result = await preview(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, 'previewArticleAttention failed');
  return result.data;
}

export async function resolveArticleAttention(input: { attentionId: string; action: string; expectedRevision: number; confirmed?: boolean }): Promise<ArticleAttentionResolution> {
  if (!isElectron()) throw new Error('需处理中心不可用');
  const attention = window.desktopConsole!.articleAttention;
  const resolve = typeof attention?.resolve === 'function'
    ? attention.resolve.bind(attention)
    : window.desktopConsole!.content.resolveArticleAttention?.bind(window.desktopConsole!.content);
  if (!resolve) throw new Error('需处理中心不可用');
  const result = await resolve(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, 'resolveArticleAttention failed');
  return result.data;
}

export function onPlatformState(listener: (state: PlatformSubmitState) => void): () => void {
  if (!isElectron() || typeof window.desktopConsole?.platforms?.onState !== 'function') return () => {};
  return window.desktopConsole.platforms.onState(listener);
}

export async function copyContentArticleVersion(input: { clientId: string; sourceArticleId: string }): Promise<GeneratedContentArticle> {
  if (!isElectron()) throw new Error("Copying an article version requires the desktop app");
  const result = await window.desktopConsole!.content.copyArticleVersion(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to copy article version");
  return result.data;
}

export async function listPublicationHistory(clientId: string, articleIds: string[]): Promise<PublicationHistoryRecord[]> {
  if (!isElectron() || typeof window.desktopConsole?.publication?.listForArticles !== "function") return [];
  const result = await window.desktopConsole.publication.listForArticles({ clientId, articleIds });
  if (!result.ok) throw getIpcError(result.error, "publication history failed");
  return result.data || [];
}

export async function reconcilePublicationHistory(input: { publicationId: string; status: 'published' | 'failed'; reasonCode: string }): Promise<PublicationHistoryRecord> {
  if (!isElectron() || typeof window.desktopConsole?.publication?.reconcile !== "function") throw new Error("Publication reconciliation requires the desktop app");
  const result = await window.desktopConsole.publication.reconcile({ ...input, confirmed: true });
  if (!result.ok || !result.data) throw getIpcError(result.error, "Unable to reconcile publication result");
  return result.data;
}

export async function createContentSubmissionBatch(input: ContentSubmissionBatchInput & { confirmed: true }): Promise<ContentSubmissionBatchPreview> {
  if (!isElectron()) throw new Error("Batch submission requires the desktop app");
  const result = await window.desktopConsole!.content.createSubmissionBatch(input);
  if (!result.ok || !result.data) throw getIpcError(result.error, "submission batch creation failed");
  return result.data;
}

export async function cancelContentSubmissionBatch(batchId: string, planId: string): Promise<{ batchId: string; planId: string; cancelledCount: number; idempotentCount: number; blockedItems: ContentSubmissionActionPlanItem[]; batchStatus: string; changedScopes: string[]; items: ContentSubmissionBatchItem[] }> {
  if (!isElectron()) throw new Error("Batch submission cancellation requires the desktop app");
  const result = await window.desktopConsole!.content.cancelSubmissionBatch({ batchId, planId, confirmed: true });
  if (!result.ok || !result.data) throw getIpcError(result.error, "submission batch cancellation failed");
  return result.data;
}

export async function previewCancelContentSubmissionBatch(batchId: string): Promise<ContentSubmissionCancellationPreview> {
  if (!isElectron()) throw new Error("Batch submission cancellation requires the desktop app");
  const result = await window.desktopConsole!.content.previewCancelSubmissionBatch({ batchId });
  if (!result.ok || !result.data) throw getIpcError(result.error, "submission batch cancellation preview failed");
  return result.data;
}

export async function previewCleanupFailedContentSubmissionItems(batchId: string): Promise<ContentSubmissionCleanupPreview> {
  if (!isElectron()) throw new Error("Batch cleanup requires the desktop app");
  const result = await window.desktopConsole!.content.previewCleanupFailedSubmissionItems({ batchId });
  if (!result.ok || !result.data) throw getIpcError(result.error, "failed submission cleanup preview failed");
  return result.data;
}

export async function cleanupFailedContentSubmissionItems(batchId: string): Promise<ContentSubmissionCleanupResult> {
  if (!isElectron()) throw new Error("Batch cleanup requires the desktop app");
  const result = await window.desktopConsole!.content.cleanupFailedSubmissionItems({ batchId, confirmed: true });
  if (!result.ok || !result.data) throw getIpcError(result.error, "failed submission cleanup failed");
  return result.data;
}

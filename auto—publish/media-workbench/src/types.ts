export type MediaType = 'image' | 'video' | 'audio' | 'document';

export interface IpcError {
  code: string;
  message: string;
  platformId?: string;
  templateId?: string;
  diagnosticCode?: string;
}

export type IpcResponse<T> =
  | { ok: true; data?: T; error?: never }
  | { ok: false; data?: never; error: IpcError };

export type AiProviderSource = 'application' | 'environment';

export interface AiProviderTestResult {
  testedAt: string;
  ok: boolean;
  code: string;
}

export interface AiProviderStatus {
  source: AiProviderSource;
  configured: boolean;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  hasApiKey: boolean;
  apiKeyMask: string;
  lastTest: AiProviderTestResult | null;
}

export interface AiProviderConfigInput {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface AiProviderClearResult {
  cleared: boolean;
}

export type PlatformProviderSource = 'application' | 'environment';
export interface PlatformProviderTestResult {
  testedAt: string;
  ok: boolean;
  code: string;
}
export interface MediaProviderStatus {
  source: PlatformProviderSource;
  configured: boolean;
  baseUrl: string;
  timeoutMs: number;
  allowInsecure: boolean;
  transport: string;
  apiKeyMask: string;
  lastTest: PlatformProviderTestResult | null;
}
export interface HepanProviderStatus {
  source: PlatformProviderSource;
  configured: boolean;
  pythonConfigured: boolean;
  cookieConfigured: boolean;
  categoryId: number;
  vendorConfigured: boolean;
  siteOrigin: string;
  publishIntervalSeconds: number;
  lastTest: PlatformProviderTestResult | null;
}
export type PlatformProviderStatus = MediaProviderStatus | HepanProviderStatus;
export interface LegacyProviderSettingsDiscovery {
  media: { available: boolean; sources: string[] };
  hepan: { available: boolean; sources: string[]; cookiePathAvailable: boolean };
  sources: string[];
  importable: boolean;
}
export interface LegacyProviderSettingsRecord {
  version: 1;
  updatedAt: string | null;
  entries: Array<{ platform: string; source: string; status: string; code: string | null }>;
}
export interface LegacyProviderSettingsStatus {
  discover: LegacyProviderSettingsDiscovery;
  record: LegacyProviderSettingsRecord | null;
}

export interface GenerationBatchState {
  state?: 'idle' | 'running' | 'stopping' | 'stopped' | 'completed';
  status?: 'idle' | 'running' | 'stopping' | 'stopped' | 'completed';
  isBatchRunning?: boolean;
  isStopPending?: boolean;
  batchId?: string | null;
  counts?: GenerationBatchCounts;
  taskId?: string | null;
  error?: { code?: string; message?: string } | null;
}

export interface GenerationBatchCounts {
  total: number;
  succeeded: number;
  failed: number;
  pending: number;
  interrupted: number;
  cancelled: number;
}

export interface GenerationBatchCancelPreview {
  batchId: string;
  pendingCount: number;
  runningCount: number;
  cancelledCount: number;
  canCancel: boolean;
}

export type WorkspaceBootstrapStatus =
  | 'checking'
  | 'selection_required'
  | 'confirmation_required'
  | 'ready'
  | 'invalid'
  | 'relaunching';

export type WorkspaceSelectionKind =
  | 'existing_workspace'
  | 'empty_directory'
  | 'nonempty_directory';

export interface WorkspaceSelectionToken {
  token: string;
}

export interface WorkspaceSelection {
  token: string;
  path: string;
  kind: WorkspaceSelectionKind;
}

export interface WorkspaceValidation {
  kind: WorkspaceSelectionKind;
  error?: IpcError;
}

export interface WorkspaceBootstrapState {
  state: WorkspaceBootstrapStatus;
  workspacePath?: string | null;
  envOverride?: boolean;
  error?: IpcError;
  selection?: WorkspaceSelection;
}

export interface WorkspaceCurrent {
  workspacePath: string | null;
  envOverride: boolean;
  validation: WorkspaceValidation | null;
}

export interface WorkspaceConfirmationResult {
  state: WorkspaceBootstrapStatus;
  workspacePath?: string | null;
  envOverride?: boolean;
  changed?: boolean;
}

export interface MediaResource {
  resourceId: string;
  name: string;
  price: number;
  type: MediaType;
  url?: string;
  duration?: string;
  resolution?: string;
  size?: string;
  createdAt: string;
}

export interface Article {
  filename: string;
  title: string;
  content: string;
  words: number;
  tags: string[];
  selectedResources: MediaResource[];
  lastModified: string;
  // IPC fields from scanArticles service
  filePath: string;
  autoTitle: string;
  remark: string;
  hasImages: boolean;
  imageCount: number;
  ignoreImages: boolean;
}

export interface Draft {
  filename: string;
  title: string;
  remark: string;
  ignoreImages: boolean;
  selectedResources: MediaResource[];
}

export type OrderStatus = 'success' | 'pending' | 'failed' | 'partial';

export interface OrderPlatform {
  name: string;
  status: 'success' | 'failed' | 'pending';
  error?: string;
}

// SubmissionOrder: used for preflight/UI flow (legacy mock shape)
export interface SubmissionOrder {
  id: string;
  articleTitle: string;
  filename: string;
  platforms: OrderPlatform[];
  totalFee: number;
  mediaCount: number;
  createdAt: string;
  status: OrderStatus;
  logs: string[];
}

// RealOrder: matches the real order view shape from media-order-service.js
export interface RealOrder {
  title: string;
  filename: string;
  orderNid: string;
  statusCode: string;
  statusLabel: string;
  submittedAt: string;
  publishedAt: string;
  resourceId: string;
  resourceName: string;
  price: string;
  orderUrl: string;
  publicationId?: string;
  attemptId?: string;
  publicationStatus?: 'queued' | 'submitting' | 'submitted' | 'published' | 'uncertain' | 'failed' | 'cancelled' | string;
  errorCode?: string;
}

export interface AuthState {
  authenticated: boolean;
  user: { id?: string; loginName: string; enabled?: boolean } | null;
  entitlements: Array<{ product: string; enabled: boolean; expiresAt?: string | null }>;
  errorCode?: string | null;
}

export interface GenerationSubmissionHandoffPreview {
  generationBatchId: string;
  batchRevision?: string | number;
  previewToken: string;
  articleCount: number;
  clientCount: number;
  targetPlatformIds: string[];
  estimatedTaskCount: number;
  queueableTaskCount: number;
  idempotentCount: number;
  blockedPublishedCount: number;
  blockedUncertainCount: number;
  blockedContentCount: number;
  conflictCount: number;
  unavailableArticleCount: number;
  invalidArticles: Array<{ clientId: string; articleId?: string | null; taskId: string; reasonCode: string }>;
  clientGroups: Array<{ clientId: string; articleCount: number; queueableTaskCount: number; idempotentCount: number; blockedPublishedCount: number; blockedUncertainCount: number; blockedContentCount: number; conflictCount: number; items: Array<{ articleId: string; targetPlatformId: string; status: string; reasonCode?: string | null }> }>;
}

export interface GenerationSubmissionHandoffResult {
  generationBatchId: string;
  createdCount: number;
  idempotentCount: number;
  blockedCount: number;
  conflictCount: number;
  failedClientGroups: Array<{ clientId: string; code: string }>;
  completedClientGroups: string[];
  clientGroups: Array<{ clientId: string; articleCount: number; queueableTaskCount: number; idempotentCount: number }>;
  changedScopes?: string[];
}

// Backward-compatible alias for PreflightModal and mockData
export type Order = SubmissionOrder;

export type ViewMode = 'workbench' | 'resources' | 'orders' | 'settings' | 'platforms' | 'content';

export interface ContentMaterial {
  id?: string;
  name: string;
  extension?: string;
  status?: 'ready' | 'error' | 'converting' | string;
  content: string;
  characterCount?: number;
  error?: { code?: string; message?: string } | null;
  contentHash?: string;
  source?: 'text' | 'docx' | string;
}
export interface ContentClient { id: string; name: string; searchQuery?: string; knowledgeFiles: ContentMaterial[]; }
export interface ContentQuestion { id: string; text: string; enabled: boolean; createdAt: string; updatedAt: string; }
export type DoubaoBatchMode = 'missing' | 'recollect';
export interface DoubaoBatchTask { clientId: string; questionId: string; force: boolean; }
export interface DoubaoBatchPreview {
  mode: DoubaoBatchMode;
  clientCount: number;
  taskCount: number;
  skippedExisting: number;
  disabledQuestions: number;
  tasks: DoubaoBatchTask[];
}
export type DoubaoLoginStatus = 'unknown' | 'checking' | 'login_required' | 'authenticated' | 'session_error';
export type DoubaoTaskStatus = 'pending' | 'waiting_login' | 'running' | 'waiting_interval' | 'paused' | 'succeeded' | 'failed' | 'cancelled';
export interface DoubaoTask { id: string; clientId: string; questionId: string; status: DoubaoTaskStatus; answerLength: number; referenceCount: number; error?: { code: string; message: string } | null; }
export interface DoubaoQueueState { status: 'idle' | 'running' | 'paused' | 'stopping' | 'completed'; currentTaskId: string | null; completed: number; total: number; waitRemainingMs: number; tasks: DoubaoTask[]; }
export interface DoubaoLoginState { status: DoubaoLoginStatus; errorText?: string; }
export interface ContentResearch { id: string; clientId: string; question?: string; answerText?: string; references: Array<{ title: string; url: string; snippet?: string }>; collectionMethod: 'automatic' | 'manual' | 'legacy'; collectedAt?: string; updatedAt?: string; createdAt?: string; isAnswerComplete?: boolean; }
export interface ContentTemplate { id: string; templateId?: string; platform: string; platformId?: string; scenario: string; name: string; displayName?: string; description?: string; order?: number; enabled?: boolean; body: string; source?: 'builtin' | 'custom'; readOnly?: boolean; bodyHash?: string; revision?: string; sourceFileName?: string; }
export interface ContentTemplatePlatform { id: string; displayName: string; description: string; order: number; source?: 'builtin' | 'custom'; }
export interface ContentTemplateDiagnostic { code: string; message: string; platformId?: string; templateId?: string; source?: 'builtin' | 'custom'; }
export interface ContentTemplateCatalog { revision: string; platforms: ContentTemplatePlatform[]; templates: ContentTemplate[]; diagnostics: ContentTemplateDiagnostic[]; }
export interface GenerationBatchTemplateSelection { platform: string; templateId: string; }
export interface GenerationBatchSourceSelection { clientId: string; materialIds: string[]; researchQueryIds: string[]; }
export interface GenerationBatchExcludedClient { clientId: string; codes: string[]; }
export interface GenerationBatchPreview {
  clientCount: number;
  executableClientCount: number;
  taskCount: number;
  executableTaskCount: number;
  excludedTaskCount: number;
  excludedClients: GenerationBatchExcludedClient[];
  templates: GenerationBatchTemplateSelection[];
  clientSources: GenerationBatchSourceSelection[];
  tasks?: Array<GenerationBatchSourceSelection & { platform: string; templateId: string }>;
}
export type GenerationTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'interrupted' | 'cancelled';
export interface GenerationBatchTask {
  id: string;
  clientId: string;
  platform: string;
  templateId: string;
  materialIds: string[];
  researchQueryIds: string[];
  status: GenerationTaskStatus;
  attempts: number;
  error?: { code?: string; message?: string } | null;
  articleId?: string | null;
}
export interface GenerationBatch {
  id: string;
  status: string;
  clientSources: GenerationBatchSourceSelection[];
  templates: GenerationBatchTemplateSelection[];
  tasks: GenerationBatchTask[];
  counts: GenerationBatchCounts;
  excludedClients?: GenerationBatchExcludedClient[];
  aiConfigFingerprint?: string;
  updatedAt?: string;
}
export interface ResearchSnapshot { questionId: string; question?: string; answerText: string; references: Array<{ title: string; url: string; snippet?: string }>; collectedAt?: string; collectionMethod: 'automatic' | 'manual' | 'legacy'; }
export interface GeneratedContentArticle {
  id: string; clientId: string; materialIds?: string[]; researchQueryIds: string[]; researchQueryId?: string; researchSnapshots?: ResearchSnapshot[]; platform: string; scenario: string; templateId: string;
  title: string; content: string; status: 'generated' | 'saved' | string; source: { client_material: boolean; doubao_answer: boolean; references: boolean; template: boolean }; createdAt: string; updatedAt?: string; reviewedAt?: string | null;
  materialSnapshots?: Array<{ id: string; name: string; extension: string; content: string; contentHash: string; source: string }>;
  templateSnapshot?: { platform: string; id: string; name: string; scenario: string; body: string; bodyHash: string; source?: 'builtin' | 'custom' };
  generationBatchId?: string | null; generationTaskId?: string | null;
  sourceArticleId?: string | null; version?: number;
}

export type PublicationRecordStatus = 'queued' | 'submitting' | 'submitted' | 'published' | 'uncertain' | 'failed' | 'cancelled' | string;
export type PublicationHistorySummaryStatus = 'not_submitted' | 'queued' | 'submitting' | 'reviewing' | 'partial' | 'published' | 'uncertain' | 'failed';
export interface PublicationHistoryAttempt {
  attemptId: string | null;
  status: PublicationRecordStatus | null;
  createdAt: string | null;
  updatedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  remoteId: string | null;
  remoteUrl: string | null;
  errorCode: string | null;
  reasonCode: string | null;
}
export interface PublicationHistoryRecord {
  version?: number;
  publicationId: string;
  clientId: string;
  articleId: string | null;
  articleKey: string;
  targetKey: string;
  platformId: string | null;
  mediaResourceId: string | null;
  displayName: string | null;
  titleSnapshot?: string | null;
  status: PublicationRecordStatus;
  createdAt: string;
  updatedAt: string;
  attempts: PublicationHistoryAttempt[];
  attemptId: string | null;
  remoteId: string | null;
  remoteUrl: string | null;
  errorCode: string | null;
  reasonCode: string | null;
}
export interface PublicationHistorySummary {
  status: PublicationHistorySummaryStatus;
  label: string;
  records: number;
  published: number;
  uncertain: boolean;
}

export interface ArticleReviewSelection { clientId: string; articleId: string; }
export interface ArticleReviewResult { approved: string[]; rejected: Array<{ articleId: string; code: string }>; skipped: string[]; }
export type ArticleRemovalTransactionStatus = 'pending_auto_recovery' | 'needs_repair' | 'committed' | 'superseded' | 'pending_recovery' | string;
export interface ArticleRemovalTransaction {
  id?: string;
  transactionId?: string;
  status: ArticleRemovalTransactionStatus;
  phase?: string | null;
  errorCode?: string | null;
  reasonCode?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  articleCount?: number;
  queueCursor?: number;
  articleCursor?: number;
}
export interface ContentSubmissionBatchInput { clientId: string; articleIds: string[]; targetPlatformIds: string[]; confirmed?: true; }
export type ContentSubmissionItemStatus = 'excluded' | 'blocked' | 'queueable' | 'idempotent' | 'alreadyQueued' | 'blockedPublished' | 'blockedUncertain' | 'conflict' | 'reserving' | 'queued' | 'submitting' | 'submitted' | 'published' | 'uncertain' | 'failed' | 'failed-cleaned' | 'published-cleaned' | 'cancelled' | 'cancelled-cleaned' | 'skipped' | string;
export interface ContentSubmissionBatchItem { articleId: string; targetPlatformId: string; status: ContentSubmissionItemStatus; contentHash: string; filename?: string; filePath?: string; sidecarPath?: string; publicationId?: string | null; attemptId?: string | null; articleKey?: string; targetKey?: string; publicationStatus?: string | null; reasonCode?: string | null; reasonCodes?: string[]; reasons?: string[]; reconciledStatus?: string; unchanged?: boolean; canCancel?: boolean; canCleanup?: boolean; submissionBatchId?: string; }
export interface ContentSubmissionBatchPreview { batchId?: string; clientId: string; totalTaskCount: number; queueableTaskCount: number; idempotentCount: number; alreadyQueuedCount?: number; blockedPublishedCount?: number; blockedUncertainCount?: number; blockedContentCount?: number; conflictCount: number; ineligibleArticleIds?: string[]; unreviewedArticleIds: string[]; missingArticleIds: string[]; unsupportedPlatformIds: string[]; items: ContentSubmissionBatchItem[]; }
export interface ContentSubmissionBatchRecord { id: string; clientId: string; status: string; createdAt: string; updatedAt?: string; items: ContentSubmissionBatchItem[]; }
export interface ContentSubmissionPlatform { id: string; displayName: string; scanDir: string; contentQueueImport: boolean; }
export interface ContentSubmissionCancellationPreview { batchId: string; cancelableCount: number; uncancelableCount: number; items: Array<ContentSubmissionBatchItem & { cancelable: boolean }>; }
export interface ContentSubmissionCleanupPreview { batchId: string; cleanableCount: number; uncleanableCount: number; items: Array<ContentSubmissionBatchItem & { cleanable: boolean }>; }
export interface ContentSubmissionCleanupResult { batchId: string; cleanedCount: number; skippedCount: number; items: ContentSubmissionBatchItem[]; }

export interface PlatformArticle {
  filename: string;
  filePath: string;
  title: string;
  platformId: string;
  sourcePlatformId: string;
  sourceArticleState?: 'active' | 'trashed' | 'missing' | string | null;
  reasonCode?: string | null;
  archiveError?: string | { code?: string | null; message?: string | null } | null;
  remoteStatus?: 'published' | 'failed' | 'uncertain' | string | null;
}

export interface PlatformQueueData {
  revision?: number;
  platforms: PlatformTarget[];
  queue: PlatformArticle[];
}

export interface PlatformQueueSnapshot {
  revision: number;
  queue: PlatformArticle[];
  platforms: PlatformTarget[];
  counts: { actionable: number; attention: number; total: number };
  loading: boolean;
  error: string | null;
}

export type WorkspaceDataInvalidationScope = 'platformQueue' | 'navigationSummary' | 'articleAttention' | 'orders' | 'contentSources' | string;
export interface WorkspaceDataInvalidatedEvent {
  revision: number;
  scopes: WorkspaceDataInvalidationScope[];
  reasonCode?: string | null;
}

export interface ArticleAttentionItem {
  attentionId: string;
  kind: string;
  articleId?: string | null;
  titleSnapshot?: string | null;
  clientId?: string | null;
  platformId?: string | null;
  displayName?: string | null;
  batchId?: string | null;
  publicationId?: string | null;
  attemptId?: string | null;
  transactionId?: string | null;
  status?: string | null;
  reasonCode?: string | null;
  pairState?: string | null;
  recommendedAction?: string | null;
  allowedActions: string[];
  updatedAt?: string | null;
  message?: string | null;
}

export interface ArticleAttentionList {
  revision: number;
  items: ArticleAttentionItem[];
  counts: { total: number; actionable: number };
}

export interface ArticleAttentionPreview {
  attentionId: string;
  revision: number;
  action: string;
  requiresConfirmation: boolean;
  message: string;
  changedScopes: string[];
}

export interface ArticleAttentionResolution {
  outcome: string;
  attentionId: string;
  result?: unknown;
  changedScopes: string[];
}

export interface FailedPublicationRetryPreview {
  publicationId: string;
  clientId: string;
  articleId: string;
  targetPlatformId: string;
  titleSnapshot?: string | null;
  failureCount: number;
  requiresConfirmation: boolean;
  message: string;
  details?: { titleSnapshot?: string | null; targetPlatformId: string; failureCount: number };
}

export interface FailedPublicationRetryResult {
  batchId?: string;
  publicationId: string;
  attemptId?: string | null;
  clientId: string;
  articleId: string;
  targetPlatformId: string;
  changedScopes: string[];
}

export interface PlatformTarget {
  id: string;
  displayName: string;
  scanDir: string;
}

export interface PlatformStatus {
  isBatchRunning: boolean;
  isStopPending: boolean;
  isPlatformRunning: boolean;
  runId?: string | null;
  total?: number;
  processed?: number;
  succeeded?: number;
  failed?: number;
  skipped?: number;
  uncertain?: number;
  currentTask?: PlatformTaskReference | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  terminalResult?: PlatformTerminalResult | null;
  phase?: 'idle' | 'running' | 'waiting-interval' | 'stopping' | 'completed' | 'failed' | string;
  status?: string;
  waitRemainingMs?: number;
  nextTask?: PlatformTaskReference | PlatformSubmitTask | null;
  task?: PlatformTaskReference | PlatformSubmitTask | null;
  targetPlatformId?: string | null;
  reasonCode?: string | null;
  queueRevision?: number | null;
}

export interface PlatformSubmitState extends PlatformStatus {}

export interface PlatformTaskReference {
  sourcePlatformId: string;
  filename: string;
  targetPlatformId: string;
}

export interface PlatformTerminalResult {
  ok: number;
  fail: number;
  skipped: number;
  uncertain: number;
  results: Array<{
    task: PlatformTaskReference;
    status: string;
    publicationStatus?: string | null;
    error?: string | null;
  }>;
}

export interface PlatformTaskSnapshot extends PlatformStatus {
  runId: string | null;
  phase: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  uncertain: number;
  currentTask: PlatformTaskReference | null;
  startedAt: string | null;
  updatedAt: string | null;
  terminalResult: PlatformTerminalResult | null;
}

export interface PlatformSubmitPlan {
  taskCount: number;
  tasks: PlatformSubmitTask[];
}

export interface PlatformSubmitTask {
  sourcePlatformId: string;
  filename: string;
  filePath: string;
  targetPlatformId: string;
}

export interface PlatformSubmitResult {
  ok: number;
  fail: number;
  skipped: number;
  results: PlatformTaskResult[];
  archiveSummary?: {
    attempted: number;
    succeeded: number;
    failed: number;
  };
  trashDisposition?: 'keep_local' | 'offer_trash' | 'auto_trash_requested' | 'auto_trash_blocked' | string;
  trashSummary?: { offeredCount?: number; requestedCount?: number; movedCount?: number; blockedCount?: number; failedCount?: number };
}

export interface PlatformTaskResult {
  task: PlatformSubmitTask;
  status: 'success' | 'failed' | 'pending';
  error?: string;
  archiveError?: string | { code?: string | null; message?: string | null } | null;
}

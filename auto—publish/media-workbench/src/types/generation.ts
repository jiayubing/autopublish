export interface GenerationBatchState {
  state?: GenerationBatchLiveStatus;
  status?: GenerationBatchLiveStatus;
  isBatchRunning?: boolean;
  isStopPending?: boolean;
  batchId?: string | null;
  counts?: GenerationBatchCounts;
  updatedAt?: string;
  taskId?: string | null;
  error?: { code?: string; message?: string } | null;
  runtimeId?: string | null;
  sequence?: number;
  batch?: GenerationBatch | null;
  capabilities?: {
    canResume?: boolean;
    canContinue?: boolean;
    canRetry?: boolean;
    canCancel?: boolean;
  };
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

export type GenerationBatchLiveStatus =
  | "idle"
  | "pending"
  | "starting"
  | "running"
  | "pausing"
  | "paused"
  | "stopping"
  | "stopped"
  | "interrupted"
  | "paused_configuration"
  | "failed"
  | "completed";

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
  invalidArticles: Array<{
    clientId: string;
    articleId?: string | null;
    taskId: string;
    reasonCode: string;
  }>;
  clientGroups: Array<{
    clientId: string;
    articleCount: number;
    queueableTaskCount: number;
    idempotentCount: number;
    blockedPublishedCount: number;
    blockedUncertainCount: number;
    blockedContentCount: number;
    conflictCount: number;
    items: Array<{
      articleId: string;
      targetPlatformId: string;
      status: string;
      reasonCode?: string | null;
    }>;
  }>;
}

export interface GenerationSubmissionHandoffResult {
  generationBatchId: string;
  createdCount: number;
  idempotentCount: number;
  blockedCount: number;
  conflictCount: number;
  failedClientGroups: Array<{ clientId: string; code: string }>;
  completedClientGroups: string[];
  clientGroups: Array<{
    clientId: string;
    articleCount: number;
    queueableTaskCount: number;
    idempotentCount: number;
  }>;
  changedScopes?: string[];
}

export interface GenerationBatchTemplateSelection {
  platform: string;
  templateId: string;
}
export interface GenerationBatchSourceSelection {
  clientId: string;
  materialIds: string[];
  researchQueryIds: string[];
}
export interface GenerationBatchExcludedClient {
  clientId: string;
  codes: string[];
}
export interface GenerationBatchPreview {
  clientCount: number;
  executableClientCount: number;
  taskCount: number;
  executableTaskCount: number;
  excludedTaskCount: number;
  excludedClients: GenerationBatchExcludedClient[];
  templates: GenerationBatchTemplateSelection[];
  clientSources: GenerationBatchSourceSelection[];
  tasks?: Array<
    GenerationBatchSourceSelection & { platform: string; templateId: string }
  >;
}
export type GenerationTaskStatus =
  "pending" | "running" | "succeeded" | "failed" | "interrupted" | "cancelled";
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
export interface ResearchSnapshot {
  questionId: string;
  question?: string;
  answerText: string;
  references: Array<{ title: string; url: string; snippet?: string }>;
  collectedAt?: string;
  collectionMethod: "automatic" | "manual" | "legacy";
}
export interface GeneratedContentArticle {
  id: string;
  clientId: string;
  materialIds?: string[];
  researchQueryIds?: string[];
  researchQueryId?: string;
  researchSnapshots?: ResearchSnapshot[];
  platform?: string;
  scenario?: string;
  templateId?: string;
  title: string;
  content: string;
  status: "generated" | "saved" | string;
  source?: {
    client_material: boolean;
    doubao_answer: boolean;
    references: boolean;
    template: boolean;
  };
  createdAt: string;
  updatedAt?: string;
  materialSnapshots?: Array<{
    id: string;
    name: string;
    extension: string;
    content: string;
    contentHash: string;
    source: string;
  }>;
  templateSnapshot?: {
    platform: string;
    id: string;
    name: string;
    scenario: string;
    body: string;
    bodyHash: string;
    source?: "builtin" | "custom";
  };
  generationBatchId?: string | null;
  generationTaskId?: string | null;
  sourceArticleId?: string | null;
  version?: number;
}

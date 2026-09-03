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
  | "interrupted"
  | "paused_configuration"
  | "failed"
  | "completed"
  | "abandoned";

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
  articleTitle?: string | null;
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
  generationOperationId?: string | null;
}
export interface ContentGenerationOperation {
  operationId: string;
  articleCount: number;
  status: "completed" | "partial" | "failed";
  articles: Array<{ index: number; article: GeneratedContentArticle }>;
  failures: Array<{ index: number; code: string }>;
}

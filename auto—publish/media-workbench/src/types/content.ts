import type { GeneratedContentArticle } from "./generation";

export interface ContentCommandStaleResult {
  stale: true;
  code: "CONTENT_COMMAND_STALE";
  reason: "scope-changed";
}

export interface ContentMaterial {
  id?: string;
  name: string;
  extension?: string;
  status?: "ready" | "error" | "converting" | string;
  content?: string;
  characterCount?: number;
  error?: { code?: string; message?: string } | null;
  contentHash?: string;
  source?: "text" | "docx" | string;
}
export interface ContentClient {
  id: string;
  name: string;
  searchQuery?: string;
  publicationProfiles?: {
    lieju: LiejuPublicationProfile;
  };
  knowledgeFiles: ContentMaterial[];
}
export interface LiejuPublicationProfile {
  city: string;
  contact: string;
  phone: string;
}
export interface ContentQuestion {
  id: string;
  text: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
export type DoubaoBatchMode = "missing" | "recollect";
export interface DoubaoBatchPreview {
  mode: DoubaoBatchMode;
  clientCount: number;
  taskCount: number;
  skippedExisting: number;
  disabledQuestions: number;
}
export type DoubaoLoginStatus =
  "unknown" | "checking" | "login_required" | "authenticated" | "session_error";
export type DoubaoTaskStatus =
  | "pending"
  | "waiting_login"
  | "waiting_human"
  | "running"
  | "waiting_interval"
  | "paused"
  | "succeeded"
  | "failed"
  | "cancelled";
export interface DoubaoTask {
  id: string;
  clientId: string;
  questionId: string;
  status: DoubaoTaskStatus;
  answerLength: number;
  referenceCount: number;
  error?: { code: string; message: string } | null;
}
export interface DoubaoQueueState {
  status: "idle" | "running" | "paused" | "stopping" | "completed";
  currentTaskId: string | null;
  completed: number;
  total: number;
  waitRemainingMs: number;
  tasks: DoubaoTask[];
}
export interface DoubaoLoginState {
  status: DoubaoLoginStatus;
  observation?: "complete" | "unavailable";
  errorText?: string;
}
export interface ContentResearch {
  id: string;
  clientId: string;
  question?: string;
  answerText?: string;
  references: Array<{ title: string; url: string; snippet?: string }>;
  collectionMethod: "automatic" | "manual" | "legacy";
  collectedAt?: string;
  updatedAt?: string;
  createdAt?: string;
  isAnswerComplete?: boolean;
  answerLength?: number;
  referenceCount?: number;
}
export interface ContentTemplate {
  id: string;
  templateId?: string;
  platform: string;
  platformId?: string;
  scenario: string;
  name: string;
  displayName?: string;
  description?: string;
  order?: number;
  enabled?: boolean;
  body: string;
  source?: "builtin" | "custom";
  readOnly?: boolean;
  bodyHash?: string;
  revision?: string;
  sourceFileName?: string;
}
export interface ContentTemplatePlatform {
  id: string;
  displayName: string;
  description: string;
  order: number;
  source?: "builtin" | "custom";
}
export interface ContentTemplateDiagnostic {
  code: string;
  message: string;
  platformId?: string;
  templateId?: string;
  source?: "builtin" | "custom";
}
export interface ContentTemplateCatalog {
  revision: string;
  platforms: ContentTemplatePlatform[];
  templates: ContentTemplate[];
  diagnostics: ContentTemplateDiagnostic[];
}

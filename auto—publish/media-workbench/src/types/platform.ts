import type { PublicationRecordStatus } from "./publication";

export interface AccountProfile {
  accountProfileId: string;
  platformId: string;
  displayName: string;
  createdAt?: string;
  bindingStatus: "bound" | "unbound";
}

export interface PlatformArticle {
  filename: string;
  title: string;
  platformId: string;
  sourcePlatformId: string;
  accountProfileId?: string;
  sourceArticleState?: "active" | "trashed" | "missing" | string | null;
  reasonCode?: string | null;
  archiveErrorCode?: string | null;
  remoteStatus?:
    | "accepted"
    | "article_rejected"
    | "group_blocked"
    | "uncertain"
    | string
    | null;
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

export interface PlatformTarget {
  id: string;
  displayName: string;
  loginAvailable?: boolean;
}

export interface PlatformStatus {
  workspaceRuntimeId?: string;
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
  phase?:
    | "idle"
    | "running"
    | "waiting-interval"
    | "stopping"
    | "completed"
    | "failed"
    | string;
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
    errorCode?: string | null;
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
  targetPlatformId: string;
}

export interface PlatformSubmitResult {
  ok: number;
  fail: number;
  uncertain: number;
  skipped: number;
  results: PlatformTaskResult[];
  archiveSummary?: {
    attempted: number;
    succeeded: number;
    failed: number;
  };
  trashDisposition?:
    | "keep_local"
    | "offer_trash"
    | "auto_trash_requested"
    | "auto_trash_blocked"
    | string;
  trashSummary?: {
    offeredCount?: number;
    requestedCount?: number;
    movedCount?: number;
    recoveryCount?: number;
    blockedCount?: number;
    failedCount?: number;
    reasonCodes?: Array<
      "IDENTITY_MISSING" | "REMOVAL_BLOCKED" | "REMOVAL_NEEDS_REPAIR" | string
    >;
  };
}

export interface PlatformTaskResult {
  task: PlatformSubmitTask;
  status:
    | "accepted"
    | "article_rejected"
    | "group_blocked"
    | "failed"
    | "uncertain"
    | "skipped"
    | string;
  publicationStatus?: PublicationRecordStatus | null;
  errorCode?: string | null;
  archiveErrorCode?: string | null;
}

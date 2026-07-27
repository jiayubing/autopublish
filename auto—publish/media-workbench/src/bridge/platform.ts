import type {
  PlatformArticle,
  IpcResponse,
  PlatformQueueData,
  PlatformSubmitResult,
  PlatformSubmitState,
  PlatformTaskSnapshot,
} from "../types";
import { ipcError, isElectron } from "./transport";

type PlatformApi = {
  getQueue: () => Promise<IpcResponse<PlatformQueueData>>;
  openLogin: (platformId: string) => Promise<IpcResponse<unknown>>;
  checkLogin: (
    platformId: string,
  ) => Promise<IpcResponse<{ authenticated: boolean }>>;
  submitSelected: (input: {
    submissions: Array<{
      sourcePlatformId: string;
      filename: string;
      targetPlatformIds: string[];
      accountProfiles: Record<string, string>;
    }>;
    autoTrash?: boolean;
  }) => Promise<IpcResponse<PlatformSubmitResult>>;
  getState: () => Promise<IpcResponse<PlatformTaskSnapshot>>;
  pauseSubmit: (runId?: string | null) => Promise<IpcResponse<unknown>>;
  stopSubmit: (runId?: string | null) => Promise<IpcResponse<unknown>>;
  onState: (listener: (state: PlatformSubmitState) => void) => () => void;
};

const platformApi = () =>
  window.desktopConsole?.platforms as PlatformApi | undefined;

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  lieju: "列举网",
  toutiao: "头条",
  hepan: "蓝色河畔",
};

export function getPlatformDisplayName(id: string): string {
  return PLATFORM_DISPLAY_NAMES[id] || id;
}

export async function getPlatformQueue(): Promise<PlatformQueueData> {
  if (!isElectron()) return { platforms: [], queue: [] };
  const result = await platformApi()!.getQueue();
  if (!result.ok) throw ipcError(result.error, "getPlatformQueue failed");
  const data =
    result.data && typeof result.data === "object"
      ? (result.data as {
          revision?: number;
          platforms?: Array<{
            id: string;
            loginAvailable?: boolean;
          }>;
          queue?: PlatformArticle[];
        })
      : {};
  return {
    revision: typeof data.revision === "number" ? data.revision : undefined,
    platforms: (data.platforms || []).map((platform) => ({
      id: platform.id,
      displayName: getPlatformDisplayName(platform.id),
      loginAvailable: platform.loginAvailable,
    })),
    queue: data.queue || [],
  };
}

export async function openPlatformLogin(platformId: string): Promise<void> {
  if (!isElectron()) return;
  const result = await platformApi()!.openLogin(platformId);
  if (!result.ok) throw ipcError(result.error, "openPlatformLogin failed");
}

export async function checkPlatformLogin(platformId: string): Promise<boolean> {
  if (!isElectron()) return false;
  const result = await platformApi()!.checkLogin(platformId);
  if (!result.ok) throw ipcError(result.error, "checkPlatformLogin failed");
  return result.data?.authenticated === true;
}

export async function submitPlatformSelection(input: {
  submissions: Array<{
    sourcePlatformId: string;
    filename: string;
    targetPlatformIds: string[];
    accountProfiles: Record<string, string>;
  }>;
  autoTrash?: boolean;
}): Promise<PlatformSubmitResult> {
  if (!isElectron())
    return { ok: 0, fail: 0, uncertain: 0, skipped: 0, results: [] };
  const result = await platformApi()!.submitSelected(input);
  if (!result.ok)
    throw ipcError(result.error, "submitPlatformSelection failed");
  return (
    result.data || { ok: 0, fail: 0, uncertain: 0, skipped: 0, results: [] }
  );
}

export async function getPlatformState(): Promise<PlatformTaskSnapshot> {
  if (!isElectron())
    return {
      runId: null,
      phase: "idle",
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      uncertain: 0,
      currentTask: null,
      startedAt: null,
      updatedAt: null,
      terminalResult: null,
      isBatchRunning: false,
      isStopPending: false,
      isPlatformRunning: false,
      waitRemainingMs: 0,
    };
  const result = await platformApi()!.getState();
  if (!result.ok) throw ipcError(result.error, "getPlatformState failed");
  return (
    result.data || {
      runId: null,
      phase: "idle",
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      uncertain: 0,
      currentTask: null,
      startedAt: null,
      updatedAt: null,
      terminalResult: null,
      isBatchRunning: false,
      isStopPending: false,
      isPlatformRunning: false,
      waitRemainingMs: 0,
    }
  );
}

export async function pausePlatformSubmit(
  runId?: string | null,
): Promise<void> {
  if (!isElectron()) return;
  const result = await platformApi()!.pauseSubmit(runId);
  if (!result.ok) throw ipcError(result.error, "pausePlatformSubmit failed");
}

export async function stopPlatformSubmit(runId?: string | null): Promise<void> {
  if (!isElectron()) return;
  const result = await platformApi()!.stopSubmit(runId);
  if (!result.ok) throw ipcError(result.error, "stopPlatformSubmit failed");
}

export function onPlatformState(
  listener: (state: PlatformSubmitState) => void,
): () => void {
  if (!isElectron() || typeof platformApi()?.onState !== "function")
    return () => {};
  return platformApi()!.onState(listener);
}

export {
  previewTrashedArticleQueueResidue,
  cleanupTrashedArticleQueueResidue,
} from "./content";

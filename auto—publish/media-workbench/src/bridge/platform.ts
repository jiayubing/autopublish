import type {
  PlatformArticle,
  PlatformQueueData,
  PlatformSubmitResult,
  PlatformSubmitState,
  PlatformTaskSnapshot,
} from "../types/platform";
import type { IpcResponse } from "../types/ipc";
import { ipcError, requireBridgeApi, requireDisposer } from "./transport";

type PlatformApi = {
  getQueue: () => Promise<IpcResponse<PlatformQueueData>>;
  openLogin: (
    platformId: string,
  ) => Promise<IpcResponse<{ platformId: string; status: "opened" }>>;
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
  pauseSubmit: (
    runId?: string | null,
  ) => Promise<IpcResponse<{ accepted: boolean; alreadyStopped: boolean }>>;
  stopSubmit: (
    runId?: string | null,
  ) => Promise<IpcResponse<{ accepted: boolean; alreadyStopped: boolean }>>;
  onState: (listener: (state: PlatformSubmitState) => void) => () => void;
  onStateDiagnostic?: (listener: () => void) => () => void;
};

const platformApi = () => requireBridgeApi<PlatformApi>("platforms");

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  lieju: "列举网",
  toutiao: "头条",
  hepan: "蓝色河畔",
};

export function getPlatformDisplayName(id: string): string {
  return PLATFORM_DISPLAY_NAMES[id] || id;
}

export async function getPlatformQueue(): Promise<PlatformQueueData> {
  const result = await platformApi().getQueue();
  if (!result.ok) throw ipcError(result.error, "getPlatformQueue failed");
  if (!result.data) throw ipcError(undefined, "getPlatformQueue failed");
  const data = result.data as {
    revision?: number;
    platforms: Array<{ id: string; loginAvailable?: boolean }>;
    queue: PlatformArticle[];
  };
  return {
    revision: typeof data.revision === "number" ? data.revision : undefined,
    platforms: data.platforms.map((platform) => ({
      id: platform.id,
      displayName: getPlatformDisplayName(platform.id),
      loginAvailable: platform.loginAvailable,
    })),
    queue: data.queue,
  };
}

export async function openPlatformLogin(platformId: string): Promise<void> {
  const result = await platformApi().openLogin(platformId);
  if (!result.ok) throw ipcError(result.error, "openPlatformLogin failed");
  if (!result.data) throw ipcError(undefined, "openPlatformLogin failed");
}

export async function checkPlatformLogin(platformId: string): Promise<boolean> {
  const result = await platformApi().checkLogin(platformId);
  if (!result.ok) throw ipcError(result.error, "checkPlatformLogin failed");
  if (!result.data) throw ipcError(undefined, "checkPlatformLogin failed");
  return result.data.authenticated;
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
  const result = await platformApi().submitSelected(input);
  if (!result.ok)
    throw ipcError(result.error, "submitPlatformSelection failed");
  if (!result.data) throw ipcError(undefined, "submitPlatformSelection failed");
  return result.data;
}

export async function getPlatformState(): Promise<PlatformTaskSnapshot> {
  const result = await platformApi().getState();
  if (!result.ok) throw ipcError(result.error, "getPlatformState failed");
  if (!result.data) throw ipcError(undefined, "getPlatformState failed");
  return result.data;
}

export async function pausePlatformSubmit(
  runId?: string | null,
): Promise<void> {
  const result = await platformApi().pauseSubmit(runId);
  if (!result.ok) throw ipcError(result.error, "pausePlatformSubmit failed");
  if (!result.data) throw ipcError(undefined, "pausePlatformSubmit failed");
}

export async function stopPlatformSubmit(runId?: string | null): Promise<void> {
  const result = await platformApi().stopSubmit(runId);
  if (!result.ok) throw ipcError(result.error, "stopPlatformSubmit failed");
  if (!result.data) throw ipcError(undefined, "stopPlatformSubmit failed");
}

export function onPlatformState(
  listener: (state: PlatformSubmitState) => void,
): () => void {
  return requireDisposer(
    platformApi().onState(listener),
    "onPlatformState failed",
  );
}

export function onPlatformStateDiagnostic(listener: () => void): () => void {
  let subscribe: PlatformApi["onStateDiagnostic"];
  try {
    subscribe = platformApi().onStateDiagnostic;
  } catch {
    return () => {};
  }
  if (typeof subscribe !== "function") return () => {};
  return requireDisposer(
    subscribe(listener),
    "onPlatformStateDiagnostic failed",
  );
}

export {
  previewTrashedArticleQueueResidue,
  cleanupTrashedArticleQueueResidue,
} from "./content";

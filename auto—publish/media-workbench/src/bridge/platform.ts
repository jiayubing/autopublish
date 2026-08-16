import type {
  PlatformArticle,
  PlatformQueueData,
} from "../types/platform";
import type { IpcResponse } from "../types/ipc";
import {
  ipcError,
  requireBridgeMethod,
  requirePlatformsApi,
} from "./transport";

type PlatformApi = {
  getQueue: () => Promise<IpcResponse<PlatformQueueData>>;
  openLogin: (
    platformId: string,
  ) => Promise<IpcResponse<{ platformId: string; status: "opened" }>>;
  checkLogin: (
    platformId: string,
  ) => Promise<IpcResponse<{ authenticated: boolean }>>;
};

const platformApi = () => requirePlatformsApi<PlatformApi>();

export async function getPlatformQueue(): Promise<PlatformQueueData> {
  const result = await requireBridgeMethod(platformApi().getQueue)();
  if (!result.ok) throw ipcError(result.error, "getPlatformQueue failed");
  if (!result.data) throw ipcError(undefined, "getPlatformQueue failed");
  const data = result.data as {
    revision?: number;
    platforms: Array<{
      id: string;
      displayName: string;
      loginAvailable?: boolean;
    }>;
    queue: PlatformArticle[];
  };
  return {
    revision: typeof data.revision === "number" ? data.revision : undefined,
    platforms: data.platforms.map((platform) => ({
      id: platform.id,
      displayName: platform.displayName,
      loginAvailable: platform.loginAvailable,
    })),
    queue: data.queue,
  };
}

export async function openPlatformLogin(platformId: string): Promise<void> {
  const result = await requireBridgeMethod(platformApi().openLogin)(platformId);
  if (!result.ok) throw ipcError(result.error, "openPlatformLogin failed");
  if (!result.data) throw ipcError(undefined, "openPlatformLogin failed");
}

export async function checkPlatformLogin(platformId: string): Promise<boolean> {
  const result = await requireBridgeMethod(platformApi().checkLogin)(
    platformId,
  );
  if (!result.ok) throw ipcError(result.error, "checkPlatformLogin failed");
  if (!result.data) throw ipcError(undefined, "checkPlatformLogin failed");
  return result.data.authenticated;
}

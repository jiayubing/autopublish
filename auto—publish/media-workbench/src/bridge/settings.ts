import type {
  AiProviderClearResult,
  AiProviderConfigInput,
  AiProviderStatus,
  AiProviderTestResult,
  LegacyProviderSettingsStatus,
  PlatformProviderStatus,
  PlatformProviderTestResult,
} from "../types";
import { isElectron, unavailable } from "./transport";

type SafeIpcError = { code?: string; userMessage?: string } | undefined;
type SettingsResponse<T> = {
  ok: boolean;
  data?: T;
  error?: Exclude<SafeIpcError, undefined>;
};
type AiProviderApi = {
  getStatus: () => Promise<SettingsResponse<AiProviderStatus>>;
  save: (
    input: AiProviderConfigInput,
  ) => Promise<SettingsResponse<AiProviderStatus>>;
  testConnection: (
    input: AiProviderConfigInput,
  ) => Promise<SettingsResponse<AiProviderTestResult>>;
  clear: () => Promise<SettingsResponse<AiProviderClearResult>>;
};
type PlatformSettingsApi = {
  getStatus: (
    platformId: string,
  ) => Promise<SettingsResponse<{ status: PlatformProviderStatus }>>;
  save: (
    platformId: string,
    draft: Record<string, unknown>,
  ) => Promise<SettingsResponse<{ status: PlatformProviderStatus }>>;
  test: (
    platformId: string,
    draft?: Record<string, unknown>,
  ) => Promise<SettingsResponse<{ result: PlatformProviderTestResult }>>;
  clear: (
    platformId: string,
  ) => Promise<SettingsResponse<{ cleared: boolean }>>;
  getLegacyStatus: () => Promise<
    SettingsResponse<LegacyProviderSettingsStatus>
  >;
  importLegacy: (input: {
    confirmed: true;
  }) => Promise<SettingsResponse<unknown>>;
};
type StorageMaintenanceApi = {
  getUsage: () => Promise<SettingsResponse<StorageUsage>>;
  cleanCaches: () => Promise<
    SettingsResponse<{ blocked: boolean; reason?: string }>
  >;
};

const aiProviderApi = () =>
  window.desktopConsole?.aiProvider as AiProviderApi | undefined;
const platformSettingsApi = () =>
  window.desktopConsole?.platformSettings as PlatformSettingsApi | undefined;
const storageMaintenanceApi = () =>
  window.desktopConsole?.storageMaintenance as
    StorageMaintenanceApi | undefined;
function settingsIpcError(error: SafeIpcError, fallback: string) {
  return Object.assign(new Error(error?.userMessage || fallback), {
    code: error?.code,
  });
}

export type StorageUsage = {
  logs: { bytes: number; files: number };
  temporary: { bytes: number; files: number };
  docxCache: { bytes: number; files: number };
  profiles: { bytes: number; files: number };
  active?: boolean;
};

const emptyAiStatus: AiProviderStatus = {
  source: "application",
  configured: false,
  baseUrl: "",
  model: "",
  timeoutMs: 60000,
  hasApiKey: false,
  apiKeyMask: "",
  lastTest: null,
};
export async function getAiProviderStatus(): Promise<AiProviderStatus> {
  if (!isElectron()) return emptyAiStatus;
  const result = await aiProviderApi()!.getStatus();
  if (!result.ok)
    throw settingsIpcError(result.error, "Unable to read AI provider settings");
  return result.data || emptyAiStatus;
}
export async function saveAiProviderConfig(
  input: AiProviderConfigInput,
): Promise<AiProviderStatus> {
  if (!isElectron())
    throw unavailable("AI provider settings require the desktop app");
  const result = await aiProviderApi()!.save(input);
  if (!result.ok || !result.data)
    throw settingsIpcError(result.error, "Unable to save AI provider settings");
  return result.data;
}
export async function testAiProviderConnection(
  input: AiProviderConfigInput,
): Promise<AiProviderTestResult> {
  if (!isElectron())
    throw unavailable("AI provider testing requires the desktop app");
  const result = await aiProviderApi()!.testConnection(input);
  if (!result.ok || !result.data)
    throw settingsIpcError(
      result.error,
      "Unable to test the AI provider connection",
    );
  return result.data;
}
export async function clearAiProviderConfig(): Promise<AiProviderClearResult> {
  if (!isElectron())
    throw unavailable("AI provider settings require the desktop app");
  const result = await aiProviderApi()!.clear();
  if (!result.ok || !result.data)
    throw settingsIpcError(
      result.error,
      "Unable to clear AI provider settings",
    );
  return result.data;
}
export async function getPlatformSettingsStatus<
  T extends PlatformProviderStatus = PlatformProviderStatus,
>(platformId: string): Promise<T> {
  if (!isElectron())
    return {
      source: "application",
      configured: false,
      baseUrl: "",
      timeoutMs: 0,
      allowInsecure: false,
      transport: "未配置",
      apiKeyMask: "",
      lastTest: null,
    } as T;
  const result = await platformSettingsApi()!.getStatus(platformId);
  if (!result.ok)
    throw settingsIpcError(result.error, "Unable to read platform settings");
  if (!result.data)
    throw settingsIpcError(undefined, "Unable to read platform settings");
  return result.data.status as T;
}
export async function savePlatformSettings(
  platformId: string,
  draft: Record<string, unknown>,
): Promise<PlatformProviderStatus> {
  if (!isElectron())
    throw unavailable("Platform settings require the desktop app");
  const result = await platformSettingsApi()!.save(platformId, draft);
  if (!result.ok || !result.data)
    throw settingsIpcError(result.error, "Unable to save platform settings");
  return result.data.status;
}
export async function testPlatformSettings(
  platformId: string,
  draft?: Record<string, unknown>,
): Promise<PlatformProviderTestResult> {
  if (!isElectron())
    throw unavailable("Platform settings require the desktop app");
  const result = await platformSettingsApi()!.test(platformId, draft);
  if (!result.ok || !result.data)
    throw settingsIpcError(result.error, "Platform connection test failed");
  return result.data.result;
}
export async function clearPlatformSettings(
  platformId: string,
): Promise<{ cleared: boolean }> {
  if (!isElectron())
    throw unavailable("Platform settings require the desktop app");
  const result = await platformSettingsApi()!.clear(platformId);
  if (!result.ok)
    throw settingsIpcError(result.error, "Unable to clear platform settings");
  return { cleared: result.data?.cleared === true };
}
export async function getLegacyPlatformSettingsStatus(): Promise<LegacyProviderSettingsStatus> {
  if (!isElectron())
    return {
      discover: {
        media: { available: false, sources: [] },
        hepan: { available: false, sources: [], cookiePathAvailable: false },
        sources: [],
        importable: false,
      },
      record: null,
    };
  const result = await platformSettingsApi()!.getLegacyStatus();
  if (!result.ok || !result.data)
    throw settingsIpcError(
      result.error,
      "Unable to read legacy platform settings",
    );
  return result.data;
}
export async function importLegacyPlatformSettings(): Promise<unknown> {
  if (!isElectron())
    throw unavailable(
      "Legacy platform settings import requires the desktop app",
    );
  const result = await platformSettingsApi()!.importLegacy({
    confirmed: true,
  });
  if (!result.ok)
    throw settingsIpcError(
      result.error,
      "Unable to import legacy platform settings",
    );
  return result.data;
}

export async function getStorageUsage(): Promise<StorageUsage | null> {
  if (!isElectron()) return null;
  const result = await storageMaintenanceApi()!.getUsage();
  if (!result.ok || !result.data)
    throw settingsIpcError(result.error, "Unable to read storage usage");
  return result.data;
}

export async function cleanStorageCaches(): Promise<{ blocked: boolean }> {
  if (!isElectron())
    throw unavailable("Storage maintenance requires the desktop app");
  const result = await storageMaintenanceApi()!.cleanCaches();
  if (!result.ok || !result.data || result.data.blocked)
    throw settingsIpcError(
      result.error || { code: result.data?.reason },
      "Storage cache cleanup failed",
    );
  return { blocked: false };
}

import type {
  AiProviderClearResult,
  AiProviderConfigInput,
  AiProviderStatus,
  AiProviderTestResult,
  LegacyProviderSettingsStatus,
  PlatformProviderStatus,
  PlatformProviderTestResult,
} from "../types/settings";
import {
  ipcError,
  requireAiProviderApi,
  requireBridgeMethod,
  requirePlatformSettingsApi,
  requireStorageMaintenanceApi,
} from "./transport";

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

const aiProviderApi = () => requireAiProviderApi<AiProviderApi>();
const platformSettingsApi = () =>
  requirePlatformSettingsApi<PlatformSettingsApi>();
const storageMaintenanceApi = () =>
  requireStorageMaintenanceApi<StorageMaintenanceApi>();
function settingsIpcError(error: SafeIpcError, fallback: string) {
  return ipcError(error, fallback);
}

export type StorageUsage = {
  logs: { bytes: number; files: number };
  temporary: { bytes: number; files: number };
  docxCache: { bytes: number; files: number };
  profiles: { bytes: number; files: number };
  active?: boolean;
};

export async function getAiProviderStatus(): Promise<AiProviderStatus> {
  const result = await requireBridgeMethod(aiProviderApi().getStatus)();
  if (!result.ok)
    throw settingsIpcError(result.error, "Unable to read AI provider settings");
  if (!result.data)
    throw settingsIpcError(undefined, "Unable to read AI provider settings");
  return result.data;
}
export async function saveAiProviderConfig(
  input: AiProviderConfigInput,
): Promise<AiProviderStatus> {
  const result = await requireBridgeMethod(aiProviderApi().save)(input);
  if (!result.ok || !result.data)
    throw settingsIpcError(result.error, "Unable to save AI provider settings");
  return result.data;
}
export async function testAiProviderConnection(
  input: AiProviderConfigInput,
): Promise<AiProviderTestResult> {
  const result = await requireBridgeMethod(aiProviderApi().testConnection)(
    input,
  );
  if (!result.ok || !result.data)
    throw settingsIpcError(
      result.error,
      "Unable to test the AI provider connection",
    );
  return result.data;
}
export async function clearAiProviderConfig(): Promise<AiProviderClearResult> {
  const result = await requireBridgeMethod(aiProviderApi().clear)();
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
  const result = await requireBridgeMethod(platformSettingsApi().getStatus)(
    platformId,
  );
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
  const result = await requireBridgeMethod(platformSettingsApi().save)(
    platformId,
    draft,
  );
  if (!result.ok || !result.data)
    throw settingsIpcError(result.error, "Unable to save platform settings");
  return result.data.status;
}
export async function testPlatformSettings(
  platformId: string,
  draft?: Record<string, unknown>,
): Promise<PlatformProviderTestResult> {
  const result = await requireBridgeMethod(platformSettingsApi().test)(
    platformId,
    draft,
  );
  if (!result.ok || !result.data)
    throw settingsIpcError(result.error, "Platform connection test failed");
  return result.data.result;
}
export async function clearPlatformSettings(
  platformId: string,
): Promise<{ cleared: boolean }> {
  const result = await requireBridgeMethod(platformSettingsApi().clear)(
    platformId,
  );
  if (!result.ok || !result.data)
    throw settingsIpcError(result.error, "Unable to clear platform settings");
  return { cleared: result.data.cleared };
}
export async function getLegacyPlatformSettingsStatus(): Promise<LegacyProviderSettingsStatus> {
  const result = await requireBridgeMethod(
    platformSettingsApi().getLegacyStatus,
  )();
  if (!result.ok || !result.data)
    throw settingsIpcError(
      result.error,
      "Unable to read legacy platform settings",
    );
  return result.data;
}
export async function importLegacyPlatformSettings(): Promise<unknown> {
  const result = await requireBridgeMethod(platformSettingsApi().importLegacy)({
    confirmed: true,
  });
  if (!result.ok || result.data === undefined || result.data === null)
    throw settingsIpcError(
      result.error,
      "Unable to import legacy platform settings",
    );
  return result.data;
}

export async function getStorageUsage(): Promise<StorageUsage | null> {
  const result = await requireBridgeMethod(storageMaintenanceApi().getUsage)();
  if (!result.ok || !result.data)
    throw settingsIpcError(result.error, "Unable to read storage usage");
  return result.data;
}

export async function cleanStorageCaches(): Promise<{ blocked: boolean }> {
  const result = await requireBridgeMethod(
    storageMaintenanceApi().cleanCaches,
  )();
  if (!result.ok || !result.data || result.data.blocked)
    throw settingsIpcError(
      result.error || { code: result.data?.reason },
      "Storage cache cleanup failed",
    );
  return { blocked: false };
}

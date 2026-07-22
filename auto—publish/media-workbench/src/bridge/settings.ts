import type {
  AiProviderClearResult,
  AiProviderConfigInput,
  AiProviderStatus,
  AiProviderTestResult,
  LegacyProviderSettingsStatus,
  PlatformProviderStatus,
  PlatformProviderTestResult,
} from "../types";
import { ipcError, isElectron, unavailable } from "./transport";

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
  const result = await window.desktopConsole!.aiProvider.getStatus();
  if (!result.ok)
    throw ipcError(result.error, "Unable to read AI provider settings");
  return result.data || emptyAiStatus;
}
export async function saveAiProviderConfig(
  input: AiProviderConfigInput,
): Promise<AiProviderStatus> {
  if (!isElectron())
    throw unavailable("AI provider settings require the desktop app");
  const result = await window.desktopConsole!.aiProvider.save(input);
  if (!result.ok || !result.data)
    throw ipcError(result.error, "Unable to save AI provider settings");
  return result.data;
}
export async function testAiProviderConnection(
  input: AiProviderConfigInput,
): Promise<AiProviderTestResult> {
  if (!isElectron())
    throw unavailable("AI provider testing requires the desktop app");
  const result = await window.desktopConsole!.aiProvider.testConnection(input);
  if (!result.ok || !result.data)
    throw ipcError(result.error, "Unable to test the AI provider connection");
  return result.data;
}
export async function clearAiProviderConfig(): Promise<AiProviderClearResult> {
  if (!isElectron())
    throw unavailable("AI provider settings require the desktop app");
  const result = await window.desktopConsole!.aiProvider.clear();
  if (!result.ok || !result.data)
    throw ipcError(result.error, "Unable to clear AI provider settings");
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
  const result =
    await window.desktopConsole!.platformSettings.getStatus(platformId);
  if (!result.ok)
    throw ipcError(result.error, "Unable to read platform settings");
  return result.data as T;
}
export async function savePlatformSettings(
  platformId: string,
  draft: Record<string, unknown>,
): Promise<PlatformProviderStatus> {
  if (!isElectron())
    throw unavailable("Platform settings require the desktop app");
  const result = await window.desktopConsole!.platformSettings.save(
    platformId,
    draft,
  );
  if (!result.ok || !result.data)
    throw ipcError(result.error, "Unable to save platform settings");
  return result.data;
}
export async function testPlatformSettings(
  platformId: string,
  draft?: Record<string, unknown>,
): Promise<PlatformProviderTestResult> {
  if (!isElectron())
    throw unavailable("Platform settings require the desktop app");
  const result = await window.desktopConsole!.platformSettings.test(
    platformId,
    draft,
  );
  if (!result.ok || !result.data)
    throw ipcError(result.error, "Platform connection test failed");
  return result.data;
}
export async function clearPlatformSettings(
  platformId: string,
): Promise<{ cleared: boolean }> {
  if (!isElectron())
    throw unavailable("Platform settings require the desktop app");
  const result =
    await window.desktopConsole!.platformSettings.clear(platformId);
  if (!result.ok)
    throw ipcError(result.error, "Unable to clear platform settings");
  return result.data || { cleared: false };
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
  const result =
    await window.desktopConsole!.platformSettings.getLegacyStatus();
  if (!result.ok || !result.data)
    throw ipcError(result.error, "Unable to read legacy platform settings");
  return result.data;
}
export async function importLegacyPlatformSettings(): Promise<unknown> {
  if (!isElectron())
    throw unavailable(
      "Legacy platform settings import requires the desktop app",
    );
  const result = await window.desktopConsole!.platformSettings.importLegacy({
    confirmed: true,
  });
  if (!result.ok)
    throw ipcError(result.error, "Unable to import legacy platform settings");
  return result.data;
}

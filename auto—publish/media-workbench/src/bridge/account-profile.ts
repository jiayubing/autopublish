import type { AccountProfile } from "../types";
import { ipcError, isElectron, unavailable } from "./transport";

export async function listAccountProfiles(): Promise<AccountProfile[]> {
  if (
    !isElectron() ||
    typeof window.desktopConsole?.platforms?.listAccountProfiles !== "function"
  )
    throw unavailable("平台账号档案服务不可用");
  const result = await window.desktopConsole.platforms.listAccountProfiles();
  if (!result.ok) throw ipcError(result.error, "读取平台账号档案失败");
  return Array.isArray(result.data) ? result.data : [];
}

export async function confirmAccountProfile(input: {
  platformId: string;
  displayName: string;
}): Promise<AccountProfile> {
  if (
    !isElectron() ||
    typeof window.desktopConsole?.platforms?.confirmAccountProfile !==
      "function"
  )
    throw unavailable("平台账号档案服务不可用");
  const result = await window.desktopConsole.platforms.confirmAccountProfile({
    ...input,
    confirmed: true,
  });
  if (!result.ok) throw ipcError(result.error, "确认平台账号档案失败");
  return result.data;
}

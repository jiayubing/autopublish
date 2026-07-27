import type { AccountProfile, IpcResponse } from "../types";
import { ipcError, isElectron, unavailable } from "./transport";

type AccountProfileApi = {
  listAccountProfiles: () => Promise<
    IpcResponse<{ profiles: AccountProfile[] }>
  >;
  confirmAccountProfile: (input: {
    platformId: string;
    displayName: string;
    confirmed: true;
  }) => Promise<IpcResponse<{ profile: AccountProfile }>>;
};

const accountProfileApi = () =>
  window.desktopConsole?.platforms as AccountProfileApi | undefined;

export async function listAccountProfiles(): Promise<AccountProfile[]> {
  if (
    !isElectron() ||
    typeof accountProfileApi()?.listAccountProfiles !== "function"
  )
    throw unavailable("平台账号档案服务不可用");
  const result = await accountProfileApi()!.listAccountProfiles();
  if (!result.ok) throw ipcError(result.error, "读取平台账号档案失败");
  return Array.isArray(result.data?.profiles) ? result.data.profiles : [];
}

export async function confirmAccountProfile(input: {
  platformId: string;
  displayName: string;
}): Promise<AccountProfile> {
  if (
    !isElectron() ||
    typeof accountProfileApi()?.confirmAccountProfile !== "function"
  )
    throw unavailable("平台账号档案服务不可用");
  const result = await accountProfileApi()!.confirmAccountProfile({
    ...input,
    confirmed: true,
  });
  if (!result.ok || !result.data)
    throw ipcError(result.error, "确认平台账号档案失败");
  return result.data.profile;
}

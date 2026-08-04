import type { AccountProfile } from "../types/platform";
import type { IpcResponse } from "../types/ipc";
import { ipcError, requireBridgeApi } from "./transport";

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
  requireBridgeApi<AccountProfileApi>("platforms");

export async function listAccountProfiles(): Promise<AccountProfile[]> {
  const result = await accountProfileApi().listAccountProfiles();
  if (!result.ok) throw ipcError(result.error, "读取平台账号档案失败");
  if (!Array.isArray(result.data?.profiles))
    throw ipcError(undefined, "读取平台账号档案失败");
  return result.data.profiles;
}

export async function confirmAccountProfile(input: {
  platformId: string;
  displayName: string;
}): Promise<AccountProfile> {
  const result = await accountProfileApi().confirmAccountProfile({
    ...input,
    confirmed: true,
  });
  if (!result.ok || !result.data)
    throw ipcError(result.error, "确认平台账号档案失败");
  return result.data.profile;
}

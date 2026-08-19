import type { AccountProfile } from "../types/platform";
import type { IpcResponse } from "../types/ipc";
import {
  ipcError,
  requireBridgeMethod,
  requirePlatformsApi,
} from "./transport";

type AccountProfileApi = {
  listAccountProfiles: () => Promise<
    IpcResponse<{ profiles: AccountProfile[] }>
  >;
  confirmAccountProfile: (input: {
    platformId: string;
    displayName: string;
    confirmed: true;
  }) => Promise<IpcResponse<{ profile: AccountProfile }>>;
  bindAccountProfile: (input: {
    accountProfileId: string;
    confirmed: true;
  }) => Promise<IpcResponse<{ profile: AccountProfile }>>;
  deleteAccountProfile: (input: {
    accountProfileId: string;
    confirmed: true;
  }) => Promise<IpcResponse<{ accountProfileId: string }>>;
};

const accountProfileApi = () => requirePlatformsApi<AccountProfileApi>();

export async function listAccountProfiles(): Promise<AccountProfile[]> {
  const result = await requireBridgeMethod(
    accountProfileApi().listAccountProfiles,
  )();
  if (!result.ok) throw ipcError(result.error, "读取平台账号档案失败");
  if (!Array.isArray(result.data?.profiles))
    throw ipcError(undefined, "读取平台账号档案失败");
  return result.data.profiles;
}

export async function confirmAccountProfile(input: {
  platformId: string;
  displayName: string;
}): Promise<AccountProfile> {
  const result = await requireBridgeMethod(
    accountProfileApi().confirmAccountProfile,
  )({
    ...input,
    confirmed: true,
  });
  if (!result.ok || !result.data)
    throw ipcError(result.error, "确认平台账号档案失败");
  return result.data.profile;
}

export async function bindAccountProfile(accountProfileId: string): Promise<AccountProfile> {
  const result = await requireBridgeMethod(
    accountProfileApi().bindAccountProfile,
  )({ accountProfileId, confirmed: true });
  if (!result.ok || !result.data?.profile)
    throw ipcError(result.error, "绑定平台账号档案失败");
  return result.data.profile;
}

export async function deleteAccountProfile(accountProfileId: string): Promise<string> {
  const result = await requireBridgeMethod(
    accountProfileApi().deleteAccountProfile,
  )({ accountProfileId, confirmed: true });
  if (!result.ok || !result.data?.accountProfileId)
    throw ipcError(result.error, "删除平台账号档案失败");
  return result.data.accountProfileId;
}

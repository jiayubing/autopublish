import type { IpcError } from "../types/ipc";
import { ipcError, requireBridgeMethod, requireContentApi } from "./transport";

export type RegularSubmissionPermissionSnapshot = {
  clientId: string;
  revision: number;
  items: Array<{
    articleId: string;
    allowed: boolean;
    reasonCodes: string[];
  }>;
};

type ContentIpcResponse<T> =
  | { ok: true; data?: T }
  | { ok: false; error?: Partial<IpcError> };

type PermissionContentApi = {
  listRegularSubmissionPermissions: (input: {
    clientId: string;
    articleIds: string[];
  }) => Promise<ContentIpcResponse<RegularSubmissionPermissionSnapshot>>;
};

export async function listRegularSubmissionPermissions(input: {
  clientId: string;
  articleIds: string[];
}): Promise<RegularSubmissionPermissionSnapshot> {
  const api = requireContentApi<PermissionContentApi>();
  const result = await requireBridgeMethod(api.listRegularSubmissionPermissions)(input);
  if (result.ok === false)
    throw ipcError(result.error, "无法读取文章投稿状态，请重试。");
  if (result.data === undefined || result.data === null)
    throw ipcError(undefined, "无法读取文章投稿状态，请重试。");
  return result.data;
}

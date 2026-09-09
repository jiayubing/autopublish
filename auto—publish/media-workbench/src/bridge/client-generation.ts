import type {
  ClientGenerationOperation,
  StartClientGenerationInput,
} from "../types/client-generation";
import { ipcError, requireContentApi, requireDisposer } from "./transport";

type SafeIpcError = {
  code?: string;
  category?:
    | "validation"
    | "authentication"
    | "transport"
    | "remote"
    | "storage"
    | "conflict"
    | "internal";
  retryability?: "never" | "safe" | "manual-check";
  userMessage?: string;
  diagnosticId?: string;
};
type IpcResponse<T> =
  { ok: true; data?: T } | { ok: false; error?: SafeIpcError };
type ClientGenerationApi = {
  startClientGeneration: (
    input: StartClientGenerationInput,
  ) => Promise<IpcResponse<{ operation: ClientGenerationOperation }>>;
  getClientGenerationState: (
    clientId: string,
  ) => Promise<IpcResponse<{ operation: ClientGenerationOperation | null }>>;
  retryClientGeneration: (
    operationId: string,
  ) => Promise<IpcResponse<{ operation: ClientGenerationOperation }>>;
  onClientGenerationState: (
    listener: (operation: ClientGenerationOperation) => void,
  ) => unknown;
};

function api(): ClientGenerationApi {
  return requireContentApi<ClientGenerationApi>();
}

async function unwrap<T>(
  promise: Promise<IpcResponse<T>>,
  fallback: string,
): Promise<T> {
  const result = await promise;
  if (result.ok === false) throw ipcError(result.error, fallback);
  if (result.data === undefined) throw ipcError(undefined, fallback);
  return result.data;
}

export async function startClientGeneration(
  input: StartClientGenerationInput,
): Promise<ClientGenerationOperation> {
  return (
    await unwrap(api().startClientGeneration(input), "无法启动客户生成任务")
  ).operation;
}

export async function getClientGenerationState(
  clientId: string,
): Promise<ClientGenerationOperation | null> {
  return (
    await unwrap(
      api().getClientGenerationState(clientId),
      "无法读取客户生成进度",
    )
  ).operation;
}

export async function retryClientGeneration(
  operationId: string,
): Promise<ClientGenerationOperation> {
  return (
    await unwrap(
      api().retryClientGeneration(operationId),
      "无法重试客户生成任务",
    )
  ).operation;
}

export function subscribeClientGeneration(
  listener: (operation: ClientGenerationOperation) => void,
): () => void {
  return requireDisposer(
    api().onClientGenerationState(listener),
    "无法订阅客户生成进度",
  );
}

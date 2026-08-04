export interface IpcError {
  code: string;
  category:
    | "validation"
    | "authentication"
    | "transport"
    | "remote"
    | "storage"
    | "conflict"
    | "internal";
  retryability: "never" | "safe" | "manual-check";
  userMessage: string;
  diagnosticId?: string;
}

export type IpcResponse<T> =
  | { ok: true; data?: T; error?: never }
  | { ok: false; data?: never; error: IpcError };

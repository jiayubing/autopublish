export type PublicationTargetDto =
  | { kind: "platform"; platformId: string; accountProfileId: string }
  | { kind: "media"; mediaResourceId: string }
  | {
      kind: "legacy-unknown-account";
      platformId: string;
      autoExecutable: false;
    };

export type SafeOperationalErrorDto = {
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
};

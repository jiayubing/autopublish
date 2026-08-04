export interface AuthState {
  authenticated: boolean;
  user: {
    id?: string;
    loginName: string;
    role?: "admin" | "user";
    enabled?: boolean;
    mustChangePassword?: boolean;
  } | null;
  entitlements: Array<{
    product: string;
    enabled: boolean;
    expiresAt?: string | null;
  }>;
  device?: {
    displayName?: string | null;
    registered?: boolean;
    deviceCount?: number;
    maxDevices?: number;
  } | null;
  errorCode?: string | null;
  sessionStatus?: "signed_out" | "authenticated" | "recovering";
  passwordChangeRequired?: boolean;
  pendingLoginName?: string | null;
}

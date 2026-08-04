export type AiProviderSource = "application" | "environment";

export interface AiProviderTestResult {
  testedAt: string;
  ok: boolean;
  code: string;
}

export interface AiProviderStatus {
  source: AiProviderSource;
  configured: boolean;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  hasApiKey: boolean;
  apiKeyMask: string;
  lastTest: AiProviderTestResult | null;
}

export interface AiProviderConfigInput {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface AiProviderClearResult {
  cleared: boolean;
}

export type PlatformProviderSource = "application" | "environment";
export interface PlatformProviderTestResult {
  testedAt: string;
  ok: boolean;
  code: string;
}
export interface MediaProviderStatus {
  source: PlatformProviderSource;
  configured: boolean;
  baseUrl: string;
  timeoutMs: number;
  allowInsecure: boolean;
  transport: string;
  apiKeyMask: string;
  thirdPartyId?: string;
  lastTest: PlatformProviderTestResult | null;
}
export interface HepanProviderStatus {
  source: PlatformProviderSource;
  configured: boolean;
  pythonConfigured: boolean;
  cookieConfigured: boolean;
  categoryId: number;
  vendorConfigured: boolean;
  bundledVendorAvailable?: boolean;
  siteOrigin: string;
  publishIntervalSeconds: number;
  lastTest:
    | (PlatformProviderTestResult & {
        authenticated?: boolean;
        publishAccess?: boolean;
        uploadContext?: "available" | "changed" | "not_checked";
        stage?:
          | "authentication"
          | "publish_access"
          | "upload_context"
          | "dependency"
          | string;
        warnings?: string[];
        account?: { displayName: string; uid: string };
      })
    | null;
}
export type PlatformProviderStatus = MediaProviderStatus | HepanProviderStatus;
export interface LegacyProviderSettingsDiscovery {
  media: { available: boolean; sources: string[] };
  hepan: {
    available: boolean;
    sources: string[];
    cookiePathAvailable: boolean;
  };
  sources: string[];
  importable: boolean;
}
export interface LegacyProviderSettingsRecord {
  version: 1;
  updatedAt: string | null;
  entries: Array<{
    platform: string;
    source: string;
    status: string;
    code: string | null;
  }>;
}
export interface LegacyProviderSettingsStatus {
  discover: LegacyProviderSettingsDiscovery;
  record: LegacyProviderSettingsRecord | null;
}

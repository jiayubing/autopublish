import type {
  ArticleAttentionItem,
  ArticleAttentionList,
  ArticleAttentionPreview,
  ArticleAttentionResolution,
} from "../types/publication";
import type {
  PublicationTargetDto,
  SafeOperationalErrorDto,
} from "../contracts/phase-01-domain";
import {
  ipcError,
  requireBridgeMethod,
  requireContentApi,
  requirePublicationApi,
} from "./transport";

export type { PublicationTargetDto, SafeOperationalErrorDto };

type PublicationIpcResponse<T> = {
  ok: boolean;
  data?: T;
  error?: SafeOperationalErrorDto;
};
type PublicationApi = {
  prepareRegularUncertainResolution?: (input: {
    regularPublicationAttemptId: string;
  }) => Promise<PublicationIpcResponse<RegularUncertainPreparation>>;
  confirmRegularAccepted?: (
    input: RegularAcceptedInput,
  ) => Promise<PublicationIpcResponse<RegularResolutionResult>>;
  confirmRegularNotAccepted?: (
    input: RegularNotAcceptedInput,
  ) => Promise<PublicationIpcResponse<RegularResolutionResult>>;
};
export type RegularUncertainPreparation = {
  regularPublicationAttemptId: string;
  confirmationToken: string;
  expiresAt: string;
  actions: Array<"confirm_accepted" | "confirm_not_accepted">;
  observationFingerprint: string;
  preparedEvidenceFingerprint: string;
};
type RegularAcceptedInput = {
  regularPublicationAttemptId: string;
  confirmationToken: string;
  manualPositiveEvidence: { observedAt: string; remoteUrl?: string };
  confirmed: true;
};
type RegularNotAcceptedInput = {
  regularPublicationAttemptId: string;
  confirmationToken: string;
  manualNegativeEvidence: { reasonCode: string; observedAt: string };
  confirmed: true;
};
export type RegularResolutionResult = {
  attemptId: string;
  status: "published" | "not_accepted";
  idempotent?: boolean;
  firstWins?: boolean;
};
type AttentionContentApi = {
  listArticleAttention?: (input?: {
    clientId: string;
  }) => Promise<PublicationIpcResponse<ArticleAttentionList>>;
  previewArticleAttention?: (input: {
    attentionId: string;
    action: string;
  }) => Promise<PublicationIpcResponse<ArticleAttentionPreview>>;
  resolveArticleAttention?: (input: {
    attentionId: string;
    action: string;
    expectedRevision: number;
    confirmed?: boolean;
  }) => Promise<PublicationIpcResponse<ArticleAttentionResolution>>;
};

function publicationApi(): PublicationApi {
  return requirePublicationApi<PublicationApi>();
}

function attentionContentApi(): AttentionContentApi {
  return requireContentApi<AttentionContentApi>();
}

function publicationError(
  error: SafeOperationalErrorDto | undefined,
  fallback: string,
): Error & { code?: string } {
  return ipcError(error, fallback);
}

export async function prepareRegularUncertainResolution(input: {
  regularPublicationAttemptId: string;
}): Promise<RegularUncertainPreparation> {
  const result = await requireBridgeMethod(
    publicationApi().prepareRegularUncertainResolution,
  )(input);
  if (!result.ok || !result.data)
    throw publicationError(
      result.error,
      "Unable to prepare regular outcome resolution",
    );
  return result.data;
}

export async function confirmRegularAccepted(input: {
  regularPublicationAttemptId: string;
  confirmationToken: string;
  manualPositiveEvidence: { observedAt: string; remoteUrl?: string };
}): Promise<RegularResolutionResult> {
  const result = await requireBridgeMethod(
    publicationApi().confirmRegularAccepted,
  )({ ...input, confirmed: true });
  if (!result.ok || !result.data)
    throw publicationError(
      result.error,
      "Unable to confirm regular acceptance",
    );
  return result.data;
}

export async function confirmRegularNotAccepted(input: {
  regularPublicationAttemptId: string;
  confirmationToken: string;
  manualNegativeEvidence: { reasonCode: string; observedAt: string };
}): Promise<RegularResolutionResult> {
  const result = await requireBridgeMethod(
    publicationApi().confirmRegularNotAccepted,
  )({ ...input, confirmed: true });
  if (!result.ok || !result.data)
    throw publicationError(result.error, "Unable to confirm regular rejection");
  return result.data;
}
export async function listArticleAttentionSnapshot(
  clientId?: string,
): Promise<ArticleAttentionList> {
  const content = attentionContentApi();
  const result = await requireBridgeMethod(content.listArticleAttention)(
    clientId ? { clientId } : undefined,
  );
  if (!result.ok || !result.data)
    throw ipcError(result.error, "listArticleAttention failed");
  return result.data;
}
export async function listArticleAttention(
  clientId?: string,
): Promise<ArticleAttentionItem[]> {
  return (await listArticleAttentionSnapshot(clientId)).items;
}
export async function previewArticleAttention(input: {
  attentionId: string;
  action: string;
}): Promise<ArticleAttentionPreview> {
  const content = attentionContentApi();
  const result = await requireBridgeMethod(content.previewArticleAttention)(
    input,
  );
  if (!result.ok || !result.data)
    throw ipcError(result.error, "previewArticleAttention failed");
  return result.data;
}
export async function resolveArticleAttention(input: {
  attentionId: string;
  action: string;
  expectedRevision: number;
  confirmed?: boolean;
}): Promise<ArticleAttentionResolution> {
  const content = attentionContentApi();
  const result = await requireBridgeMethod(content.resolveArticleAttention)(
    input,
  );
  if (!result.ok || !result.data)
    throw ipcError(result.error, "resolveArticleAttention failed");
  return result.data;
}

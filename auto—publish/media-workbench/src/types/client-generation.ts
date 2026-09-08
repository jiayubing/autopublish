export type ClientGenerationTaskStatus = "pending" | "running" | "succeeded" | "failed";
export type ClientGenerationOperationStatus = "running" | "completed" | "partial" | "failed";

export interface ClientGenerationCounts {
  total: number;
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
}

export interface ClientGenerationTask {
  index: number;
  status: ClientGenerationTaskStatus;
  attempts: number;
  articleId: string | null;
  articleTitle: string | null;
  error: { code: string; message: string } | null;
}

export interface ClientGenerationOperation {
  operationId: string;
  clientId: string;
  articleCount: number;
  concurrency: number;
  status: ClientGenerationOperationStatus;
  counts: ClientGenerationCounts;
  tasks: ClientGenerationTask[];
  createdAt: string;
  updatedAt: string;
}

export interface StartClientGenerationInput {
  clientId: string;
  materialIds: string[];
  researchQueryIds: string[];
  platform: string;
  templateId: string;
  articleCount: number;
  concurrency: number;
  templateCatalogRevision?: string;
  generationOperationId?: string;
}

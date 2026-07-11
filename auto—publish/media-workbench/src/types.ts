export type MediaType = 'image' | 'video' | 'audio' | 'document';

export interface IpcError {
  code: string;
  message: string;
}

export type IpcResponse<T> =
  | { ok: true; data?: T; error?: never }
  | { ok: false; data?: never; error: IpcError };

export interface MediaResource {
  resourceId: string;
  name: string;
  price: number;
  type: MediaType;
  url?: string;
  duration?: string;
  resolution?: string;
  size?: string;
  createdAt: string;
}

export interface Article {
  filename: string;
  title: string;
  content: string;
  words: number;
  tags: string[];
  selectedResources: MediaResource[];
  lastModified: string;
  // IPC fields from scanArticles service
  filePath: string;
  autoTitle: string;
  remark: string;
  hasImages: boolean;
  imageCount: number;
  ignoreImages: boolean;
}

export interface Draft {
  filename: string;
  title: string;
  remark: string;
  ignoreImages: boolean;
  selectedResources: MediaResource[];
}

export type OrderStatus = 'success' | 'pending' | 'failed' | 'partial';

export interface OrderPlatform {
  name: string;
  status: 'success' | 'failed' | 'pending';
  error?: string;
}

// SubmissionOrder: used for preflight/UI flow (legacy mock shape)
export interface SubmissionOrder {
  id: string;
  articleTitle: string;
  filename: string;
  platforms: OrderPlatform[];
  totalFee: number;
  mediaCount: number;
  createdAt: string;
  status: OrderStatus;
  logs: string[];
}

// RealOrder: matches the real order view shape from media-order-service.js
export interface RealOrder {
  title: string;
  filename: string;
  orderNid: string;
  statusCode: string;
  statusLabel: string;
  submittedAt: string;
  publishedAt: string;
  resourceId: string;
  resourceName: string;
  price: string;
  orderUrl: string;
}

// Backward-compatible alias for PreflightModal and mockData
export type Order = SubmissionOrder;

export type ViewMode = 'workbench' | 'resources' | 'orders' | 'settings' | 'platforms' | 'content';

export interface ContentClient { id: string; name: string; searchQuery?: string; knowledgeFiles: Array<{ name: string; content: string }>; }
export interface ContentResearch { id: string; clientId: string; question?: string; answerText?: string; references: Array<{ title: string; url: string; snippet?: string }>; createdAt?: string; isAnswerComplete?: boolean; }
export interface ContentTemplate { id: string; platform: string; scenario: string; name: string; body: string; }
export interface GeneratedContentArticle {
  id: string; clientId: string; researchQueryId: string; platform: string; scenario: string; templateId: string;
  title: string; content: string; status: string; source: { client_material: boolean; doubao_answer: boolean; references: boolean; template: boolean }; createdAt: string; updatedAt?: string;
}

export interface PlatformArticle {
  filename: string;
  filePath: string;
  title: string;
  platformId: string;
  sourcePlatformId: string;
}

export interface PlatformTarget {
  id: string;
  displayName: string;
  scanDir: string;
}

export interface PlatformStatus {
  isPlatformRunning: boolean;
}

export interface PlatformSubmitPlan {
  taskCount: number;
  tasks: PlatformSubmitTask[];
}

export interface PlatformSubmitTask {
  sourcePlatformId: string;
  filename: string;
  filePath: string;
  targetPlatformId: string;
}

export interface PlatformSubmitResult {
  ok: number;
  fail: number;
  skipped: number;
  results: PlatformTaskResult[];
}

export interface PlatformTaskResult {
  task: PlatformSubmitTask;
  status: 'success' | 'failed' | 'pending';
  error?: string;
}

export type MediaType = 'image' | 'video' | 'audio' | 'document';

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

export type ViewMode = 'workbench' | 'resources' | 'orders' | 'settings' | 'platforms';

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

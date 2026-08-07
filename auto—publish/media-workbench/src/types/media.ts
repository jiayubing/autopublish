export type MediaType = "image" | "video" | "audio" | "document";

export interface MediaResource {
  resourceId: string;
  name: string;
  price: number | null;
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

export type OrderStatus = "success" | "pending" | "failed" | "partial";

export interface OrderPlatform {
  name: string;
  status: "success" | "failed" | "pending";
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
  orderNid: string;
  statusCode: string;
  createdAt: string;
  submittedAt: string;
  publishedAt: string;
  resourceName: string;
  price: string;
  actualAmount: string;
  hasPublishedUrl: boolean;
  anomaly: {
    reason: "order-missing" | "unknown-status" | "unsettled-aftercare";
    openedAt: string;
  } | null;
}

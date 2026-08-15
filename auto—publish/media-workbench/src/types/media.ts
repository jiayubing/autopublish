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
  cancellation: {
    orderId: string;
    state: "none" | "open" | "resolved";
    cancellationAttemptId: string | null;
    outcome: "cancelled" | "rejected" | null;
    actionLabel: "取消订单" | "尝试取消" | null;
    riskCode: "CANCELLATION_MAY_BE_REJECTED" | null;
    manualResolutionRequired: boolean;
  } | null;
}

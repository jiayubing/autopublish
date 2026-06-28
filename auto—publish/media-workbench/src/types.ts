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

export interface Order {
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

export type ViewMode = 'workbench' | 'resources' | 'orders' | 'settings';

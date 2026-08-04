import type { PlatformQueueSnapshot } from './types/platform';

export interface NavigationSummary {
  platformQueue: {
    count: number;
    attentionCount: number;
    hidden: boolean;
    label: string;
  };
  contentArticles: { count: number; hidden: boolean };
  orders: { count: number; hidden: boolean };
}

export function deriveNavigationSummary(input: {
  platformQueue: PlatformQueueSnapshot;
  contentArticles?: number;
  orders?: number;
}): NavigationSummary {
  const contentArticles = Math.max(0, input.contentArticles || 0);
  const orders = Math.max(0, input.orders || 0);
  const count = input.platformQueue.counts.actionable;
  return {
    platformQueue: {
      count,
      attentionCount: input.platformQueue.counts.attention,
      hidden: count === 0,
      label: '可操作投稿队列文件数',
    },
    contentArticles: { count: contentArticles, hidden: contentArticles === 0 },
    orders: { count: orders, hidden: orders === 0 },
  };
}


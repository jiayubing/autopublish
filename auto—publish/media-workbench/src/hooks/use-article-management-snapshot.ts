import { useCallback, useEffect, useState } from 'react';
import { getArticleManagementSnapshot } from '../bridge/content';
import type { ArticleManagementSnapshot } from '../types';
import { useRequestIdentity } from './use-request-identity';

export function useArticleManagementSnapshot(clientId: string, refreshToken: number, onSnapshot?: (snapshot: ArticleManagementSnapshot) => void) {
  const [snapshot, setSnapshot] = useState<ArticleManagementSnapshot | null>(null);
  const [error, setError] = useState('');
  const beginRequest = useRequestIdentity(clientId);
  const refresh = useCallback(async () => {
    if (!clientId) { setSnapshot(null); return null; }
    const isCurrent = beginRequest();
    try {
      const next = await getArticleManagementSnapshot(clientId);
      if (isCurrent()) { setSnapshot(next); setError(''); onSnapshot?.(next); return next; }
    } catch (value) { if (isCurrent()) setError(value instanceof Error ? value.message : '无法加载历史文章'); }
    return null;
  }, [beginRequest, clientId, onSnapshot]);
  useEffect(() => { void refresh(); }, [refresh, refreshToken]);
  return { snapshot, error, refresh, setSnapshot };
}

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { listArticleAttentionSnapshot, previewArticleAttention, resolveArticleAttention } from '../../bridge/publication';
import { useWorkspaceScope } from '../workspace/workspace-coordinator-context';
import { createAttentionFeature } from './attention-feature.js';
import type { ArticleAttentionList } from '../../types/publication';

type ScopedAttentionSource = ArticleAttentionList & { clientId: string };

export function useAttentionFeature(clientId: string, source?: ScopedAttentionSource) {
  const clientIdRef = useRef(clientId);
  clientIdRef.current = clientId;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const featureRef = useRef<ReturnType<typeof createAttentionFeature> | null>(null);
  if (!featureRef.current) {
    featureRef.current = createAttentionFeature({
      list: listArticleAttentionSnapshot,
      preview: previewArticleAttention,
      execute: resolveArticleAttention,
    });
  }
  const feature = featureRef.current;

  useEffect(() => {
    const currentScope = feature.getSnapshot().scope;
    if (!currentScope?.workspaceRuntimeId || !clientId || currentScope.clientId === clientId) return;
    feature.setScope({ workspaceRuntimeId: currentScope.workspaceRuntimeId, clientId });
    if (sourceRef.current?.clientId === clientId)
      feature.replaceSnapshot(sourceRef.current, 'scope-change');
    else if (!sourceRef.current)
      void feature.refresh('scope-change');
  }, [clientId, feature]);

  useEffect(() => {
    if (source?.clientId === clientId && feature.getSnapshot().scope?.clientId === clientId)
      feature.replaceSnapshot(source, 'submission-center-snapshot');
  }, [clientId, feature, source?.clientId, source?.items, source?.revision]);

  useWorkspaceScope('articleAttention', (event) => {
    if (!event.workspaceRuntimeId || !clientIdRef.current) return;
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId, clientId: clientIdRef.current });
    if (sourceRef.current?.clientId === clientIdRef.current)
      feature.replaceSnapshot(sourceRef.current, event.kind);
    else if (!sourceRef.current)
      void feature.refresh(event.kind);
  });

  useEffect(() => () => feature.dispose(), [feature]);
  return {
    snapshot: useSyncExternalStore(feature.subscribe, feature.getSnapshot, feature.getSnapshot),
    feature,
  };
}

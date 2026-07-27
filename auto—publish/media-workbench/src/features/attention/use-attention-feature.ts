import { useEffect, useRef, useSyncExternalStore } from 'react';
import { listArticleAttentionSnapshot, previewArticleAttention, resolveArticleAttention } from '../../bridge/publication';
import { useWorkspaceScope } from '../workspace/workspace-coordinator-context';
import { createAttentionFeature } from './attention-feature.js';

export function useAttentionFeature(clientId: string) {
  const clientIdRef = useRef(clientId);
  clientIdRef.current = clientId;
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
    void feature.refresh('scope-change');
  }, [clientId, feature]);

  useWorkspaceScope('articleAttention', (event) => {
    if (!event.workspaceRuntimeId || !clientIdRef.current) return;
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId, clientId: clientIdRef.current });
    void feature.refresh(event.kind);
  });

  useEffect(() => () => feature.dispose(), [feature]);
  return {
    snapshot: useSyncExternalStore(feature.subscribe, feature.getSnapshot, feature.getSnapshot),
    feature,
  };
}

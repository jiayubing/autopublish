import { useEffect, useRef, useSyncExternalStore } from 'react';
import { generateContentArticle } from '../../bridge/generation';
import type { GeneratedContentArticle } from '../../types/generation';
import { createContentGenerationFeature } from './content-generation-feature.js';
import { useWorkspaceRuntimeIdentity } from '../workspace/workspace-coordinator-context';

export function useContentGenerationFeature(options: {
  clientId: string;
  commit: (article: GeneratedContentArticle) => void;
  refreshCurrent: () => void | Promise<void>;
}) {
  const workspace = useWorkspaceRuntimeIdentity();
  const callbacks = useRef(options);
  callbacks.current = options;
  const featureRef = useRef<ReturnType<typeof createContentGenerationFeature> | null>(null);
  if (!featureRef.current) {
    featureRef.current = createContentGenerationFeature({
      generate: generateContentArticle,
      commit: (article: GeneratedContentArticle) => callbacks.current.commit(article),
      refreshCurrent: () => callbacks.current.refreshCurrent(),
    });
  }
  const feature = featureRef.current;
  useEffect(() => {
    if (workspace.workspaceRuntimeId) {
      feature.setScope({ workspaceRuntimeId: workspace.workspaceRuntimeId, clientId: options.clientId || 'none' });
    }
  }, [feature, options.clientId, workspace.workspaceRuntimeId]);
  useEffect(() => () => feature.dispose(), [feature]);
  const snapshot = useSyncExternalStore(feature.subscribe, feature.getSnapshot, feature.getSnapshot);
  return { snapshot, generate: feature.generate };
}

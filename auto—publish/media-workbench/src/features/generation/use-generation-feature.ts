import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  continueGenerationBatch,
  cancelPendingGenerationBatch,
  createAndStartGenerationBatch,
  getGenerationRuntimeSnapshot,
  pauseGenerationBatch,
  resumeGenerationBatch,
  retryFailedGenerationBatch,
  previewCancelPendingGenerationBatch,
  previewGenerationBatch,
  listContentSubmissionPlatforms,
  previewGenerationSubmissionHandoff,
  commitGenerationSubmissionHandoff,
  stopGenerationBatch,
  subscribeGenerationBatchState,
} from '../../bridge/generation';
import { useWorkspaceRuntimeIdentity } from '../workspace/workspace-coordinator-context';
import { createGenerationFeature } from './generation-feature.js';

export function useGenerationFeature() {
  const workspace = useWorkspaceRuntimeIdentity();
  const featureRef = useRef<ReturnType<typeof createGenerationFeature> | null>(null);
  if (!featureRef.current) {
    featureRef.current = createGenerationFeature({
      start: createAndStartGenerationBatch,
      previewBatch: previewGenerationBatch,
      pause: pauseGenerationBatch,
      resume: resumeGenerationBatch,
      stop: stopGenerationBatch,
      continue: continueGenerationBatch,
      retry: retryFailedGenerationBatch,
      previewCancelPending: previewCancelPendingGenerationBatch,
      cancelPending: cancelPendingGenerationBatch,
      listSubmissionPlatforms: listContentSubmissionPlatforms,
      previewSubmissionHandoff: previewGenerationSubmissionHandoff,
      commitSubmissionHandoff: commitGenerationSubmissionHandoff,
      hydrate: getGenerationRuntimeSnapshot,
      subscribeRuntime: subscribeGenerationBatchState,
    });
  }
  const feature = featureRef.current;
  useEffect(() => {
    if (workspace.workspaceRuntimeId) {
      feature.setScope({ workspaceRuntimeId: workspace.workspaceRuntimeId, batchId: 'current' });
      void feature.hydrate('initial').catch(() => undefined);
    }
  }, [feature, workspace.workspaceRuntimeId]);
  useEffect(() => () => feature.dispose(), [feature]);
  const snapshot = useSyncExternalStore(feature.subscribe, feature.getSnapshot, feature.getSnapshot);
  return {
    snapshot,
    start: feature.start,
    previewBatch: feature.previewBatch,
    pause: feature.pause,
    resume: feature.resume,
    stop: feature.stop,
    continue: feature.continue,
    retry: feature.retry,
    previewCancelPending: feature.previewCancelPending,
    cancelPending: feature.cancelPending,
    listSubmissionPlatforms: feature.listSubmissionPlatforms,
    previewSubmissionHandoff: feature.previewSubmissionHandoff,
    commitSubmissionHandoff: feature.commitSubmissionHandoff,
  };
}

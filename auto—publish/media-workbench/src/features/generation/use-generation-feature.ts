import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  cancelPendingGenerationBatch,
  checkUncertainGenerationBatchV2,
  createAndStartGenerationBatchV2,
  getGenerationRuntimeSnapshot,
  pauseGenerationBatch,
  resumeGenerationBatch,
  retryFailedGenerationBatch,
  previewCancelPendingGenerationBatch,
  previewGenerationBatch,
  abandonGenerationBatch,
  subscribeGenerationBatchState,
} from '../../bridge/generation';
import { useWorkspaceRuntimeIdentity } from '../workspace/workspace-coordinator-context';
import { createGenerationFeature } from './generation-feature.js';
import { reportRuntimeDiagnostic } from '../workspace/runtime-diagnostic-sink';

export function useGenerationFeature(enabled = true) {
  const workspace = useWorkspaceRuntimeIdentity();
  const featureRef = useRef<ReturnType<typeof createGenerationFeature> | null>(null);
  if (!featureRef.current) {
    featureRef.current = createGenerationFeature({
      start: createAndStartGenerationBatchV2,
      checkUncertain: checkUncertainGenerationBatchV2,
      previewBatch: previewGenerationBatch,
      pause: pauseGenerationBatch,
      resume: resumeGenerationBatch,
      abandon: abandonGenerationBatch,
      retry: retryFailedGenerationBatch,
      previewCancelPending: previewCancelPendingGenerationBatch,
      cancelPending: cancelPendingGenerationBatch,
      hydrate: getGenerationRuntimeSnapshot,
      subscribeRuntime: subscribeGenerationBatchState,
      reportDiagnostic: (code: string) => reportRuntimeDiagnostic(code, 'workspace-invalidation'),
    });
  }
  const feature = featureRef.current;
  useEffect(() => {
    if (enabled && workspace.workspaceRuntimeId) {
      feature.setScope({ workspaceRuntimeId: workspace.workspaceRuntimeId, batchId: 'current' });
      void feature.hydrate('initial').catch(() => {
        reportRuntimeDiagnostic('GENERATION_RUNTIME_HYDRATION_FAILED', 'workspace-invalidation');
      });
    }
  }, [feature, workspace.workspaceRuntimeId, enabled]);
  useEffect(() => () => feature.dispose(), [feature]);
  const snapshot = useSyncExternalStore(feature.subscribe, feature.getSnapshot, feature.getSnapshot);
  return {
    snapshot,
    start: feature.start,
    checkUncertain: feature.checkUncertain,
    refresh: feature.hydrate,
    previewBatch: feature.previewBatch,
    pause: feature.pause,
    resume: feature.resume,
    abandon: feature.abandon,
    retry: feature.retry,
    previewCancelPending: feature.previewCancelPending,
    cancelPending: feature.cancelPending,
  };
}

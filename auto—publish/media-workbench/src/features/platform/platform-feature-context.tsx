import { createContext, useContext, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import {
  checkPlatformLogin,
  getPlatformDisplayName,
  getPlatformQueue,
  openPlatformLogin,
} from '../../bridge/platform';
import {
  cleanupTrashedArticleQueueResidue,
  previewTrashedArticleQueueResidue,
} from '../../bridge/content-removal';
import { useWorkspaceScope } from '../workspace/workspace-coordinator-context';
import { reportRuntimeDiagnostic } from '../workspace/runtime-diagnostic-sink';
import { confirmAccountProfile, listAccountProfiles } from '../../bridge/account-profile';
import {
  listRegularQueueGroups,
  removePendingQueueItems,
  pauseAllRegularQueueGroups,
  pauseRegularQueueGroup,
  startAllRegularQueueGroups,
  startRegularQueueGroup,
} from '../../bridge/content';
import { createPlatformFeature } from './platform-feature.js';

type PlatformFeature = ReturnType<typeof createPlatformFeature>;

const PlatformFeatureContext = createContext<PlatformFeature | null>(null);

function createProductionPlatformFeature(): PlatformFeature {
  return createPlatformFeature({
    platformDisplayName: getPlatformDisplayName,
    loadQueue: (_reason: string) => getPlatformQueue(),
    previewResidue: previewTrashedArticleQueueResidue,
    cleanupResidue: cleanupTrashedArticleQueueResidue,
    openLogin: openPlatformLogin,
    checkLogin: checkPlatformLogin,
    listAccountProfiles,
    confirmAccountProfile,
    listRegularQueueGroups,
    removePendingQueueItems,
    startRegularQueueGroup,
    pauseRegularQueueGroup,
    startAllRegularQueueGroups,
    pauseAllRegularQueueGroups,
    reportDiagnostic: (code: string) => reportRuntimeDiagnostic(code, 'platform-event'),
  });
}

export function PlatformFeatureProvider({ children }: { children: ReactNode }) {
  const featureRef = useRef<PlatformFeature | null>(null);
  if (!featureRef.current) featureRef.current = createProductionPlatformFeature();
  const feature = featureRef.current;

  useWorkspaceScope('platformQueue', (event) => {
    if (!event.workspaceRuntimeId) return;
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId });
    void feature.refreshQueue(event.kind).catch(() => {
      reportRuntimeDiagnostic('PLATFORM_QUEUE_REFRESH_FAILED', 'platform-event');
    });
    void feature.refreshAccountProfiles(event.kind).catch(() => {
      reportRuntimeDiagnostic('PLATFORM_ACCOUNT_PROFILE_REFRESH_FAILED', 'platform-event');
    });
    void feature.refreshRegularQueueGroups(event.kind).catch(() => {
      reportRuntimeDiagnostic('PLATFORM_REGULAR_GROUP_REFRESH_FAILED', 'platform-event');
    });
  });

  return <PlatformFeatureContext.Provider value={feature}>{children}</PlatformFeatureContext.Provider>;
}

export function usePlatformFeature() {
  const feature = useContext(PlatformFeatureContext);
  if (!feature) throw new Error('PlatformFeatureProvider is required');
  const snapshot = useSyncExternalStore(feature.subscribe, feature.getSnapshot, feature.getSnapshot);
  return { snapshot, feature };
}

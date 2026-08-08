import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import {
  checkPlatformLogin,
  getPlatformDisplayName,
  getPlatformQueue,
  getPlatformState,
  onPlatformState,
  onPlatformStateDiagnostic,
  openPlatformLogin,
  pausePlatformSubmit,
  stopPlatformSubmit,
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
  pauseAllRegularQueueGroups,
  pauseRegularQueueGroup,
  startAllRegularQueueGroups,
  startRegularQueueGroup,
} from '../../bridge/content';
import { createPlatformFeature } from './platform-feature.js';
import { routePlatformTransportEvent } from './platform-event-router.js';

type PlatformFeature = ReturnType<typeof createPlatformFeature>;

const PlatformFeatureContext = createContext<PlatformFeature | null>(null);

function createProductionPlatformFeature(): PlatformFeature {
  return createPlatformFeature({
    platformDisplayName: getPlatformDisplayName,
    loadQueue: (_reason: string) => getPlatformQueue(),
    getRunState: getPlatformState,
    onRunState: (listener) => onPlatformState((state) =>
      routePlatformTransportEvent(state, listener, reportRuntimeDiagnostic)),
    pause: pausePlatformSubmit,
    stop: stopPlatformSubmit,
    previewResidue: previewTrashedArticleQueueResidue,
    cleanupResidue: cleanupTrashedArticleQueueResidue,
    openLogin: openPlatformLogin,
    checkLogin: checkPlatformLogin,
    listAccountProfiles,
    confirmAccountProfile,
    listRegularQueueGroups,
    startRegularQueueGroup,
    pauseRegularQueueGroup,
    startAllRegularQueueGroups,
    pauseAllRegularQueueGroups,
  });
}

export function PlatformFeatureProvider({ children }: { children: ReactNode }) {
  const featureRef = useRef<PlatformFeature | null>(null);
  if (!featureRef.current) featureRef.current = createProductionPlatformFeature();
  const feature = featureRef.current;

  useWorkspaceScope('platformQueue', (event) => {
    if (!event.workspaceRuntimeId) return;
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId });
    void feature.refreshQueue(event.kind).catch(() => undefined);
    void feature.refreshAccountProfiles(event.kind).catch(() => undefined);
    void feature.refreshRegularQueueGroups(event.kind).catch(() => undefined);
  });

  useEffect(() => {
    const disposeDiagnostic = onPlatformStateDiagnostic(() =>
      reportRuntimeDiagnostic('PLATFORM_EVENT_TRANSPORT_REJECTED', 'platform-event'));
    void feature.start();
    return () => { disposeDiagnostic(); feature.stopTransport(); };
  }, [feature]);

  return <PlatformFeatureContext.Provider value={feature}>{children}</PlatformFeatureContext.Provider>;
}

export function usePlatformFeature() {
  const feature = useContext(PlatformFeatureContext);
  if (!feature) throw new Error('PlatformFeatureProvider is required');
  const snapshot = useSyncExternalStore(feature.subscribe, feature.getSnapshot, feature.getSnapshot);
  return { snapshot, feature };
}

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  clearAiProviderConfig,
  clearPlatformSettings,
  cleanStorageCaches,
  getAiProviderStatus,
  getLegacyPlatformSettingsStatus,
  getPlatformSettingsStatus,
  getStorageUsage,
  importLegacyPlatformSettings,
  saveAiProviderConfig,
  savePlatformSettings,
  testAiProviderConnection,
  testPlatformSettings,
} from "../../bridge/settings";
import {
  getRuntimeDiagnostics,
  runBrowserSelfCheck,
} from "../../bridge/workspace";
import type { HepanProviderStatus, MediaProviderStatus } from "../../types";
import { createSettingsFeature } from "./settings-feature.js";

function createProductionSettingsFeature() {
  return createSettingsFeature({
    getAiStatus: getAiProviderStatus,
    saveAi: saveAiProviderConfig,
    testAi: testAiProviderConnection,
    clearAi: clearAiProviderConfig,
    getMediaStatus: () =>
      getPlatformSettingsStatus<MediaProviderStatus>("media"),
    saveMedia: (draft: Record<string, unknown>) =>
      savePlatformSettings("media", draft),
    testMedia: (draft: Record<string, unknown>) =>
      testPlatformSettings("media", draft),
    clearMedia: () => clearPlatformSettings("media"),
    getHepanStatus: () =>
      getPlatformSettingsStatus<HepanProviderStatus>("hepan"),
    saveHepan: (draft: Record<string, unknown>) =>
      savePlatformSettings("hepan", draft),
    testHepan: (draft: Record<string, unknown>) =>
      testPlatformSettings("hepan", draft),
    clearHepan: () => clearPlatformSettings("hepan"),
    getLegacyStatus: getLegacyPlatformSettingsStatus,
    importLegacy: importLegacyPlatformSettings,
    getRuntimeDiagnostics,
    runBrowserSelfCheck,
    getStorageUsage,
    cleanStorageCaches,
  });
}

type SettingsFeature = ReturnType<typeof createProductionSettingsFeature>;
const SettingsFeatureContext = createContext<SettingsFeature | null>(null);

export function SettingsFeatureProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const featureRef = useRef<SettingsFeature | null>(null);
  if (!featureRef.current)
    featureRef.current = createProductionSettingsFeature();
  const feature = featureRef.current;
  useEffect(() => {
    feature.setScope({ installationId: "desktop" });
    void feature.refresh("initial");
    return () => feature.dispose();
  }, [feature]);
  return (
    <SettingsFeatureContext.Provider value={feature}>
      {children}
    </SettingsFeatureContext.Provider>
  );
}

export function useSettingsFeature() {
  const feature = useContext(SettingsFeatureContext);
  if (!feature) throw new Error("SettingsFeatureProvider is missing");
  const snapshot = useSyncExternalStore(
    feature.subscribe,
    feature.getSnapshot,
    feature.getSnapshot,
  );
  return { feature, snapshot };
}

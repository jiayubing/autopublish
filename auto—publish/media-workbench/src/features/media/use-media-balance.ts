import { useEffect, useRef, useSyncExternalStore } from "react";
import { getBalance } from "../../bridge/media";
import { createMediaBalanceFeature } from "./media-balance-feature.js";

export function useMediaBalance() {
  const featureRef = useRef<ReturnType<typeof createMediaBalanceFeature> | null>(
    null,
  );
  if (!featureRef.current)
    featureRef.current = createMediaBalanceFeature({ getBalance });
  const feature = featureRef.current;
  useEffect(() => {
    void feature.refresh("workspace-ready");
    return () => feature.dispose();
  }, [feature]);
  return {
    snapshot: useSyncExternalStore(
      feature.subscribe,
      feature.getSnapshot,
      feature.getSnapshot,
    ),
    refresh: (reason = "manual") => feature.refresh(reason),
  };
}

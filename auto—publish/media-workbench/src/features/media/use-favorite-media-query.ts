import { useEffect, useRef, useSyncExternalStore } from "react";
import { getPoolPage } from "../../bridge/media";
import { useWorkspaceScope } from "../workspace/workspace-coordinator-context";
import { createFavoriteMediaQuery } from "./favorite-media-query.js";

export function useFavoriteMediaQuery() {
  const queryRef = useRef<ReturnType<typeof createFavoriteMediaQuery> | null>(
    null,
  );
  if (!queryRef.current)
    queryRef.current = createFavoriteMediaQuery({ getPoolPage });
  const query = queryRef.current;
  const effectGeneration = useRef(0);
  useWorkspaceScope("mediaWorkbench", (event) => {
    if (!event.workspaceRuntimeId) return;
    query.setScope({ workspaceRuntimeId: event.workspaceRuntimeId });
    return query.refresh();
  });
  useEffect(() => {
    const generation = ++effectGeneration.current;
    return () =>
      queueMicrotask(() => {
        if (effectGeneration.current === generation) query.dispose();
      });
  }, [query]);
  return {
    snapshot: useSyncExternalStore(
      query.subscribe,
      query.getSnapshot,
      query.getSnapshot,
    ),
    loadPage: query.loadPage,
  };
}

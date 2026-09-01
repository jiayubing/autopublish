import { createContentSourcesFeature } from './content-sources-feature.js';

// Renderer boundary for customer questions, research and generation inputs.
// Downstream submission, paid execution and article removal are intentionally
// absent from this public surface.
export function createContentProductionFeature(adapters = {}) {
  const sources = createContentSourcesFeature(adapters);
  return Object.freeze({
    getSnapshot: sources.getSnapshot,
    subscribe: sources.subscribe,
    setScope: sources.setScope,
    refresh: sources.refreshSources,
    refreshSources: sources.refreshSources,
    refreshClientData: sources.refreshClientData,
    refreshResearchIndex: sources.refreshResearchIndex,
    refreshDoubaoQueue: sources.refreshDoubaoQueue,
    selectClient: sources.selectClient,
    setCurrentArticle: sources.setCurrentArticle,
    commands: sources.commands,
    dispose: sources.dispose,
  });
}

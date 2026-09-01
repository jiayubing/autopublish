import { createArticleManagementFeature } from './article-management-feature.js';

// Article-library boundary. It owns article editing/removal projections only;
// publication admission and paid execution remain in their downstream
// feature owners.
export function createArticleLibraryFeature(adapters = {}) {
  const management = createArticleManagementFeature(adapters);
  return Object.freeze({
    getSnapshot: management.getSnapshot,
    subscribe: management.subscribe,
    setScope: management.setScope,
    refresh: management.refreshManagement,
    refreshManagement: management.refreshManagement,
    setArticleResultHandler: management.setArticleResultHandler,
    watchRemovalTransaction: management.watchRemovalTransaction,
    clearRemovalTransaction: management.clearRemovalTransaction,
    commands: management.commands,
    dispose: management.dispose,
  });
}

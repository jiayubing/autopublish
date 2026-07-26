function articleIdentity(article) {
  return article && (article.articleId || article.id || article.filename) || null;
}

function createAppDraftSaveController(options) {
  const value = options || {};
  if (
    typeof value.persistDraft !== "function" ||
    typeof value.setArticles !== "function" ||
    typeof value.setActiveArticle !== "function"
  ) {
    throw new Error("APP_DRAFT_SAVE_CONTROLLER_INVALID");
  }
  let persistDraft = value.persistDraft;

  function setPersistDraft(next) {
    if (typeof next !== "function") throw new Error("APP_DRAFT_PERSIST_INVALID");
    persistDraft = next;
  }

  function updateSavedFields(article, targetIdentity, draft) {
    if (!article || articleIdentity(article) !== targetIdentity) return article;
    return {
      ...article,
      title: draft.title,
      remark: draft.remark,
      ignoreImages: draft.ignoreImages,
      // Resource selection has its own revision while persistence is in
      // flight. Always retain the latest state supplied to the updater.
      selectedResources: article.selectedResources || [],
    };
  }

  async function saveDraft(draft, sourceArticle) {
    const targetIdentity = articleIdentity(sourceArticle);
    if (!targetIdentity || !draft || typeof draft.filename !== "string") {
      throw new Error("APP_DRAFT_SAVE_INPUT_INVALID");
    }
    await persistDraft(draft.filename, draft);
    value.setArticles((current) =>
      current.map((article) => updateSavedFields(article, targetIdentity, draft)),
    );
    value.setActiveArticle((current) =>
      updateSavedFields(current, targetIdentity, draft),
    );
  }

  function updateResources(sourceArticle, updater) {
    const targetIdentity = articleIdentity(sourceArticle);
    if (!targetIdentity) return;
    const apply = (article) => {
      if (!article || articleIdentity(article) !== targetIdentity) return article;
      return {
        ...article,
        selectedResources: updater(article.selectedResources || []),
      };
    };
    value.setArticles((current) => current.map(apply));
    value.setActiveArticle(apply);
  }

  function addResource(resource, sourceArticle) {
    updateResources(sourceArticle, (resources) =>
      resources.some((item) => item.resourceId === resource.resourceId)
        ? resources
        : [...resources, resource],
    );
  }

  function removeResource(resourceId, sourceArticle) {
    updateResources(sourceArticle, (resources) =>
      resources.filter((item) => item.resourceId !== resourceId),
    );
  }

  function toggleResource(resource, sourceArticle) {
    updateResources(sourceArticle, (resources) =>
      resources.some((item) => item.resourceId === resource.resourceId)
        ? resources.filter((item) => item.resourceId !== resource.resourceId)
        : [...resources, resource],
    );
  }

  return {
    saveDraft,
    addResource,
    removeResource,
    toggleResource,
    setPersistDraft,
  };
}

export { articleIdentity, createAppDraftSaveController };

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function articleIdentity(article) {
  return article && (article.articleId || article.id || article.filename) || null;
}

function draftFromArticle(article) {
  return {
    filename: article.filename,
    title: article.title || "",
    remark: article.remark || "",
    ignoreImages: article.ignoreImages === true,
    selectedResources: clone(article.selectedResources || [])
  };
}

function comparable(draft) {
  return { title: draft.title, remark: draft.remark, ignoreImages: draft.ignoreImages, selectedResources: draft.selectedResources };
}

function draftEquals(left, right) { return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right)); }

function createArticleEditorSession(options) {
  const value = options || {};
  if (typeof value.saveDraft !== "function") throw new Error("ARTICLE_EDITOR_SAVE_REQUIRED");
  const saveSuccessTtlMs = Number.isFinite(value.saveSuccessTtlMs) ? Math.max(0, value.saveSuccessTtlMs) : 2000;
  const listeners = new Set();
  let sessionId = 0; let disposed = false; let article = null; let draft = null; let baseline = null; let isSaving = false; let saveError = null; let saveSuccess = false; let successTimer = null;
  function emit() { listeners.forEach((listener) => { try { listener(); } catch (_) {} }); }
  function subscribe(listener) { if (typeof listener !== "function") throw new Error("ARTICLE_EDITOR_LISTENER_REQUIRED"); listeners.add(listener); return () => listeners.delete(listener); }
  function resetOutcome() { isSaving = false; saveError = null; saveSuccess = false; if (successTimer) { clearTimeout(successTimer); successTimer = null; } }
  function open(nextArticle) { disposed = false; sessionId += 1; article = nextArticle; draft = nextArticle ? draftFromArticle(nextArticle) : null; baseline = draft ? clone(draft) : null; resetOutcome(); const next = snapshot(); emit(); return next; }
  function mergeExternal(nextArticle) {
    if (!nextArticle) return open(null);
    if (!article || articleIdentity(article) !== articleIdentity(nextArticle)) return open(nextArticle);
    const external = draftFromArticle(nextArticle);
    article = nextArticle;
    if (!draft || !baseline) return open(nextArticle);
    ["title", "remark", "ignoreImages"].forEach((field) => {
      if (draft[field] === baseline[field]) {
        draft[field] = external[field];
        baseline[field] = clone(external[field]);
      }
    });
    // selectedResources is controlled by the parent resource picker. Merge it
    // into the current draft while leaving the baseline untouched so a local
    // title/remark/resource change remains visibly dirty until it is saved.
    draft.selectedResources = clone(external.selectedResources);
    const next = snapshot();
    emit();
    return next;
  }
  function update(changes) { if (!draft) return snapshot(); draft = Object.assign({}, draft, changes || {}); saveError = null; saveSuccess = false; const next = snapshot(); emit(); return next; }
  function snapshot() { return { sessionId, articleId: articleIdentity(article), draft: draft && clone(draft), dirty: Boolean(draft && baseline && !draftEquals(draft, baseline)), isSaving, saveError, saveSuccess }; }
  async function save() {
    if (!draft || !article) return { saved: false, stale: false, snapshot: snapshot() };
    if (isSaving) return { saved: false, stale: false, busy: true, snapshot: snapshot() };
    const captured = sessionId; const capturedDraft = clone(draft); const capturedArticle = article;
    isSaving = true; saveError = null; saveSuccess = false; emit();
    try {
      await value.saveDraft(capturedDraft, capturedArticle);
      if (disposed || captured !== sessionId) return { saved: false, stale: true, snapshot: snapshot() };
      baseline = clone(capturedDraft);
      const pendingChanges = !draftEquals(draft, capturedDraft);
      isSaving = false; saveSuccess = !pendingChanges;
      if (successTimer) clearTimeout(successTimer);
      if (!pendingChanges) successTimer = setTimeout(() => { if (!disposed && captured === sessionId) { saveSuccess = false; successTimer = null; emit(); } }, saveSuccessTtlMs);
      emit();
      return { saved: true, stale: false, pendingChanges, snapshot: snapshot() };
    } catch (error) {
      if (disposed || captured !== sessionId) return { saved: false, stale: true, snapshot: snapshot() };
      isSaving = false; saveError = "保存失败，请重试"; emit();
      return { saved: false, stale: false, error, snapshot: snapshot() };
    } finally {
      if (captured === sessionId && !disposed && isSaving) { isSaving = false; emit(); }
    }
  }
  function close(confirm) { if (disposed || !draft) return { closed: true, requiresConfirmation: false }; if (isSaving) return { closed: false, requiresConfirmation: false, saving: true, snapshot: snapshot() }; if (snapshot().dirty && confirm !== true) return { closed: false, requiresConfirmation: true, snapshot: snapshot() }; article = null; draft = null; baseline = null; resetOutcome(); sessionId += 1; const next = { closed: true, requiresConfirmation: false }; emit(); return next; }
  function dispose() { disposed = true; if (successTimer) clearTimeout(successTimer); sessionId += 1; article = null; draft = null; baseline = null; resetOutcome(); emit(); }
  return { open, mergeExternal, update, save, close, dispose, snapshot, subscribe };
}

export { createArticleEditorSession, articleIdentity, draftFromArticle, draftEquals };

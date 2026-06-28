window.mediaArticleDrawer = (function() {
  var state = null;

  function normalizeResource(resource) {
    if (!resource) return null;
    var resourceId = resource.resourceId || resource.id || resource.resource_id;
    if (!resourceId) return null;
    return {
      resourceId: String(resourceId),
      name: resource.name || resource.title || resource.resourceName || "",
      price: resource.price
    };
  }

  function ensureDraft(article, preview, draft) {
    var source = draft || {};
    var selectedResources = Array.isArray(source.selectedResources) ? source.selectedResources.map(normalizeResource).filter(Boolean) : [];
    if (selectedResources.length === 0) {
      if (source.resourceId) {
        selectedResources = [normalizeResource(source)];
      } else if (preview && Array.isArray(preview.selectedResources)) {
        selectedResources = preview.selectedResources.map(normalizeResource).filter(Boolean);
      }
    }
    return {
      filename: article.filename,
      title: source.title || (preview && preview.title) || article.title || "",
      remark: source.remark || "",
      ignoreImages: !!source.ignoreImages,
      selectedResources: selectedResources
    };
  }

  function firstSelectedResource() {
    return state && state.draft.selectedResources && state.draft.selectedResources[0] || null;
  }

  function readOnlySelectedResources() {
    if (!state || !state.draft || !Array.isArray(state.draft.selectedResources)) return [];
    return state.draft.selectedResources.map(normalizeResource).filter(Boolean);
  }

  function renderPreview() {
    var preview = state.preview || {};
    return [
      '<section class="drawer-section">',
      '<div class="panel-head"><h2>文章预览</h2></div>',
      '<div class="drawer-preview">',
      '<h3>' + window.dom.escapeHtml(preview.title || state.article.title || state.article.filename) + '</h3>',
      '<pre class="preview-text">' + window.dom.escapeHtml(preview.content || "") + '</pre>',
      '</div>',
      '</section>'
    ].join("");
  }

  function renderSelectedResources() {
    var items = readOnlySelectedResources();
    if (items.length === 0) {
      return [
        '<p class="empty-state">尚未选择媒体资源</p>',
        '<p class="drawer-tip">请在工作台右侧的共享资源库中为这篇文章选择媒体。</p>'
      ].join("");
    }
    return [
      '<div class="selected-resource-list">',
      items.map(function(resource) {
        return '<div class="resource-row"><span>' + window.dom.escapeHtml(resource.name || String(resource.resourceId)) + '</span><span class="count-pill">￥' + window.dom.escapeHtml(String(resource.price || "?")) + '</span></div>';
      }).join(""),
      '</div>',
      '<p class="drawer-tip">媒体选择已移动到工作台右侧的共享资源库。</p>'
    ].join("");
  }

  function renderEditor() {
    return [
      '<section class="drawer-section">',
      '<div class="panel-head"><h2>草稿编辑</h2><span class="count-pill">' + readOnlySelectedResources().length + ' 个媒体</span></div>',
      '<label class="draft-field">标题<input id="draftTitleInput" type="text" value="' + window.dom.escapeHtml(state.draft.title || "") + '" placeholder="标题"></label>',
      '<label class="draft-field">备注<textarea id="draftRemarkInput" rows="4" placeholder="备注">' + window.dom.escapeHtml(state.draft.remark || "") + '</textarea></label>',
      '<label class="check-row"><input id="ignoreImagesInput" type="checkbox" ' + (state.draft.ignoreImages ? "checked" : "") + '>忽略图片</label>',
      '</section>',
      '<section class="drawer-section">',
      '<div class="panel-head"><h2>已选媒体摘要</h2></div>',
      renderSelectedResources(),
      '</section>',
      '<div class="drawer-actions">',
      '<button id="saveDraftBtn" class="primary">保存</button>',
      '<button id="saveCloseDraftBtn" class="secondary">保存并关闭</button>',
      '<button data-close-drawer class="secondary">取消</button>',
      '</div>',
      '<p class="drawer-tip">' + (state.message || "修改不会自动保存。") + '</p>'
    ].join("");
  }

  function saveDraft(closeAfterSave) {
    if (!state) return Promise.resolve();
    state.message = "保存中...";
    render();

    var first = firstSelectedResource();
    return state.api.media.setDraft(state.article.filename, {
      title: state.draft.title,
      remark: state.draft.remark,
      ignoreImages: !!state.draft.ignoreImages,
      selectedResources: readOnlySelectedResources(),
      resourceId: first ? first.resourceId : "",
      resourceName: first ? first.name : ""
    }).then(function(result) {
      if (result && result.ok) {
        state.message = "已保存";
        if (state.onSaved) state.onSaved(readOnlySelectedResources(), { closeAfterSave: closeAfterSave });
        if (closeAfterSave) {
          window.drawer.close();
          return;
        }
      } else {
        state.message = "保存失败";
      }
      render();
    }).catch(function() {
      state.message = "保存失败";
      render();
    });
  }

  function render() {
    if (!state) return;
    window.drawer.open([
      '<div class="drawer-head"><h2>' + window.dom.escapeHtml(state.article.title || state.article.filename) + '</h2><button data-close-drawer class="icon-button">×</button></div>',
      '<div class="drawer-body">',
      '<div class="article-drawer-layout">',
      '<div class="article-drawer-column">',
      renderPreview(),
      '</div>',
      '<div class="article-drawer-column">',
      renderEditor(),
      '</div>',
      '</div>',
      '</div>'
    ].join(""), function(root) {
      var titleInput = root.querySelector("#draftTitleInput");
      if (titleInput) {
        titleInput.addEventListener("input", function() {
          state.draft.title = titleInput.value;
          state.message = "";
        });
      }

      var remarkInput = root.querySelector("#draftRemarkInput");
      if (remarkInput) {
        remarkInput.addEventListener("input", function() {
          state.draft.remark = remarkInput.value;
          state.message = "";
        });
      }

      var ignoreImagesInput = root.querySelector("#ignoreImagesInput");
      if (ignoreImagesInput) {
        ignoreImagesInput.addEventListener("change", function() {
          state.draft.ignoreImages = !!ignoreImagesInput.checked;
          state.message = "";
        });
      }

      var saveBtn = root.querySelector("#saveDraftBtn");
      if (saveBtn) saveBtn.addEventListener("click", function() { saveDraft(false); });

      var saveCloseBtn = root.querySelector("#saveCloseDraftBtn");
      if (saveCloseBtn) saveCloseBtn.addEventListener("click", function() { saveDraft(true); });

      root.querySelectorAll("[data-close-drawer]").forEach(function(button) {
        button.addEventListener("click", function() {
          if (state && state.onClosed) state.onClosed();
        });
      });
    });
  }

  async function open(api, article, opts) {
    var options = opts || {};
    var previewResult = await api.media.previewArticle(article.filename);
    var draftResult = await api.media.getDraft(article.filename);

    state = {
      api: api,
      article: article,
      preview: previewResult && previewResult.ok ? previewResult.data : null,
      draft: ensureDraft(article, previewResult && previewResult.data, draftResult && draftResult.ok ? draftResult.data : null),
      message: "",
      onSaved: options.onSaved || null,
      onClosed: options.onClosed || null
    };

    if (options.onDraftLoaded) {
      options.onDraftLoaded({
        article: article,
        preview: state.preview,
        draft: {
          filename: state.draft.filename,
          title: state.draft.title,
          remark: state.draft.remark,
          ignoreImages: state.draft.ignoreImages,
          selectedResources: readOnlySelectedResources()
        }
      });
    }

    render();
  }

  function syncSelectedResources(selectedResources) {
    if (!state || !state.draft) return;
    state.draft.selectedResources = Array.isArray(selectedResources) ? selectedResources.map(normalizeResource).filter(Boolean) : [];
    state.message = "";
    render();
  }

  function getState() {
    if (!state) return null;
    return {
      article: state.article,
      preview: state.preview,
      draft: {
        filename: state.draft.filename,
        title: state.draft.title,
        remark: state.draft.remark,
        ignoreImages: state.draft.ignoreImages,
        selectedResources: readOnlySelectedResources()
      }
    };
  }

  return {
    open: open,
    syncSelectedResources: syncSelectedResources,
    getState: getState
  };
})();

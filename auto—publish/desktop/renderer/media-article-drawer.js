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

  function normalizeResources(resources) {
    return Array.isArray(resources) ? resources.map(normalizeResource).filter(Boolean) : [];
  }

  function ensureDraft(article, preview, draft) {
    var source = draft || {};
    var selectedResources = normalizeResources(source.selectedResources);
    if (selectedResources.length === 0) {
      if (source.resourceId) {
        selectedResources = [normalizeResource(source)];
      } else if (preview && Array.isArray(preview.selectedResources)) {
        selectedResources = normalizeResources(preview.selectedResources);
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

  function readOnlySelectedResources() {
    if (!state || !state.draft) return [];
    return normalizeResources(state.draft.selectedResources);
  }

  function getSelectedResourceIds() {
    return readOnlySelectedResources().map(function(resource) {
      return String(resource.resourceId);
    });
  }

  function isOpen() {
    return !!state;
  }

  function renderPreview() {
    var preview = state.preview || {};
    return [
      '<section class="panel media-article-panel">',
      '<div class="panel-head"><h2>文章预览</h2><span class="count-pill">当前文章</span></div>',
      '<div class="drawer-preview">',
      '<h3>' + window.dom.escapeHtml(preview.title || state.article.title || state.article.filename) + '</h3>',
      '<pre class="preview-text">' + window.dom.escapeHtml(preview.content || "") + '</pre>',
      '</div>',
      '</section>'
    ].join("");
  }

  function renderSummary() {
    var items = readOnlySelectedResources();
    var count = items.length;
    if (count === 0) {
      return [
        '<section class="panel media-article-panel">',
        '<div class="panel-head"><h2>已选媒体摘要</h2><span class="count-pill">0 个</span></div>',
        '<p class="empty-state">尚未选择媒体。请在右侧媒体池中直接勾选。</p>',
        '</section>'
      ].join("");
    }

    return [
      '<section class="panel media-article-panel">',
      '<div class="panel-head"><h2>已选媒体摘要</h2><span class="count-pill">' + count + ' 个</span></div>',
      '<div class="selected-resource-list">',
      items.map(function(resource) {
        return [
          '<div class="resource-row">',
          '<span class="article-summary-name">' + window.dom.escapeHtml(resource.name || String(resource.resourceId)) + '</span>',
          '<span class="count-pill">' + window.dom.escapeHtml(String(resource.price === undefined || resource.price === null || resource.price === "" ? "?" : resource.price)) + '</span>',
          '<button data-remove-selected-resource="' + window.dom.escapeHtml(String(resource.resourceId)) + '" class="secondary">取消</button>',
          '</div>'
        ].join("");
      }).join(""),
      '<p class="drawer-tip">媒体选择来自右侧媒体池，这里仅做摘要展示和取消。</p>',
      '</section>'
    ].join("");
  }

  function renderEditor() {
    return [
      '<section class="panel media-article-panel">',
      '<div class="panel-head"><h2>草稿编辑</h2><span class="count-pill">' + getSelectedResourceIds().length + ' 个媒体</span></div>',
      '<label class="draft-field">标题<input id="draftTitleInput" type="text" value="' + window.dom.escapeHtml(state.draft.title || "") + '" placeholder="标题"></label>',
      '<label class="draft-field">备注<textarea id="draftRemarkInput" rows="4" placeholder="备注">' + window.dom.escapeHtml(state.draft.remark || "") + '</textarea></label>',
      '<label class="check-row"><input id="ignoreImagesInput" type="checkbox" ' + (state.draft.ignoreImages ? "checked" : "") + '>忽略图片</label>',
      '</section>'
    ].join("");
  }

  function saveDraft(closeAfterSave) {
    if (!state) return Promise.resolve();
    state.message = "保存中...";
    render();

    var first = readOnlySelectedResources()[0] || null;
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
        if (closeAfterSave && state.onClosed) {
          state.onClosed();
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

  function renderActions() {
    return [
      '<div class="drawer-actions">',
      '<button id="saveDraftBtn" class="primary">保存</button>',
      '<button data-close-article class="secondary">关闭文章</button>',
      '</div>',
      '<p class="drawer-tip">' + (state.message || "修改不会自动保存。") + '</p>'
    ].join("");
  }

  function render() {
    if (!state) {
      return '<section class="panel"><div class="panel-head"><h2>文章详情</h2></div><p class="empty-state">请选择一篇文章开始编辑。</p></section>';
    }

    return [
      '<div class="article-detail-shell">',
      '<section class="panel media-article-panel article-detail-header">',
      '<div class="panel-head"><h2>' + window.dom.escapeHtml(state.article.title || state.article.filename) + '</h2><span class="count-pill">' + getSelectedResourceIds().length + ' 个媒体</span></div>',
      '<p class="drawer-tip">已选媒体直接来自右侧媒体池，摘要区只负责展示与取消。</p>',
      '</section>',
      '<div class="article-detail-grid">',
      '<div class="article-detail-column">',
      renderPreview(),
      renderSummary(),
      '</div>',
      '<div class="article-detail-column">',
      renderEditor(),
      renderActions(),
      '</div>',
      '</div>',
      '</div>'
    ].join("");
  }

  function bind(root, rerender) {
    if (!state) return;

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
    if (saveBtn) {
      saveBtn.addEventListener("click", function() {
        saveDraft(false).then(function() {
          if (typeof rerender === "function") rerender();
        });
      });
    }

    root.querySelectorAll("[data-remove-selected-resource]").forEach(function(button) {
      button.addEventListener("click", function() {
        var resourceId = button.getAttribute("data-remove-selected-resource");
        if (state && state.onRemoveSelectedResource) {
          state.onRemoveSelectedResource(resourceId);
        }
        if (typeof rerender === "function") rerender();
      });
    });

    root.querySelectorAll("[data-close-article]").forEach(function(button) {
      button.addEventListener("click", function() {
        if (state && state.onClosed) state.onClosed();
        if (typeof rerender === "function") rerender();
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
      onRemoveSelectedResource: options.onRemoveSelectedResource || null,
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
  }

  function syncSelectedResources(selectedResources) {
    if (!state || !state.draft) return;
    state.draft.selectedResources = normalizeResources(selectedResources);
    state.message = "";
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

  function close() {
    state = null;
  }

  return {
    open: open,
    close: close,
    bind: bind,
    render: render,
    syncSelectedResources: syncSelectedResources,
    getState: getState,
    isOpen: isOpen,
    getSelectedResourceIds: getSelectedResourceIds
  };
})();

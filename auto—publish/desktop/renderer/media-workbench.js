window.createMediaWorkbench = function(api) {
  var articles = [];
  var resourceLib = null;
  var refreshView = null;
  var activeArticleFilename = "";
  var activeArticle = null;
  var activeDraft = null;

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

  function cloneSelectedResources(selectedResources) {
    return Array.isArray(selectedResources) ? selectedResources.map(normalizeResource).filter(Boolean) : [];
  }

  function activeSelectedResourceIds() {
    return cloneSelectedResources(activeDraft && activeDraft.selectedResources).map(function(resource) {
      return String(resource.resourceId);
    });
  }

  function syncActiveArticleIntoList() {
    if (!activeArticleFilename || !activeDraft) return;
    articles = articles.map(function(article) {
      if (article.filename !== activeArticleFilename) return article;
      return Object.assign({}, article, {
        title: activeDraft.title || article.title,
        selectedResources: cloneSelectedResources(activeDraft.selectedResources)
      });
    });
    activeArticle = articles.find(function(article) {
      return article.filename === activeArticleFilename;
    }) || activeArticle;
  }

  function updateLibrarySelectionState() {
    if (!resourceLib) return;
    resourceLib.setMode(activeArticleFilename ? "picker" : "management");
    resourceLib.setSelectedResourceIds(activeSelectedResourceIds());
  }

  function clearActiveArticleContext() {
    activeArticleFilename = "";
    activeArticle = null;
    activeDraft = null;
    updateLibrarySelectionState();
    rerenderWorkspace();
  }

  function rerenderWorkspace() {
    if (refreshView) refreshView();
  }

  function syncDrawerSelection() {
    if (!activeDraft) return;
    window.mediaArticleDrawer.syncSelectedResources(cloneSelectedResources(activeDraft.selectedResources));
  }

  function addResourceToActiveDraft(resource) {
    if (!activeDraft) return;
    var normalized = normalizeResource(resource);
    if (!normalized) return;
    var items = cloneSelectedResources(activeDraft.selectedResources);
    var exists = items.some(function(item) {
      return String(item.resourceId) === String(normalized.resourceId);
    });
    if (exists) return;
    items.push(normalized);
    activeDraft.selectedResources = items;
    syncActiveArticleIntoList();
    updateLibrarySelectionState();
    syncDrawerSelection();
    rerenderWorkspace();
  }

  async function load() {
    resourceLib = resourceLib || window.createMediaResourceLibrary(api, {
      mode: "management",
      onPick: function(resource) {
        addResourceToActiveDraft(resource);
      }
    });
    updateLibrarySelectionState();
    await resourceLib.load();
    var result = await api.media.scanArticles();
    articles = result.ok ? result.data || [] : [];
    if (activeArticleFilename) {
      activeArticle = articles.find(function(item) {
        return item.filename === activeArticleFilename;
      }) || activeArticle;
      syncActiveArticleIntoList();
    }
  }

  function renderActiveArticleHint() {
    if (!activeArticleFilename || !activeDraft) {
      return '<section class="panel"><div class="panel-head"><h2>媒体选择</h2><span class="count-pill">池中 ' + (resourceLib ? resourceLib.getPool().length : 0) + ' 个</span></div><p>在右侧资源库中管理媒体池，打开文章后可直接将媒体加入当前草稿。</p></section>';
    }

    return [
      '<section class="panel">',
      '<div class="panel-head"><h2>媒体选择</h2><span class="count-pill">编辑中</span></div>',
      '<p>当前文章：' + window.dom.escapeHtml(activeDraft.title || (activeArticle && activeArticle.title) || activeArticleFilename) + '</p>',
      '<p>已选媒体：' + activeSelectedResourceIds().length + ' 个。请在右侧共享资源库中继续选择。</p>',
      '</section>'
    ].join("");
  }

  function render() {
    var pool = resourceLib ? resourceLib.getPool() : [];
    return [
      '<div class="workspace-head">',
      '<h2>媒体投稿</h2>',
      '<div class="toolbar">',
      '<button id="scanMediaBtn" class="secondary">扫描文章</button>',
      '<button id="preflightMediaBtn" class="primary">预检并提交</button>',
      '<button id="openOrdersBtn" class="secondary">查看订单</button>',
      '<button id="fetchResourcesBtn" class="secondary">拉取资源库（较慢，约需数分钟）</button>',
      '<button id="checkBalanceBtn" class="secondary">查询余额</button>',
      '<span id="balanceDisplay" style="margin-left:8px;font-size:13px;color:var(--muted);"></span>',
      '</div>',
      '</div>',
      '<div class="media-workbench-grid">',
      '<div>',
      '<section class="panel">',
      '<div class="panel-head"><h2>文章列表</h2><span id="mediaArticleCount" class="count-pill">' + articles.length + ' 篇</span></div>',
      articles.length === 0 ? '<p class="empty-state">暂无文章，将 .txt / .docx / .md 文件放入 input/media 目录</p>' : articles.map(function(a) {
        var filename = a.filename || a.filePath || "";
        var title = a.title || filename;
        var selectedCount = (a.selectedResources || []).length;
        return '<div class="article-row"><span class="article-title">' + window.dom.escapeHtml(title) + '</span><span class="article-meta">' + window.dom.escapeHtml(filename) + '</span><span class="count-pill">' + selectedCount + ' 个媒体</span><button data-open-article="' + window.dom.escapeHtml(filename) + '" class="secondary">打开</button></div>';
      }).join(""),
      '</section>',
      renderActiveArticleHint(),
      '</div>',
      '<div id="mediaResourceLibraryRoot">' + (resourceLib ? resourceLib.render() : "") + '</div>',
      '</div>'
    ].join("");
  }

  function openArticle(filename) {
    activeArticleFilename = filename;
    activeArticle = articles.find(function(item) {
      return item.filename === filename;
    }) || { filename: filename };

    window.mediaArticleDrawer.open(api, activeArticle, {
      onDraftLoaded: function(payload) {
        activeArticle = payload.article;
        activeDraft = {
          filename: payload.draft.filename,
          title: payload.draft.title,
          remark: payload.draft.remark,
          ignoreImages: payload.draft.ignoreImages,
          selectedResources: cloneSelectedResources(payload.draft.selectedResources)
        };
        syncActiveArticleIntoList();
        updateLibrarySelectionState();
        rerenderWorkspace();
      },
      onSaved: function(selectedResources) {
        if (activeDraft) {
          activeDraft.selectedResources = cloneSelectedResources(selectedResources);
        }
        syncActiveArticleIntoList();
        if (refreshView) {
          load().then(function() {
            updateLibrarySelectionState();
            refreshView();
          });
        } else {
          load().then(function() {
            updateLibrarySelectionState();
          });
        }
      },
      onClosed: function() {
        clearActiveArticleContext();
      }
    });
  }

  function bind(root, rerender) {
    refreshView = rerender;
    root.querySelector("#scanMediaBtn").addEventListener("click", async function() {
      await load();
      rerender();
    });

    root.querySelector("#preflightMediaBtn").addEventListener("click", async function() {
      var result = await api.media.buildConfirmation(articles);
      if (!result.ok) { alert("预检失败: " + result.error); return; }
      window.confirmPanel.open(result.data, async function() {
        var submitResult = await api.media.submitSelected(articles);
        if (!submitResult.ok) { alert("提交失败: " + submitResult.error); return; }
        alert("提交完成：成功" + submitResult.data.ok + "，失败" + submitResult.data.fail + "，跳过" + submitResult.data.skipped);
        window.drawer.close();
        window.ordersDrawer.open(api);
      });
    });

    root.querySelector("#openOrdersBtn").addEventListener("click", function() {
      window.ordersDrawer.open(api);
    });

    root.querySelector("#fetchResourcesBtn").addEventListener("click", async function() {
      var btn = root.querySelector("#fetchResourcesBtn");
      btn.disabled = true;
      btn.textContent = "拉取中...";
      try {
        var result = await api.media.refreshResources({ fetchAll: true });
        if (result.ok) { await load(); rerender(); }
        else { alert("拉取失败: " + (result.error || "未知错误")); }
      } catch (err) { alert("拉取异常: " + err.message); }
      btn.disabled = false;
      btn.textContent = "拉取资源库（较慢，约需数分钟）";
    });

    root.querySelector("#checkBalanceBtn").addEventListener("click", async function() {
      var display = root.querySelector("#balanceDisplay");
      display.textContent = "查询中...";
      try {
        var result = await api.media.getBalance();
        if (result.ok && result.data) {
          var balance = result.data.balance;
          display.textContent = "余额: " + (balance === null || balance === undefined || balance === "" ? "未知" : balance);
        } else {
          display.textContent = "查询失败";
        }
      } catch (err) {
        display.textContent = "查询异常";
      }
    });

    root.querySelectorAll("[data-open-article]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var filename = btn.getAttribute("data-open-article");
        openArticle(filename);
      });
    });

    var libRoot = root.querySelector("#mediaResourceLibraryRoot");
    if (libRoot && resourceLib) {
      var refreshLibrary = function() {
        if (!libRoot || !resourceLib) return;
        updateLibrarySelectionState();
        libRoot.innerHTML = resourceLib.render();
        resourceLib.bind(libRoot, refreshLibrary);
      };

      updateLibrarySelectionState();
      resourceLib.bind(libRoot, refreshLibrary);
    }
  }

  return { load: load, render: render, bind: bind };
};

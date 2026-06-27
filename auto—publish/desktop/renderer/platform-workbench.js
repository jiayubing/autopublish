window.createPlatformWorkbench = function(api) {
  var queue = [];
  var platforms = [];
  var selectedArticles = [];
  var selectedPlatformIds = [];
  var refreshToken = 0;

  async function load() {
    var result = await api.platforms.getQueue();
    if (result.ok && result.data) {
      queue = result.data.queue || [];
      platforms = result.data.platforms || [];
    }
  }

  function normalizeSelection() {
    selectedArticles = selectedArticles.filter(function(item) {
      return queue.some(function(article) {
        return article.filename === item.filename && article.platformId === item.platformId;
      });
    });
    selectedPlatformIds = selectedPlatformIds.filter(function(id) {
      return platforms.some(function(platform) {
        return platform.id === id;
      });
    });
  }

  function clearSelection() {
    selectedArticles = [];
    selectedPlatformIds = [];
  }

  function isArticleSelected(article) {
    return selectedArticles.some(function(item) {
      return item.filename === article.filename && item.platformId === article.platformId;
    });
  }

  function toggleArticle(article, checked) {
    var exists = isArticleSelected(article);
    if (checked && !exists) {
      selectedArticles.push({
        filename: article.filename,
        title: article.title,
        platformId: article.platformId,
        sourcePlatformId: article.sourcePlatformId,
        sourceArticle: article.sourceArticle,
        filePath: article.filePath
      });
    } else if (!checked && exists) {
      selectedArticles = selectedArticles.filter(function(item) {
        return !(item.filename === article.filename && item.platformId === article.platformId);
      });
    }
  }

  function togglePlatform(id, checked) {
    var exists = selectedPlatformIds.indexOf(id) !== -1;
    if (checked && !exists) {
      selectedPlatformIds.push(id);
    } else if (!checked && exists) {
      selectedPlatformIds = selectedPlatformIds.filter(function(platformId) {
        return platformId !== id;
      });
    }
  }

  function selectionSummary() {
    return selectedArticles.length + " 篇文章 / " + selectedPlatformIds.length + " 个平台";
  }

  function render() {
    return [
      '<div class="workspace-head">',
      '<h2>其他平台</h2>',
      '<div class="toolbar">',
      '<button id="refreshPlatformQueueBtn" class="secondary">刷新队列</button>',
      '<button id="submitPlatformBtn" class="primary" disabled>提交选中</button>',
      '<span class="count-pill">' + window.dom.escapeHtml(selectionSummary()) + '</span>',
      '</div>',
      '</div>',
      '<section class="panel">',
      '<div class="panel-head"><h2>文章队列</h2><span id="platformArticleCount" class="count-pill">' + queue.length + ' 篇</span></div>',
      queue.length === 0 ? '<p class="empty-state">暂无待发文章</p>' : queue.map(function(item, idx) {
        var filename = item.filename || item.filePath || "";
        var platformId = item.platformId || "";
        var checked = isArticleSelected(item) ? ' checked' : '';
        return '<div class="check-row"><input type="checkbox" data-article-idx="' + idx + '" data-platform-id="' + window.dom.escapeHtml(platformId) + '"' + checked + '><span>' + window.dom.escapeHtml(filename) + '</span><span class="count-pill">' + window.dom.escapeHtml(platformId) + '</span></div>';
      }).join(""),
      '</section>',
      '<section class="panel">',
      '<div class="panel-head"><h2>目标平台</h2></div>',
      platforms.map(function(p) {
        var checked = selectedPlatformIds.indexOf(p.id) !== -1 ? ' checked' : '';
        return '<div class="check-row"><input type="checkbox" data-platform-check="' + window.dom.escapeHtml(p.id) + '"' + checked + '><span>' + window.dom.escapeHtml(p.id) + '</span></div>';
      }).join(""),
      '</section>'
    ].join("");
  }

  function bind(root, rerender) {
    var submitBtn = root.querySelector("#submitPlatformBtn");
    var refreshBtn = root.querySelector("#refreshPlatformQueueBtn");

    function applySelectionState() {
      var articleChecks = root.querySelectorAll("[data-article-idx]");
      articleChecks.forEach(function(cb) {
        var idx = Number(cb.getAttribute("data-article-idx"));
        var article = queue[idx];
        cb.checked = !!article && isArticleSelected(article);
      });

      root.querySelectorAll("[data-platform-check]").forEach(function(cb) {
        cb.checked = selectedPlatformIds.indexOf(cb.getAttribute("data-platform-check")) !== -1;
      });

      submitBtn.disabled = selectedArticles.length === 0 || selectedPlatformIds.length === 0;
      submitBtn.textContent = selectedArticles.length && selectedPlatformIds.length
        ? "确认提交 " + selectedArticles.length + " 篇 / " + selectedPlatformIds.length + " 个平台"
        : "提交选中";
    }

    if (refreshBtn) {
      refreshBtn.addEventListener("click", async function() {
        clearSelection();
        await load();
        rerender();
      });
    }

    root.querySelectorAll("[data-article-idx]").forEach(function(cb) {
      cb.addEventListener("change", function() {
        var idx = Number(cb.getAttribute("data-article-idx"));
        toggleArticle(queue[idx], cb.checked);
        applySelectionState();
      });
    });

    root.querySelectorAll("[data-platform-check]").forEach(function(cb) {
      cb.addEventListener("change", function() {
        togglePlatform(cb.getAttribute("data-platform-check"), cb.checked);
        applySelectionState();
      });
    });

    if (submitBtn) {
      submitBtn.addEventListener("click", function() {
        if (selectedArticles.length === 0 || selectedPlatformIds.length === 0) return;
        var articles = selectedArticles.map(function(item) {
          return {
            filename: item.filename,
            title: item.title,
            platformId: item.platformId,
            sourcePlatformId: item.sourcePlatformId,
            sourceArticle: item.sourceArticle,
            filePath: item.filePath
          };
        });
        var platformIds = selectedPlatformIds.slice();
        window.platformBatchDrawer.open(api, {
          articles: articles,
          platformIds: platformIds,
          summary: { taskCount: articles.length * platformIds.length }
        }, async function() {
          clearSelection();
          await load();
          rerender();
        });
      });
    }

    applySelectionState();
  }

  return { load: load, render: render, bind: bind };
};

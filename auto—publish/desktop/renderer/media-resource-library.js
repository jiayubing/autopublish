window.createMediaResourceLibrary = function(api) {
  var pool = [];
  var library = [];
  var keyword = "";
  var page = 1;
  var perPage = 20;

  function rid(r) { return r.resource_id || r.resourceId || r.id; }

  async function load() {
    var poolResult = await api.media.getPool();
    pool = poolResult.ok ? poolResult.data.resources || poolResult.data || [] : [];
    if (keyword) {
      var searchResult = await api.media.searchResources(keyword);
      library = searchResult.ok ? searchResult.data : [];
    } else {
      var cachedResult = await api.media.getCachedResources();
      var cached = cachedResult.ok ? cachedResult.data : null;
      library = cached && cached.resources ? cached.resources : [];
    }
    page = 1;
    return pool;
  }

  function getPool() {
    return pool;
  }

  function render() {
    var totalPages = Math.ceil(library.length / perPage) || 1;
    var pageItems = library.slice((page - 1) * perPage, page * perPage);

    var poolSection = [
      '<section class="panel">',
      '<div class="panel-head"><h2>媒体池</h2><button id="refreshMediaPool" class="secondary">刷新</button></div>',
      '<div class="resource-list">',
      pool.map(function(resource) {
        var id = rid(resource);
        return '<div class="resource-row"><strong>' + window.dom.escapeHtml(resource.title || String(id)) + '</strong><button data-remove-pool="' + window.dom.escapeHtml(String(id)) + '" class="icon-button">×</button></div>';
      }).join(""),
      '</div>',
      '</section>'
    ].join("");

    var libBody;
    if (library.length === 0) {
      libBody = '<p class="empty-state">资源库暂无数据，请点击顶部的「拉取资源库」按钮获取最新资源。</p>';
    } else {
      libBody = [
        '<div class="resource-list">',
        pageItems.map(function(resource) {
          var id = rid(resource);
          var inPool = pool.some(function(p) { return rid(p) === id; });
          return '<div class="resource-row"><span>' + window.dom.escapeHtml(resource.title || String(id)) + '</span><span class="count-pill">¥' + window.dom.escapeHtml(String(resource.price || "?")) + '</span>' + (inPool ? '<span>已在池中</span>' : '<button data-add-pool="' + window.dom.escapeHtml(String(id)) + '" class="secondary">加入池</button>') + '</div>';
        }).join(""),
        '<div class="pagination">',
        '<button id="prevPageBtn" class="secondary" ' + (page <= 1 ? 'disabled' : '') + '>上一页</button>',
        '<span class="page-info">第 ' + page + ' / ' + totalPages + ' 页（共 ' + library.length + ' 条）</span>',
        '<button id="nextPageBtn" class="secondary" ' + (page * perPage >= library.length ? 'disabled' : '') + '>下一页</button>',
        '</div>',
        '</div>'
      ].join("");
    }

    return [
      poolSection,
      '<section class="panel">',
      '<div class="panel-head"><h2>资源库</h2><input id="resourceSearchInput" type="text" placeholder="搜索媒体名称..." class="media-search"></div>',
      libBody,
      '</section>'
    ].join("");
  }

  function bind(root, rerender) {
    var refreshBtn = root.querySelector("#refreshMediaPool");
    if (refreshBtn) refreshBtn.addEventListener("click", async function() { await load(); rerender(); });
    var searchInput = root.querySelector("#resourceSearchInput");
    if (searchInput) searchInput.addEventListener("input", function() {
      keyword = searchInput.value.trim();
      page = 1;
      rerender();
    });
    var prevBtn = root.querySelector("#prevPageBtn");
    if (prevBtn) prevBtn.addEventListener("click", function() { if (page > 1) { page--; rerender(); } });
    var nextBtn = root.querySelector("#nextPageBtn");
    if (nextBtn) nextBtn.addEventListener("click", function() { if (page * perPage < library.length) { page++; rerender(); } });
    root.querySelectorAll("[data-add-pool]").forEach(function(btn) {
      btn.addEventListener("click", async function() {
        var id = btn.getAttribute("data-add-pool");
        var resource = library.find(function(r) { return String(rid(r)) === id; });
        if (resource) {
          await api.media.addToPool(resource);
          await load();
          rerender();
        }
      });
    });
    root.querySelectorAll("[data-remove-pool]").forEach(function(btn) {
      btn.addEventListener("click", async function() {
        var id = btn.getAttribute("data-remove-pool");
        await api.media.removeFromPool(id);
        await load();
        rerender();
      });
    });
  }

  return { load: load, render: render, bind: bind, getPool: getPool };
};

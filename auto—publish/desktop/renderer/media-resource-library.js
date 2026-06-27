window.createMediaResourceLibrary = function(api) {
  var pool = [];
  var keyword = "";
  var page = 1;
  var perPage = 20;
  var resourcePage = emptyPage();

  function rid(r) {
    return r.resource_id || r.resourceId || r.id;
  }

  function emptyPage() {
    return {
      page: 1,
      pageSize: perPage,
      total: 0,
      totalPages: 0,
      items: []
    };
  }

  async function load() {
    var poolResult = await api.media.getPool();
    pool = poolResult.ok ? poolResult.data.resources || poolResult.data || [] : [];

    var result;
    if (keyword) {
      result = await api.media.searchResourcePage({ keyword: keyword, page: page, pageSize: perPage });
    } else {
      result = await api.media.getResourcePage({ page: page, pageSize: perPage });
    }

    resourcePage = result && result.ok ? (result.data || emptyPage()) : emptyPage();
    page = resourcePage.page || 1;
    return pool;
  }

  function getPool() {
    return pool;
  }

  function render() {
    var items = resourcePage.items || [];
    var currentPage = resourcePage.page || page;
    var totalPages = resourcePage.totalPages || 0;
    var total = resourcePage.total || 0;
    var empty = items.length === 0;

    var poolSection = [
      '<section class="panel">',
      '<div class="panel-head"><h2>媒体池</h2><button id="refreshMediaPool" class="secondary">刷新</button></div>',
      '<div class="resource-list">',
      pool.map(function(resource) {
        var id = rid(resource);
        return '<div class="resource-row"><strong>' + window.dom.escapeHtml(resource.name || resource.title || String(id)) + '</strong><button data-remove-pool="' + window.dom.escapeHtml(String(id)) + '" class="icon-button">×</button></div>';
      }).join(""),
      '</div>',
      '</section>'
    ].join("");

    var libBody;
    if (empty) {
      libBody = '<p class="empty-state">资源库暂无数据，请点击顶部的「拉取资源库」按钮获取最新资源。</p>';
    } else {
      libBody = [
        '<div class="resource-list">',
        items.map(function(resource) {
          var id = rid(resource);
          var inPool = pool.some(function(p) { return rid(p) === id; });
          return '<div class="resource-row"><span>' + window.dom.escapeHtml(resource.name || resource.title || String(id)) + '</span><span class="count-pill">￥' + window.dom.escapeHtml(String(resource.price || "?")) + '</span>' + (inPool ? '<span>已在池中</span>' : '<button data-add-pool="' + window.dom.escapeHtml(String(id)) + '" class="secondary">加入池</button>') + '</div>';
        }).join(""),
        '<div class="pagination">',
        '<button id="prevPageBtn" class="secondary" ' + (currentPage <= 1 ? 'disabled' : '') + '>上一页</button>',
        '<span class="page-info">第 ' + currentPage + ' / ' + totalPages + ' 页（共 ' + total + ' 条）</span>',
        '<button id="nextPageBtn" class="secondary" ' + (currentPage >= totalPages || total === 0 ? 'disabled' : '') + '>下一页</button>',
        '</div>',
        '</div>'
      ].join("");
    }

    return [
      poolSection,
      '<section class="panel">',
      '<div class="panel-head"><h2>资源库</h2><input id="resourceSearchInput" type="text" value="' + window.dom.escapeHtml(keyword) + '" placeholder="搜索媒体名称..." class="media-search"></div>',
      libBody,
      '</section>'
    ].join("");
  }

  function bind(root, rerender) {
    var refreshBtn = root.querySelector("#refreshMediaPool");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", async function() {
        await load();
        rerender();
      });
    }

    var searchInput = root.querySelector("#resourceSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", function() {
        keyword = searchInput.value.trim();
        (async function() {
          await load();
          rerender();
        })();
      });
    }

    var prevBtn = root.querySelector("#prevPageBtn");
    if (prevBtn) {
      prevBtn.addEventListener("click", async function() {
        if ((resourcePage.page || page) > 1) {
          page = (resourcePage.page || page) - 1;
          await load();
          rerender();
        }
      });
    }

    var nextBtn = root.querySelector("#nextPageBtn");
    if (nextBtn) {
      nextBtn.addEventListener("click", async function() {
        if ((resourcePage.page || page) < (resourcePage.totalPages || 0)) {
          page = (resourcePage.page || page) + 1;
          await load();
          rerender();
        }
      });
    }

    root.querySelectorAll("[data-add-pool]").forEach(function(btn) {
      btn.addEventListener("click", async function() {
        var id = btn.getAttribute("data-add-pool");
        var resource = (resourcePage.items || []).find(function(r) { return String(rid(r)) === id; });
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

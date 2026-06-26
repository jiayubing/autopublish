window.createMediaResourceLibrary = function(api) {
  var pool = [];
  var library = [];
  var keyword = "";

  async function load() {
    var poolResult = await api.media.getPool();
    pool = poolResult.ok ? poolResult.data.resources || poolResult.data || [] : [];
    if (keyword) {
      var searchResult = await api.media.searchResources(keyword);
      library = searchResult.ok ? searchResult.data : [];
    } else {
      var cachedResult = await api.media.getCachedResources();
      var cached = cachedResult.ok ? cachedResult.data : null;
      library = cached && cached.resources ? cached.resources.slice(0, 80) : [];
    }
    return pool;
  }

  function getPool() {
    return pool;
  }

  function render() {
    return [
      '<section class="panel">',
      '<div class="panel-head"><h2>媒体池</h2><button id="refreshMediaPool" class="secondary">刷新</button></div>',
      '<div class="resource-list">',
      pool.map(function(resource) {
        var id = resource.resourceId || resource.id || resource.resource_id;
        return '<div class="resource-row"><strong>' + window.dom.escapeHtml(resource.resourceName || resource.name || id) + '</strong><button data-remove-pool="' + window.dom.escapeHtml(id) + '" class="icon-button">×</button></div>';
      }).join(""),
      '</div>',
      '</section>',
      '<section class="panel">',
      '<div class="panel-head"><h2>资源库</h2><input id="resourceSearchInput" type="text" placeholder="搜索媒体名称..." class="media-search"></div>',
      '<div class="resource-list">',
      library.map(function(resource) {
        var id = resource.resourceId || resource.id || resource.resource_id;
        var inPool = pool.some(function(p) { return (p.resourceId || p.id || p.resource_id) === id; });
        return '<div class="resource-row"><span>' + window.dom.escapeHtml(resource.resourceName || resource.name || id) + '</span><span class="count-pill">' + (resource.money || "?") + '</span>' + (inPool ? '<span>已在池中</span>' : '<button data-add-pool="' + window.dom.escapeHtml(id) + '" class="secondary">加入池</button>') + '</div>';
      }).join(""),
      '</div>',
      '</section>'
    ].join("");
  }

  function bind(root, rerender) {
    var refreshBtn = root.querySelector("#refreshMediaPool");
    if (refreshBtn) refreshBtn.addEventListener("click", async function() { await load(); rerender(); });
    var searchInput = root.querySelector("#resourceSearchInput");
    if (searchInput) searchInput.addEventListener("input", function() {
      keyword = searchInput.value.trim();
      rerender();
    });
    root.querySelectorAll("[data-add-pool]").forEach(function(btn) {
      btn.addEventListener("click", async function() {
        var id = btn.getAttribute("data-add-pool");
        var resource = library.find(function(r) { return (r.resourceId || r.id || r.resource_id) === id; });
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

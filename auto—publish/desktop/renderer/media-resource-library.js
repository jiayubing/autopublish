window.createMediaResourceLibrary = function(api, opts) {
  var options = opts || {};
  var pool = [];
  var keyword = "";
  var page = 1;
  var perPage = 20;
  var resourcePage = emptyPage();
  var mode = options.mode || "management";
  var selectedResourceIds = [];
  var onPick = options.onPick || null;
  var searchTimer = null;
  var restoreSearchFocus = false;
  var restoreSearchSelection = { start: 0, end: 0 };
  var isComposing = false;

  function rid(resource) {
    return resource.resource_id || resource.resourceId || resource.id;
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

  function setMode(nextMode) {
    mode = nextMode || "management";
  }

  function setSelectedResourceIds(ids) {
    selectedResourceIds = Array.isArray(ids) ? ids.map(function(id) { return String(id); }) : [];
  }

  function formatPrice(value) {
    return value === undefined || value === null || value === "" ? "?" : String(value);
  }

  function render() {
    var items = resourcePage.items || [];
    var currentPage = resourcePage.page || page;
    var totalPages = resourcePage.totalPages || 0;
    var total = resourcePage.total || 0;
    var empty = items.length === 0;
    var pickerMode = mode === "picker";

    var poolSection = pickerMode ? "" : [
      '<section class="panel">',
      '<div class="panel-head"><h2>媒体池</h2><button id="refreshMediaPool" class="secondary">刷新</button></div>',
      '<div class="resource-list">',
      pool.map(function(resource) {
        var id = rid(resource);
        return '<div class="resource-row"><strong>' + window.dom.escapeHtml(resource.name || resource.title || String(id)) + '</strong><span class="count-pill">￥' + window.dom.escapeHtml(formatPrice(resource.price)) + '</span><button data-remove-pool="' + window.dom.escapeHtml(String(id)) + '" class="icon-button">×</button></div>';
      }).join(""),
      '</div>',
      '</section>'
    ].join("");

    var libBody;
    if (empty) {
      libBody = '<p class="empty-state">' + (pickerMode ? '资源库暂无数据，请先拉取资源库。' : '资源库暂无数据，请点击顶部的「拉取资源库」按钮获取最新资源。') + '</p>';
    } else {
      libBody = [
        '<div class="resource-list">',
        items.map(function(resource) {
          var id = rid(resource);
          var inPool = pool.some(function(p) { return rid(p) === id; });
          var isPicked = selectedResourceIds.indexOf(String(id)) !== -1;
          var action;
          if (pickerMode) {
            action = isPicked ? '<span class="count-pill">已选择</span>' : '<button data-pick-resource="' + window.dom.escapeHtml(String(id)) + '" class="secondary">选择</button>';
          } else {
            action = inPool ? '<span>已在池中</span>' : '<button data-add-pool="' + window.dom.escapeHtml(String(id)) + '" class="secondary">加入池</button>';
          }
          return '<div class="resource-row"><span>' + window.dom.escapeHtml(resource.name || resource.title || String(id)) + '</span><span class="count-pill">￥' + window.dom.escapeHtml(formatPrice(resource.price)) + '</span>' + action + '</div>';
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
      '<div class="panel-head"><h2>' + (pickerMode ? '资源选择' : '资源库') + '</h2><input id="resourceSearchInput" type="text" value="' + window.dom.escapeHtml(keyword) + '" placeholder="搜索媒体名称..." class="media-search"></div>',
      libBody,
      '</section>'
    ].join("");
  }

  function bind(root, rerender) {
    if (mode !== "picker") {
      var refreshBtn = root.querySelector("#refreshMediaPool");
      if (refreshBtn) {
        refreshBtn.addEventListener("click", async function() {
          await load();
          rerender();
        });
      }
    }

    var searchInput = root.querySelector("#resourceSearchInput");
    if (searchInput) {
      if (restoreSearchFocus) {
        searchInput.focus();
        if (typeof searchInput.setSelectionRange === "function") {
          var length = searchInput.value.length;
          searchInput.setSelectionRange(
            Math.min(restoreSearchSelection.start, length),
            Math.min(restoreSearchSelection.end, length)
          );
        }
        restoreSearchFocus = false;
      }

      searchInput.addEventListener("compositionstart", function() {
        isComposing = true;
        if (searchTimer) clearTimeout(searchTimer);
      });

      searchInput.addEventListener("compositionend", function() {
        isComposing = false;
        keyword = searchInput.value.trim();
        page = 1;
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(function() {
          load().then(function() {
            rerender();
          });
        }, 0);
      });

      searchInput.addEventListener("input", function(event) {
        if (event && (event.isComposing || isComposing)) {
          return;
        }
        if (document.activeElement === searchInput) {
          restoreSearchFocus = true;
          restoreSearchSelection = {
            start: typeof searchInput.selectionStart === "number" ? searchInput.selectionStart : searchInput.value.length,
            end: typeof searchInput.selectionEnd === "number" ? searchInput.selectionEnd : searchInput.value.length
          };
        }
        keyword = searchInput.value.trim();
        page = 1;
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(function() {
          load().then(function() {
            rerender();
          });
        }, 180);
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

    root.querySelectorAll("[data-pick-resource]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var id = btn.getAttribute("data-pick-resource");
        var resource = (resourcePage.items || []).find(function(r) { return String(rid(r)) === id; });
        if (resource && onPick) onPick(resource);
      });
    });
  }

  return { load: load, render: render, bind: bind, getPool: getPool, setMode: setMode, setSelectedResourceIds: setSelectedResourceIds };
};

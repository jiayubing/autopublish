window.createMediaWorkbench = function(api) {
  var articles = [];
  var resourceLib = null;

  async function load() {
    resourceLib = resourceLib || window.createMediaResourceLibrary(api);
    await resourceLib.load();
    var result = await api.media.scanArticles();
    articles = result.ok ? result.data || [] : [];
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
        return '<div class="article-row"><span class="article-title">' + window.dom.escapeHtml(title) + '</span><span class="article-meta">' + window.dom.escapeHtml(filename) + '</span><button data-preview="' + window.dom.escapeHtml(filename) + '" class="secondary">预览</button></div>';
      }).join(""),
      '</section>',
      '<section class="panel">',
      '<div class="panel-head"><h2>媒体选择</h2><span class="count-pill">池中 ' + pool.length + ' 个</span></div>',
      '<p>在右侧资源库中管理媒体池，池中所有媒体将作为投稿目标。</p>',
      '</section>',
      '</div>',
      '<div id="mediaResourceLibraryRoot">' + (resourceLib ? resourceLib.render() : '') + '</div>',
      '</div>'
    ].join("");
  }

  function bind(root, rerender) {
    root.querySelector("#scanMediaBtn").addEventListener("click", async function() { await load(); rerender(); });
    
    root.querySelector("#preflightMediaBtn").addEventListener("click", async function() {
      var result = await api.media.buildConfirmation(articles);
      if (!result.ok) { alert("预检失败: " + result.error); return; }
      window.confirmPanel.open(result.data, async function() {
        var submitResult = await api.media.submitSelected(articles);
        if (!submitResult.ok) { alert("提交失败: " + submitResult.error); return; }
        alert("提交完成：成功 " + submitResult.data.ok + "，失败 " + submitResult.data.fail + "，跳过 " + submitResult.data.skipped);
        window.drawer.close();
        window.ordersDrawer.open(api);
      });
    });

    root.querySelector("#openOrdersBtn").addEventListener("click", function() { window.ordersDrawer.open(api); });

    root.querySelector("#fetchResourcesBtn").addEventListener("click", async function() {
      var btn = root.querySelector("#fetchResourcesBtn");
      btn.disabled = true; btn.textContent = '拉取中...';
      try {
        var result = await api.media.refreshResources({ fetchAll: true });
        if (result.ok) { await load(); rerender(); }
        else { alert('拉取失败: ' + (result.error || '未知错误')); }
      } catch (err) { alert('拉取异常: ' + err.message); }
      btn.disabled = false; btn.textContent = '拉取资源库（较慢，约需数分钟）';
    });

    root.querySelector("#checkBalanceBtn").addEventListener("click", async function() {
      var display = root.querySelector("#balanceDisplay");
      display.textContent = '查询中...';
      try {
        var result = await api.media.getBalance();
        if (result.ok && result.data) { display.textContent = '余额: ' + (result.data.balance || '未知'); }
        else { display.textContent = '查询失败'; }
      } catch (err) { display.textContent = '查询异常'; }
    });

    root.querySelectorAll("[data-preview]").forEach(function(btn) {
      btn.addEventListener("click", async function() {
        var filename = btn.getAttribute("data-preview");
        var result = await api.media.previewArticle(filename);
        if (!result.ok) { alert("预览失败: " + result.error); return; }
        var data = result.data;
        window.drawer.open([
          '<div class="drawer-head"><h2>' + window.dom.escapeHtml(data.title || filename) + '</h2><button data-close-drawer class="icon-button">×</button></div>',
          '<div class="drawer-body"><pre class="preview-text">' + window.dom.escapeHtml(data.content || "") + '</pre></div>'
        ].join(""));
      });
    });

    var libRoot = root.querySelector("#mediaResourceLibraryRoot");
    if (libRoot && resourceLib) {
      resourceLib.bind(libRoot, function() {
        rerender();
      });
    }
  }

  return { load: load, render: render, bind: bind };
};

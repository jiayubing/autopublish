window.createPlatformWorkbench = function(api) {
  var queue = [];
  var platforms = [];
  var selectedArticles = [];
  var selectedPlatformIds = [];

  async function load() {
    var result = await api.platforms.getQueue();
    if (result.ok && result.data) {
      queue = result.data.queue || [];
      platforms = result.data.platforms || [];
    }
  }

  function render() {
    return [
      '<div class="workspace-head">',
      '<h2>其他平台</h2>',
      '<div class="toolbar">',
      '<button id="refreshPlatformQueueBtn" class="secondary">刷新队列</button>',
      '<button id="submitPlatformBtn" class="primary" disabled>提交选中</button>',
      '</div>',
      '</div>',
      '<section class="panel">',
      '<div class="panel-head"><h2>文章队列</h2><span id="platformArticleCount" class="count-pill">' + queue.length + ' 篇</span></div>',
      queue.length === 0 ? '<p class="empty-state">暂无待发文章</p>' : queue.map(function(item, idx) {
        var filename = item.filename || item.filePath || "";
        var platformId = item.platformId || "";
        return '<div class="check-row"><input type="checkbox" data-article-idx="' + idx + '" data-platform-id="' + window.dom.escapeHtml(platformId) + '"><span>' + window.dom.escapeHtml(filename) + '</span><span class="count-pill">' + window.dom.escapeHtml(platformId) + '</span></div>';
      }).join(""),
      '</section>',
      '<section class="panel">',
      '<div class="panel-head"><h2>目标平台</h2></div>',
      platforms.map(function(p) {
        return '<div class="check-row"><input type="checkbox" data-platform-check="' + window.dom.escapeHtml(p.id) + '"><span>' + window.dom.escapeHtml(p.id) + '</span></div>';
      }).join(""),
      '</section>'
    ].join("");
  }

  function bind(root, rerender) {
    root.querySelector("#refreshPlatformQueueBtn").addEventListener("click", async function() { await load(); rerender(); });
    
    var submitBtn = root.querySelector("#submitPlatformBtn");

    function updateSubmitState() {
      selectedArticles = [];
      root.querySelectorAll("[data-article-idx]:checked").forEach(function(cb) {
        selectedArticles.push({ idx: Number(cb.getAttribute("data-article-idx")), platformId: cb.getAttribute("data-platform-id") });
      });
      selectedPlatformIds = [];
      root.querySelectorAll("[data-platform-check]:checked").forEach(function(cb) {
        selectedPlatformIds.push(cb.getAttribute("data-platform-check"));
      });
      submitBtn.disabled = selectedArticles.length === 0 || selectedPlatformIds.length === 0;
    }

    root.querySelectorAll("[data-article-idx], [data-platform-check]").forEach(function(cb) {
      cb.addEventListener("change", updateSubmitState);
    });

    submitBtn.addEventListener("click", async function() {
      var plan = {
        articles: selectedArticles.map(function(sa) { return queue[sa.idx]; }),
        platformIds: selectedPlatformIds
      };
      var result = await api.platforms.buildSelectedPlan(plan);
      if (!result.ok) { alert("构建计划失败: " + result.error); return; }
      window.confirmPanel.open({
        articleCount: (result.data && result.data.taskCount) || 0,
        resourceCount: 0,
        taskCount: (result.data && result.data.taskCount) || 0,
        estimatedTotalPrice: 0,
        blockers: []
      }, async function() {
        var submitResult = await api.platforms.submitSelectedPlan(result.data);
        if (!submitResult.ok) { alert("提交失败: " + submitResult.error); return; }
        alert("提交完成：成功 " + submitResult.data.ok + "，失败 " + submitResult.data.fail + "，跳过 " + submitResult.data.skipped);
        window.drawer.close();
      });
    });
  }

  return { load: load, render: render, bind: bind };
};

window.platformBatchDrawer = {
  open: function(api, payload, onSubmit) {
    var selection = payload || {};
    var articles = selection.articles || [];
    var platformIds = selection.platformIds || [];
    var summary = selection.summary || {};

    window.drawer.open([
      '<div class="drawer-head"><h2>提交确认</h2><button data-close-drawer class="icon-button">×</button></div>',
      '<div class="drawer-body">',
      '<section class="drawer-section">',
      '<div class="panel-head"><h2>选择摘要</h2></div>',
      '<div class="selection-summary">',
      '<span class="count-pill">文章 ' + articles.length + ' 篇</span>',
      '<span class="count-pill">平台 ' + platformIds.length + ' 个</span>',
      '<span class="count-pill">任务 ' + (summary.taskCount || 0) + ' 个</span>',
      '</div>',
      '<div class="batch-table">',
      '<div><strong>文章队列</strong><div class="batch-list">' + articles.map(function(article) {
        return '<div class="check-row"><span>' + window.dom.escapeHtml(article.title || article.filename || "") + '</span><span class="article-meta">' + window.dom.escapeHtml(article.platformId || article.sourcePlatformId || "") + '</span></div>';
      }).join("") + '</div></div>',
      '<div><strong>目标平台</strong><div class="batch-platforms">' + platformIds.map(function(platformId) {
        return '<span class="selected-chip">' + window.dom.escapeHtml(platformId) + '</span>';
      }).join("") + '</div></div>',
      '</div>',
      '</section>',
      '<div class="drawer-actions">',
      '<button id="realSubmitPlatformBatch" class="primary">确认真实提交</button>',
      '<button data-close-drawer class="secondary">取消</button>',
      '</div>',
      '</div>'
    ].join(""), function(root) {
      var button = root.querySelector("#realSubmitPlatformBatch");
      if (!button) return;
      button.addEventListener("click", async function() {
        button.disabled = true;
        try {
          var planResult = await api.platforms.buildSelectedPlan({
            articles: articles,
            platformIds: platformIds
          });
          if (!planResult.ok) {
            alert("构建计划失败: " + planResult.error);
            return;
          }
          var submitResult = await api.platforms.submitSelectedPlan(planResult.data);
          if (!submitResult.ok) {
            alert("提交失败: " + submitResult.error);
            return;
          }
          if (onSubmit) onSubmit(submitResult);
        } finally {
          button.disabled = false;
        }
      });
    });
  }
};

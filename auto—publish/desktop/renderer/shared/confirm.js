window.confirmPanel = {
  open: function(summary, onConfirm) {
    var blockers = summary.blockers || [];
    window.drawer.open([
      '<div class="drawer-head"><h2>提交确认</h2><button data-close-drawer class="icon-button">×</button></div>',
      '<div class="drawer-body">',
      '<p>文章数：' + summary.articleCount + '</p>',
      '<p>媒体选择数：' + summary.resourceCount + '</p>',
      '<p>将生成订单：' + summary.taskCount + '</p>',
      '<p>预计总价：' + summary.estimatedTotalPrice + '</p>',
      blockers.length ? '<pre class="warning-list">' + window.dom.escapeHtml(blockers.join("\n")) + '</pre>' : '',
      '<button id="realSubmitConfirm" class="primary"' + (blockers.length ? ' disabled' : '') + '>确认真实提交</button>',
      '</div>'
    ].join(""), function(root) {
      var button = root.querySelector("#realSubmitConfirm");
      if (button) button.addEventListener("click", onConfirm);
    });
  }
};

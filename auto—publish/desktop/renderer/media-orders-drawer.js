window.ordersDrawer = {
  open: async function(api) {
    var result = await api.orders.getOrders();
    var orders = result.ok ? result.data || [] : [];
    window.drawer.open([
      '<div class="drawer-head"><h2>投稿订单</h2><button data-close-drawer class="icon-button">×</button></div>',
      '<div class="drawer-body">',
      orders.length === 0 ? '<p class="empty-state">暂无订单</p>' : orders.map(function(o) {
        var data = o.result && o.result.data ? o.result.data : {};
        var status = o.status || "unknown";
        return '<div class="order-row"><span>' + window.dom.escapeHtml(o.platform || "") + '</span><span>' + window.dom.escapeHtml(status) + '</span>' + (data.order_nid ? '<button class="secondary sync-order-btn" data-nid="' + window.dom.escapeHtml(data.order_nid) + '">同步</button>' : '') + '</div>';
      }).join(""),
      '</div>'
    ].join(""), function(root) {
      root.querySelectorAll(".sync-order-btn").forEach(function(btn) {
        btn.addEventListener("click", async function() {
          var nid = btn.getAttribute("data-nid");
          btn.disabled = true;
          btn.textContent = "同步中...";
          try {
            await api.orders.syncOrder(nid);
            btn.textContent = "已同步";
          } catch (_) {
            btn.textContent = "失败";
          }
          btn.disabled = false;
        });
      });
    });
  }
};

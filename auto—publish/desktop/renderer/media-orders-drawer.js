window.ordersDrawer = {
  open: async function(api) {
    var result = await api.orders.getOrders();
    var orders = result.ok ? result.data || [] : [];
    var statusLabels = {
      "0": "待审核",
      "1": "审核中",
      "2": "已发布",
      "3": "驳回",
      "4": "退款"
    };
    window.drawer.open([
      '<div class="drawer-head"><h2>投稿订单</h2><button data-close-drawer class="icon-button">×</button></div>',
      '<div class="drawer-body">',
      orders.length === 0 ? '<p class="empty-state">暂无订单</p>' : orders.map(function(order) {
        var pubTime = order.publishedAt || order.submittedAt || "";
        return '<div class="order-row"><span>' + window.dom.escapeHtml(order.title || order.filename || "") + '</span><span>' + window.dom.escapeHtml(order.statusLabel || statusLabels[String(order.statusCode)] || "") + '</span><span style="font-size:12px;color:var(--muted);">' + window.dom.escapeHtml(pubTime) + '</span>' + (order.orderNid ? '<button class="secondary sync-order-btn" data-nid="' + window.dom.escapeHtml(order.orderNid) + '">同步</button>' : '') + '</div>';
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

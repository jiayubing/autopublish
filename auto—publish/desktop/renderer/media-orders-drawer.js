window.ordersDrawer = {
  open: async function(api) {
    var result = await api.orders.getOrders();
    var orders = result.ok ? result.data || [] : [];
    window.drawer.open([
      '<div class="drawer-head"><h2>投稿订单</h2><button data-close-drawer class="icon-button">×</button></div>',
      '<div class="drawer-body">',
      orders.length === 0 ? '<p class="empty-state">暂无订单</p>' : orders.map(function(o) {
        var data = o.result && o.result.data ? o.result.data : {};
        var syncStatus = (o.result && o.result.syncStatus) || (o.result && o.result.syncRaw && o.result.syncRaw.data && o.result.syncRaw.data[0] && o.result.syncRaw.data[0].status);
        var statusMap = { '0': '待审核', '1': '审核中', '2': '已发布', '3': '驳回', '4': '退款' };
        var status = statusMap[String(syncStatus)] || ('状态码:' + (syncStatus || '?'));
        var title = (o.params && o.params.title) || (o.params && o.params.content_file && o.params.content_file.split('\\').pop().split('/').pop()) || '';
        var orderNid = data.order_nid || (o.result && o.result.syncRaw && o.result.syncRaw.data && o.result.syncRaw.data[0] && o.result.syncRaw.data[0].order_nid);
        return '<div class="order-row"><span>' + window.dom.escapeHtml(title) + '</span><span>' + window.dom.escapeHtml(status) + '</span>' + (orderNid ? '<button class="secondary sync-order-btn" data-nid="' + window.dom.escapeHtml(orderNid) + '">同步</button>' : '') + '</div>';
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

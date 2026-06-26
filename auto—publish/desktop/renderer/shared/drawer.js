window.drawer = {
  open: function(html, bind) {
    var root = window.dom.byId("drawerRoot");
    root.innerHTML = '<aside class="drawer">' + html + '</aside>';
    var close = root.querySelector("[data-close-drawer]");
    if (close) close.addEventListener("click", function() { root.innerHTML = ""; });
    if (bind) bind(root);
  },
  close: function() {
    window.dom.byId("drawerRoot").innerHTML = "";
  }
};

(async function boot() {
  var api = window.desktopConsole;
  var workspaces = {
    mediaWorkspace: window.createMediaWorkbench(api),
    platformWorkspace: window.createPlatformWorkbench(api)
  };
  var roots = {
    mediaWorkspace: window.dom.byId("mediaWorkspace"),
    platformWorkspace: window.dom.byId("platformWorkspace")
  };
  var initialized = {
    mediaWorkspace: false,
    platformWorkspace: false
  };

  async function renderWorkspace(id, forceReload) {
    var root = roots[id];
    var workspace = workspaces[id];
    if (!root || !workspace) return;
    if (forceReload || !initialized[id]) {
      await workspace.load();
      initialized[id] = true;
    }
    root.innerHTML = workspace.render();
    workspace.bind(root, function() {
      renderWorkspace(id, true);
    });
  }

  document.querySelectorAll(".nav-item[data-workspace]").forEach(function(button) {
    button.addEventListener("click", function() {
      var id = button.getAttribute("data-workspace");
      document.querySelectorAll(".nav-item").forEach(function(item) {
        item.classList.toggle("active", item === button);
      });
      document.querySelectorAll(".workspace").forEach(function(panel) {
        panel.classList.toggle("active", panel.id === id);
      });
    });
  });

  api.batch.onState(function(payload) {
    window.dom.byId("globalStatus").textContent = payload.isBatchRunning ? "运行中" : "空闲";
  });

  await renderWorkspace("mediaWorkspace", true);
  await renderWorkspace("platformWorkspace", true);
})();

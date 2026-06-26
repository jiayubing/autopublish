(async function boot() {
  var api = window.desktopConsole;
  var workspaces = {
    mediaWorkspace: window.createMediaWorkbench(api),
    platformWorkspace: window.createPlatformWorkbench(api)
  };

  async function renderWorkspace(id) {
    var root = window.dom.byId(id);
    var workspace = workspaces[id];
    if (!root || !workspace) return;
    await workspace.load();
    root.innerHTML = workspace.render();
    workspace.bind(root, function() {
      renderWorkspace(id);
    });
  }

  document.querySelectorAll(".nav-item[data-workspace]").forEach(function(button) {
    button.addEventListener("click", async function() {
      var id = button.getAttribute("data-workspace");
      document.querySelectorAll(".nav-item").forEach(function(item) {
        item.classList.toggle("active", item === button);
      });
      document.querySelectorAll(".workspace").forEach(function(panel) {
        panel.classList.toggle("active", panel.id === id);
      });
      await renderWorkspace(id);
    });
  });

  api.batch.onState(function(payload) {
    window.dom.byId("globalStatus").textContent = payload.isBatchRunning ? "运行中" : "空闲";
  });

  await renderWorkspace("mediaWorkspace");
})();

@echo off
setlocal
if defined npm_node_execpath (
  set "AUTO_PUBLISH_NODE_EXEC_PATH=%npm_node_execpath%"
  set "NODE_EXE=%npm_node_execpath%"
) else (
  set "AUTO_PUBLISH_NODE_EXEC_PATH=node"
  set "NODE_EXE=node"
)
set "PROJECT_ROOT=%~dp0.."
"%NODE_EXE%" "%PROJECT_ROOT%\node_modules\electron\cli.js" "%PROJECT_ROOT%"

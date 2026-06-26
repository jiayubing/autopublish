@echo off
setlocal
if defined npm_node_execpath (
  set "NODE_EXE=%npm_node_execpath%"
) else (
  set "NODE_EXE=node"
)
"%NODE_EXE%" "%~dp0..\desktop\worker\run-task.js" snapshot

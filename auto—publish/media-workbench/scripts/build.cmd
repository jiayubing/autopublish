@echo off
setlocal
if defined npm_node_execpath (
  set "NODE_EXE=%npm_node_execpath%"
) else (
  set "NODE_EXE=C:\Program Files\nodejs\node.exe"
)
"%NODE_EXE%" "%~dp0..\node_modules\vite\bin\vite.js" build

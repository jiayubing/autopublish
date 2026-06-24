@echo off
setlocal
set "AUTO_PUBLISH_NODE_EXEC_PATH=%npm_node_execpath%"
"%npm_node_execpath%" "%~dp0..\desktop\node_modules\electron\cli.js" "%~dp0..\desktop"

# AutoPublish 应用目录

本目录包含 Electron 主进程 desktop、业务 src、React renderer media-workbench 和独立 auth-server。入口为 desktop/main.js；npm run desktop 会构建 preload 后启动本地 Electron，renderer 修改需另运行 build:renderer。

[启动与总导航](../README.md) · [开发及测试选择](../docs/development.md) · [配置与运行](../docs/operations.md) · [业务 owner](../docs/architecture.md)。实际命令以[package.json](package.json)为准；[鉴权服务](auth-server/README.md)有独立环境与部署步骤。

首次启动选择内容库；应用配置、凭据和浏览器会话不属于内容库。测试用合成数据，不把真实客户、账号或生产数据库用于默认 smoke。

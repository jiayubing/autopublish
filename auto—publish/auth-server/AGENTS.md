# Auth-server local instructions

本文件继承仓库根目录和 `auto—publish/AGENTS.md` 的通用规则，只适用于独立的 `auth-server/` 鉴权服务。

## 阅读入口

- 先读本目录 `README.md` 的入口和当前任务直接相关的小节，再读直接相关的 `package.json`、`src/`、`migrations/` 和测试；不要为局部任务顺序通读整个 README。
- 代理源地址问题才读取 `docs/proxy-source-manual-acceptance.md`；其他任务不要顺带读取桌面应用的文章生命周期、投稿、订单或 Renderer 文档。
- 数据模型事实由本服务的 SQLite migration、schema 相关源码和行为测试共同证明；不要从桌面 workspace 或根业务词汇推导鉴权字段。

## 安全与边界

- 本服务只处理认证、session、entitlement 和最小审计事实，不接收客户内容、文章、模板、队列、Cookie 或桌面 workspace 路径。
- schema 变更必须通过正式 migration；不要手改运行期数据库、生产数据或部署文件。
- 本地测试使用合成凭据和隔离数据库。SSH、真实账号、服务器、Cloudflare/TLS、部署、备份恢复和生产迁移均需要本次明确授权。
- 日志和诊断不得包含密码、token、Cookie、数据库行、原始请求头或敏感路径。

## 验证

从 `auto—publish/auth-server/` 运行 `node --test tests/*.test.js` 或当前改动对应的更窄测试；不要从桌面应用目录复制测试结论。

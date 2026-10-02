# AutoPublish

AutoPublish 是本地 Electron 内容生产与投稿应用，管理客户资料、知识库、GEO 调研、文章生成、普通平台投稿和网站媒体订单。客户内容保存在可迁移的内容库中；应用配置、凭据、浏览器会话与安装目录分离。

## 从这里开始

| 想了解什么 | 直接入口 |
| --- | --- |
| 客户、知识库、问题与生成 | [内容生产产品说明](docs/product/knowledge.md) |
| 文章库、投稿、订单与人工核对 | [投稿产品说明](docs/product/publishing.md) |
| 模块、事实 owner 与设计理由 | [架构](docs/architecture.md) |
| 本地开发、代码入口、测试选择 | [开发](docs/development.md) |
| 配置、运行、故障和发布 | [运维](docs/operations.md) |
| 新模型、平台与能力接入 | [扩展](docs/extensions.md) |
| 进行中、阻塞与明确延期事项 | [剩余工作](docs/work.md) |
| 自动化修改规则 | [AGENTS](AGENTS.md) |

## 最短开发启动

在 Windows PowerShell 中进入应用目录，首次安装依赖并构建：

```powershell
cd 'auto—publish'
npm ci
npm --prefix media-workbench ci
npm run build:renderer
npm run build:preload
npm run desktop
```

Node/npm 基线以[当前 CI](.github/workflows/ci.yml)为准。首次启动选择独立内容库；真实接口在设置中配置。独立鉴权服务的环境和启动见[服务 README](auto—publish/auth-server/README.md)。

文档按主题更新正文，不追加“新规则覆盖旧规则”。已完成任务只把稳定结论写回对应主题，过程记录由 Git 历史保留；只有仍需多步协调的任务留在 docs/plans。不要把 .scratch、提示词或测试夹具当普通文档批量清理。

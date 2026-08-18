# AutoPublish desktop application instructions

本文件继承仓库根目录 `AGENTS.md`，只补充 `auto—publish/` 桌面应用目录的局部阅读和边界规则。

## 阅读入口

- 先读本目录 `README.md` 的入口和当前任务直接相关的命令/章节，再读 `package.json` scripts、源码和测试；不要为局部任务顺序通读整个 README。
- 产品行为只按需读取根 `ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md` 的直接相关章节；不要为局部 Renderer、构建或类型任务通读文章生命周期文档。
- 平台接入优先读根 `docs/ADDING-BUILTIN-PUBLISHING-PLATFORM.md`；历史 Wave、handoff 和 archive 默认不读。
- `auth-server/` 是独立鉴权服务；进入该目录后以其局部 `AGENTS.md` 和 README 为入口，不读取桌面应用的文章、队列或付费历史。

## 局部边界

- `src/`、`desktop/`、`media-workbench/` 和 `tests/` 是实现与行为验证范围；先找现有 owner，再修改直接调用链。
- `work/`、`logs/`、`failed/`、`release-*`、`.playwright-cli/`、`build/` 和生成的 `dist/`/打包目录是运行期或生成物，默认不读、不手改、不提交。
- 不把真实账号、Cookie、客户内容、workspace、付费或发布操作引入自动化测试；真实外部操作遵守根规则的逐次授权和停止条件。

## 验证

从本目录运行与改动直接相关的 `npm` scripts；完整命令和 CI 基线以本目录 `package.json` 与根执行协议为准。不要为了局部改动自动运行或复制整套历史 Wave evidence。

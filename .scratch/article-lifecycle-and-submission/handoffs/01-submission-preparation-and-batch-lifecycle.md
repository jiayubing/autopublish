# Ticket 01 交接记录：投稿准备与批次生命周期

## 结果

投稿服务现在由 `content-submission-application.js` 提供稳定门面。门面只组合并绑定应用操作，并在批次创建结果边界剥离队列文件路径；IPC 仍通过既有 `submission-contracts` 投影结果，文件路径、SQLite 细节和 Renderer 类型不会进入应用或 typed IPC 响应。

最小调用链为：

```text
IPC / 内容应用调用方
  -> content-submission-service
  -> content-submission-application
  -> operational-content-submission-service
       -> target catalog -> submission preflight -> batch planner
       -> batch persistence -> OperationalStore / queue pair writer
       -> batch reader -> OperationalStore read port
```

## 已迁出职责

- `submission-target-catalog.js`：统一普通平台目标筛选、平台能力读取和媒体目标发现。
- `submission-preflight.js`：只回答文章是否满足入队资格及稳定原因码，不读写数据库、不创建文件、不访问远端。
- `submission-batch-planner.js`：执行输入与账号绑定校验、文章读取、目标展开、资格预检和确定性的内容哈希/文件名计划，不产生持久化副作用。
- `submission-batch-persistence.js`：负责批次写入、队列文件对原子写入、账号绑定载荷、失败时的文件回收和队列路径安全校验。
- `submission-batch-reader.js`：负责批次和批次项的只读投影、按客户读取和单批次读取。

旧服务中的第一套影子 `previewCancelBatch` / `cancelBatch` 实现也已删除；取消、清理、文章删除协调、断点恢复和失败重试仍由旧服务保留，交由 ticket 02 迁移。

## 公开应用操作

门面保留既有操作名称和调用契约：`previewExport`、`exportArticle`、`listPlatforms`、`previewBatch`、`createBatch`、`listBatches`、`getBatch`，以及现有取消、清理、文章删除协调、残留处理、重试和归档关注项操作。未改变 Renderer 文案、IPC channel、远端投稿流程或旧多目标输入行为。

## 依赖方向

- 目标目录、预检和规划只依赖领域策略、文章读取端口及纯文章 Markdown 渲染函数。
- 批次持久化只依赖 `OperationalStore` 公共端口、队列文件写入端口和目标目录；不导入 SQLite 内部模块。
- 批次读取只依赖 `OperationalStore` 读端口，不拼接 SQL。
- Renderer、供应商适配器和 IPC 合同没有反向依赖新应用模块。

## 文件规模

| 文件 | 行数 | 责任 |
| --- | ---: | --- |
| `desktop/services/content-submission-application.js` | 71 | 稳定应用门面 |
| `desktop/services/submission-target-catalog.js` | 49 | 投稿目标目录 |
| `desktop/services/submission-preflight.js` | 19 | 投稿资格端口 |
| `desktop/services/submission-batch-planner.js` | 177 | 批次规划 |
| `desktop/services/submission-batch-persistence.js` | 141 | 批次持久化与队列文件写入 |
| `desktop/services/submission-batch-reader.js` | 53 | 批次只读查询 |
| `desktop/services/operational-content-submission-service.js` | 1689 | 剩余执行、清理和恢复职责；较基线 2031 行减少 342 行 |

新生产模块均低于 300 行，且没有新增模块长度例外；旧服务的既有上限已收紧到 1689 行。

## 验证

- 投稿资格、typed IPC、生成交接、SQLite 批次、普通投稿链、账号绑定、媒体暂存和文章删除回归测试通过。
- 新增投稿准备/批次生命周期 seam 测试通过。
- ESLint、Phase 8 依赖/OperationalStore/模块规模/打包边界门禁通过。

# 重构工程进度账本

> 本文件由每个阶段执行任务更新。规划完成不代表阶段完成。状态只能使用`NOT_STARTED`、`READY`、`IN_PROGRESS`、`BLOCKED`、`PENDING_HUMAN`、`COMPLETE`。

## 1. 当前程序基线

| 项目 | 当前记录 |
|---|---|
| 原审查代码基线 | `master@e8d817847bab3a9e6020006cab35340f645e527f` |
| 重构规划分支 | `codex/refactor-program` |
| 重构规划commit | `dc5265359ca10a866ccd10e56a84314214b7897f` |
| 活跃worktree | `F:\官媒投稿-refactor` |
| 规划日期 | 2026-07-24 Asia/Shanghai |
| 目标形态 | 文件内容 + workspace SQLite运行状态 + Electron/React/Node |
| 当前可执行阶段 | 阶段0 |
| 普通功能开发 | 冻结 |
| 正式release | 冻结 |

重构worktree已从独立规划commit创建；review、optimization、refactor、ADR和领域词汇已纳入该commit。原工作区`F:\官媒投稿`中用户维护的`auto—publish/docs/...`删除和未跟踪旧文档README没有进入重构分支，也不得由后续任务复制、恢复或清理。阶段0开始时必须重新核验当前HEAD和工作区状态。

## 2. 已冻结的架构决定

| 决定 | 状态 | 权威记录 |
|---|---|---|
| 用户创作内容保持文件化 | ACCEPTED | ADR-0003 |
| 运行协调状态迁入workspace SQLite | ACCEPTED | ADR-0003 |
| 串行阶段、单writer切换、无长期双轨 | ACCEPTED | ADR-0004 |
| 普通平台target包含AccountProfileId | ACCEPTED | `01-target-architecture.md`、CONTEXT |
| Electron/React/Node/Playwright保留 | ACCEPTED | `00-program-charter.md` |
| 诊断默认结构化、无原始整页截图 | ACCEPTED | 阶段4/7计划 |
| 删除死publish-log，不新增原始日志UI | ACCEPTED | 阶段7计划 |
| Media production只允许HTTPS | ACCEPTED | 阶段4/7计划 |

## 3. 阶段状态

| 阶段 | 状态 | 开始commit | 完成commit | 自动验证 | 人工验证 | Handoff |
|---:|---|---|---|---|---|---|
| 0 工程基线 | READY | 阶段0任务开始时记录当前HEAD | — | worktree创建验证通过 | CI ownership待确认 | — |
| 1 领域契约 | NOT_STARTED | — | — | — | — | — |
| 2 OperationalStore | NOT_STARTED | — | — | — | 隔离workspace路径需授权 | — |
| 3 PublicationWorkflow | NOT_STARTED | — | — | — | 迁移副本需授权 | — |
| 4 Platform/Adapters | NOT_STARTED | — | — | — | 平台fixture/测试账号/TLS | — |
| 5 Content生命周期 | NOT_STARTED | — | — | — | 内容迁移副本需授权 | — |
| 6 Renderer/IPC | NOT_STARTED | — | — | — | 可访问性手工smoke | — |
| 7 Auth/Build/Ops | NOT_STARTED | — | — | — | RPO/RTO、TLS、签名、release owner | — |
| 8 Cleanup/Acceptance | NOT_STARTED | — | — | — | 全部release门 | — |

## 4. 当前阶段记录模板

阶段执行时用实际内容替换以下占位，并在完成后保留历史：

```md
### 阶段X：名称

- 状态：IN_PROGRESS
- 开始时间：
- 开始分支/commit：
- 执行任务/线程：
- 用户已有改动：
- 计划内文件范围：
- 已完成工作：
- 未完成工作：
- Interface/schema偏差：
- 测试命令与结果：
- 故障/迁移/回滚证据：
- 人工待办：
- 停止条件是否触发：
- Handoff路径：
- 下一阶段是否READY：否
```

## 5. 测试证据规则

只写“测试通过”无效。每次记录至少包含：

- 命令；
- 测试文件/测试数量；
- pass/fail/skip；
- skip原因；
- 运行环境；
- fixture或隔离workspace类型；
- 故障点；
- 失败时保留的诊断ID或报告路径。

不得把真实投稿、真实数据库恢复、签名或TLS配置写成自动验证。

## 6. 阻塞与重开

- 当前阶段触发停止条件时设为`BLOCKED`，写明唯一阻塞事实和已尝试的安全检查。
- 发现前序interface/schema错误时，把前序阶段从`COMPLETE`改为`IN_PROGRESS`并记录原因；当前阶段不得用兼容wrapper绕过。
- 只缺生产人工验收但代码/自动证据完整时可标`PENDING_HUMAN`；是否允许下一阶段由对应阶段文档决定。
- 阶段8之前不得把整个工程标为`COMPLETE`。

## 7. 最终工程记录

阶段8完成时填写：

- 最终分支/commit：
- Workspace schema版本：
- Auth schema版本：
- Production runtime/controller路径：
- Domain/Application modules：
- Publisher adapters：
- Renderer feature modules：
- 全局测试结果：
- Migration/rollback结果：
- Production package结果：
- 剩余`PENDING_HUMAN`：
- Release状态：
- 普通功能开发状态：


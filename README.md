# 官媒投稿 Refactor / AutoPublish

这个仓库保存 AutoPublish 桌面应用及其文章生命周期、投稿和审计重构资料。

## 从这里开始

1. [AGENTS.md](AGENTS.md)：工程规则、真源优先级和完成标准。
2. [docs/AI-ENTRY.md](docs/AI-ENTRY.md)：按任务类型选择最小阅读集合。
3. [docs/WORK-INDEX.md](docs/WORK-INDEX.md)：当前执行计划和外部授权边界的导航入口。
4. [CONTEXT.md](CONTEXT.md)：业务词汇和禁用称谓。
5. [ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md](ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md)：文章库与投稿中心的产品行为真源。
6. [auto—publish/README.md](auto—publish/README.md)：应用目录、开发命令和应用级说明。

## 文档职责

| 信息 | 唯一主要来源 |
| --- | --- |
| Agent 工作规则 | `AGENTS.md` |
| 业务词汇 | `CONTEXT.md` |
| 用户可观察行为 | 产品规格和对应合同 |
| 当前波次调度与 gate | Wave Plan |
| 单项实施范围 | `issues/` / `maintenance/` 下的对应合同 |
| 执行方式 | `EXECUTION-PROTOCOL.md` |
| 审计方式 | `AUDIT-PROTOCOL.md` |
| 历史实施与验证证据 | `handoffs/` 和 Git |

不要通过阅读整个 `.scratch/` 目录来了解项目。先读 [AI-ENTRY](docs/AI-ENTRY.md)，再只打开当前任务所指向的一个计划和直接相关的源码、测试。

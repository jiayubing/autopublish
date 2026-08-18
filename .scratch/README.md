# `.scratch` 资料边界

这个目录保存执行计划、单项合同、审计协议、handoff 和 acceptance evidence。它不是需要全量阅读的项目说明书。

## 读取规则

- 先读根目录 [README.md](../README.md)、[AI-ENTRY](../docs/AI-ENTRY.md) 和 [WORK-INDEX](../docs/WORK-INDEX.md)。
- 只打开当前任务明确指向的一个计划，以及该计划列出的最小阅读集合。
- `handoffs/` 是历史实施和验证证据；顶层 `archive/` 保存已完成的独立计划；业务工作区内的 `archive/` 保存退役规则和旧计划快照；这些目录默认不读。
- `issues/`、`maintenance/` 是单项合同，只有当前调度入口或计划引用时才读。
- acceptance JSON、查询预算和测试清单只在当前验收需要时读取。
- 对大型当前计划先读文件头、当前状态和任务对应章节；只有计划明确要求时才顺序读取全文。

`.scratch` 中的文件即使仍被 Git 跟踪，也不代表它们是当前规则。计划的状态必须结合 `WORK-INDEX.md`、计划自身和当前 Git 状态判断。

# 历史资料归档索引

`.scratch` 保存执行证据，不是日常开发入口。日常只从根 `README.md`、
`docs/AI-ENTRY.md`、`docs/WORK-INDEX.md` 和当前计划进入。

## 当前保留

- `.scratch/client-generation-tasks/CLIENT-GENERATION-TASKS-PLAN.md`：当前实施计划。
- `.scratch/article-lifecycle-and-submission/ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md`、
  `EXECUTION-PROTOCOL.md`、`AUDIT-PROTOCOL.md`：仍有未完成外部 gate 时保留。
- `.scratch/article-lifecycle-and-submission/acceptance/*.json`：被 benchmark/验收脚本直接读取，不能移动或删除而不同时修改脚本。

## 历史归档候选

以下目录只保留历史 provenance，不作为当前调度入口：

- `.scratch/article-lifecycle-and-submission/handoffs/`
- `.scratch/article-lifecycle-and-submission/issues/` 中已完成 Ticket
- `.scratch/article-lifecycle-and-submission/maintenance/` 中已完成项
- `.scratch/article-lifecycle-and-submission/archive/`
- `.scratch/archive/`
- `.scratch/client-groups/`
- `.scratch/complexity-reduction/`
- `.scratch/complexity-follow-up/`
- `.scratch/content-production/`
- `.scratch/article-generation-and-lieju-remediation/`
- `.scratch/platform-account-profile-p1/`

归档时每个计划只保留一份 closure 摘要（状态、最终提交、验证命令、剩余风险），
其余 handoff 和过程日志移至 Git tag、Release 或独立 provenance 分支。删除或移动前必须运行：

```text
rg -n "\.scratch|acceptance/" auto—publish .github docs README.md
```

并确认没有运行时脚本、CI 或当前计划依赖目标文件。

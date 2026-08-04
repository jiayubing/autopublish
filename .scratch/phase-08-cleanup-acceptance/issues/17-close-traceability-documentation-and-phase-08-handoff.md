# 17 — 完成追踪矩阵、文档与 Phase 8 交接

**What to build:** 当前 production module map、schema、迁移/恢复、运维/release 文档、37 条 finding、29 个 OPT、自动/人工证据和 Phase 8 handoff 全部与代码现实一致；工程重构完成、功能开发准入和正式 production release 分别作出诚实判断。

**Blocked by:** 16 — 执行功能开发准入模拟

**Status:** ready-for-agent

## 必读输入

- Tickets 01–16 的 handoff、evidence、删除清单、module map 和 admission simulation 结果。
- `docs/refactor/12-traceability-matrix.md`、`13-progress-ledger.md`、`14-handoff-template.md`。
- 原 review findings、OPT verification/risk decisions、当前 README/CONTEXT/ADR、运维、备份、迁移和 release 文档。
- 最新 source/package evidence manifest 与人工 gate 清单。

## 开始门禁

1. 确认 Ticket 16 完成，所有自动失败都已解决或已正式重开前序阶段；有未解决自动失败时不得关闭 Phase 8。
2. 记录最终分支、HEAD、工作区、staged/unstaged、schema versions 和 artifact/evidence source state。
3. 从 production source 重新生成最终 module/owner/dependency/legacy/package 摘要，不能复制早期数字。

## 执行过程

1. 更新项目地图和架构图，描述真实 Renderer → feature → typed IPC → application/domain → store/adapter 链及唯一 writer/lifecycle owner。
2. 清理 CONTEXT，只保留业务语言；核对 ADR 状态，实施不一致的决策标为 superseded，而非改写历史审查记录。
3. 更新 README、运维、备份、迁移、release、故障处理命令，确保命令来自已执行自动证据；人工命令明确 owner/前置和风险。
4. 对 37 条 finding 和 29 个 OPT 逐项写最终 evidence、重新设计说明或人工状态，不允许空白/模糊“已处理”。
5. 创建 `docs/refactor/handoffs/phase-08.md` 和最终工程报告，完整填写 commit、module map、schemas、migration tools、tests、deletions、技术债、release blockers 与首个新功能模板。
6. 判断工程状态：全部自动条件和 admission simulation 通过时可将架构重构标为 `COMPLETE` 并开放普通本地功能开发；正式 release 只在独立人工 gates 完成后开放。
7. 若人工账号、媒体 HTTP/TLS、签名、installer、真实 Auth 恢复/RPO/RTO 未完成，保持 `PENDING_HUMAN` / `BLOCKED_RELEASE`，不能被自动 evidence 覆盖。
8. 最后运行全局门禁并检查 diff 只包含 Phase 8 获准范围；提交仍需用户单独授权。

## 文档边界

- 原审查记录保持历史原貌；只通过追踪矩阵和最终报告记录 disposition/evidence。
- 文档不含真实客户正文、账号、Cookie、API key、绝对用户路径、原始 DOM/error 或截图。
- `COMPLETE` 表示工程自动收口，不等于签名制品或正式 production release 已批准。

## 验收标准

- [ ] 所有旧 production seam/writer 清单为 0 引用并在最终报告有证据。
- [ ] 全局依赖、唯一 owner/writer、module size/depth 和 package gates 由 CI 保护。
- [ ] 37 条 finding、29 个 OPT 全部有最终证据、设计说明或明确人工状态。
- [ ] 全部自动验收绿色且无未解释 skip；三项功能准入模拟通过。
- [ ] 项目地图、架构、CONTEXT、ADR、README、运维/migration/release 文档与 production 现实一致。
- [ ] Phase 8 handoff 独立可读，包含基线/完成 commit 占位、schemas、测试、删除、风险、技术债和下一开发模板。
- [ ] 工程完成与正式 release 状态分别判断，人工项绝不伪装通过。

## 必跑验证

- Root/Auth 全量、links/security、migration/backup/capacity、diagnostics/media transport、architecture/inventory、packaging/offline production smoke。
- lint、三套 typecheck、format、Renderer/preload build、test discovery、legacy/package/sensitive absence、`git diff --check`。
- 校验 progress ledger、traceability matrix、handoff、final report 和 evidence manifest 彼此状态一致。

## 停止条件与交接

- 存在旧 writer/影子 runtime/长期 compatibility adapter、无法归属状态、迁移/回滚不可恢复、自动测试需真实数据或 admission simulation 失败时，保持 `IN_PROGRESS` 并重开所属阶段。
- 只有全部自动完成条件满足才写工程 `COMPLETE`；人工 release gate 未完成时正式 release 继续 `BLOCKED_RELEASE`。
- 不自动提交或推送；用户明确授权后仅提交 Phase 8 范围文件。


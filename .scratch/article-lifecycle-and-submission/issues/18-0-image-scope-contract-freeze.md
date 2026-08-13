# 18-0 — 图片瘦身合同与 Owner Map 冻结

**Goal:** 在不写 production code 的前提下，把 Ticket 18 的最终产品语义、现有公开合同、真实调用链和工作包文件范围冻结，避免后续线程重新发明图片状态机或误改核心 submission/outcome schema。

**Blocked by:** Wave 11 `COMPLETE`；Ticket 17 `COMPLETE`；Ticket 18 umbrella 当前版本。

## 本线程职责

1. 读取当前 HEAD 的 Ticket 17 handoff、`client-image-*` 模块与测试，确认随机/不足/零图行为仍满足 umbrella。
2. 读取 08/09 当前公开 `PreparedSubmission`、`preparedSubmissionEvidenceV1`、`publicationEvidenceV1`、submission-start 与 outcome 合同。
3. 读取真实普通平台链路：queue admission/group persistence → claim → preparation port → `beginRegularRemoteSubmission` → submit → outcome。
4. 建立文件/owner map，明确 18-A–D 哪些文件可改、哪些只能读。
5. 核对 downstream 19–21 已使用瘦身语义：无 `preSubmitImageDecisionRequired`、无 retry/replace/continue-text-only UI flow。
6. 形成 `handoffs/18-0-image-contract-owner-map.md`，记录 integration HEAD、合同 identity、直接测试清单和后续包停止条件。

## 禁止跨界

- 不修改 production source、schema、migration、Renderer 或平台 adapter。
- 不新增 V2 evidence、图片 DTO 公共版本、generic result union 或 compatibility shim。
- 不把 Ticket 17 改回 pending，不重构已经验收通过的图片库。
- 不执行真实账号登录、图片上传或发布。

## Acceptance criteria

- [ ] handoff 明确记录完全随机、同篇不重复/跨篇可重复、N>M 用 M、0 图继续文字、图片失败自动降级。
- [ ] 证明当前 V1 evidence 已能表达 `text_only|with_images` 且无需新增字段；`decisionKind` 保留但新路径固定 `initial`。
- [ ] 明确 `layoutSlot` 由平台实际准备结果拥有，不再存在 Ticket 18 通用均匀布局 owner。
- [ ] 明确生产图片源必须显式使用专用 `imageDirectoryName`，Ticket 17 默认客户根扫描不得被 production composition 采用。
- [ ] 输出 18-A–D 的互斥 owner/file map；任何共享 owner 只能串行修改。
- [ ] 列出每个包最小定向测试和 escalation 条件；没有 production diff。

## Stop / return conditions

仅当当前 HEAD 的公开 V1 已无法表达上述语义、Ticket 17 随机行为已回归、或真实 owner 与 umbrella 冲突时返回主线程阻塞；普通文件布局变化由本线程更新 owner map 后继续。

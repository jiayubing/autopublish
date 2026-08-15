# 19-0 — 列举网 HTTP 合同与 Owner Map 冻结

**Goal:** 在不写 production code 的前提下，以 Wave 12 最终 integration HEAD 重做实时 inventory，冻结 19-A–G 的公开合同、owner / 文件图、依赖、测试和停止条件。

**Blocked by:** Wave 12 / Ticket 18 `COMPLETE`；Issue 19 umbrella 与列举网 `SUPPORTED` 探索 evidence。

## 最小必读

1. 根 `AGENTS.md`、Wave Plan 的 Wave 13、`EXECUTION-PROTOCOL.md` 和 `AUDIT-PROTOCOL.md`。
2. `issues/19-lieju-image-publication-adapter.md` 及 `handoffs/thread-6-lieju-http-transport-exploration-20260814.md`。
3. 17 最终 resolver 合同、18-D/E 最终 prepare seam handoff、08/09 当前 `PreparedSubmission` / submission-start / outcome 合同。
4. 列举网 adapter、browser-session lifecycle、runtime composition、package / packaging gate 和直接测试。

## 本包职责

1. 确认当前 HEAD 仍可表达平台派生 body/fingerprint、0–4 张实际成功图片和 `initial` decision，不需新 schema / outcome。
2. 画出真实调用链：account/session → HTTP prepare → body/image manifest → submission-start → 单次 POST → outcome。
3. 冻结 19-A–G 互斥 owner / 文件围栏；同一 shared owner 只允许严格串行修改。
4. 确认 HTML parser 和 Playwright request API 的显式生产依赖、Node/CI/打包基线与许可证边界。
5. 冻结直接测试清单、故障矩阵和最终验收清单，生成 `handoffs/19-0-lieju-http-owner-map.md`。

## 禁止跨界

- 不修改 production source、package manifest、schema、Renderer 或运行状态文件。
- 不执行真实登录、POST、上传或发布。
- 不重新设计 Ticket 17/18 图片选择、Ticket 09 outcome 或文章库 owner。

## Acceptance criteria

- [ ] handoff 列出 A–G 的实际 owner、允许文件、只读依赖、定向测试和 escalation 条件。
- [ ] 确认 HTTP POST 调用是唯一远端 mutation 边界，且 fallback 只发生在该边界前。
- [ ] 确认正文派生表示不回写文章库，实际 body 与 evidence/fingerprint 一致。
- [ ] 确认每个后续包不需同时重写两个 shared writer；若不成立，在本包继续拆分。

## 停止条件

只在公开 V1 无法表达实际提交证据、storageState 存在不可协调多 writer，或 Issue 19 与 Wave 12 最终 seam 实质冲突时返回主任务。

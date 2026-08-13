# 18-E — 随机配图准备 Integration / Audit / Closure

**Goal:** 对 18-A–D 最终组合 diff 做一次 Ticket 18 级别的定向 Primary Audit、blocking remediation、bounded re-audit 和最终 clean-HEAD gate，证明瘦身语义完整且没有破坏纯文本主链。

**Blocked by:** 18-D `COMPLETE`。

## 本线程职责

1. 从包含 18-A–D 的 clean integration HEAD 开始，不重做历史 Ticket 17/08/09 full audit。
2. 执行一次 combined Primary Audit，范围只覆盖：queue imageCount、旧组迁移、application/UI config、专用客户图片目录、claim-time random plan、best-effort prepare seam、submission boundary。
3. 修复 P0/P1 和直接违反本 umbrella acceptance 的 blocking P2；修复后只做 bounded re-audit。
4. 运行 Ticket 18 最终矩阵：0/1/5、N>M、0图、客户隔离、连续跨篇复用、目录缺失、损坏文件、扫描异常、旧组迁移、重启、UI配置、plan fault、纯文本回归、边界前后 crash。
5. 静态/合同检查不存在新生产路径的 `preSubmitImageDecisionRequired`、图片 retry/replace UI、通用均匀布局 owner、平台 DOM/Python 泄漏。
6. 更新 umbrella/Wave Plan/handoff 当前状态；不进入 19–21 实施，也不执行真实图片上传。

## 禁止跨界

- 不借 closure 实现某个平台图片上传。
- 不扩大为全库架构审计或完整历史 Wave 重审。
- 不修改 Ticket 17 随机策略为“近期不重复/用后删除”。
- 不执行真实账号、真实发布或付费操作。

## Acceptance criteria

- [ ] combined audit 明确 PASS，所有 blocking finding 已关闭并有 bounded re-audit evidence。
- [ ] 最终行为矩阵证明：图片问题最多导致 0..N 张，文字投稿仍继续；不存在图片失败→article failed/group paused 的新路径。
- [ ] 旧组=0、新组默认1、配置继承/修改、重启稳定均有公开行为证据。
- [ ] production 只扫描客户专用图片目录，跨客户隔离和路径安全继续通过。
- [ ] 每篇在实际 claim/prepare 时随机；同篇不重复、跨篇可重复，不存在“已使用图片”持久事实。
- [ ] 新生产代码不产生图片 decision flow；V1 schema 未扩张且 `decisionKind=initial`。
- [ ] 纯文本 Ticket 08/09/25-C 相关定向回归通过；边界后 unknown 仍 uncertain 且不重复正文投稿。
- [ ] final handoff 记录所有工作包 commit/provenance（若获授权）、测试命令与结果、未运行项及原因、owner/file map、剩余平台外部验证 gate。
- [ ] Wave 12 只有在本包 final clean-HEAD gate 通过后才能标记 `COMPLETE`；随后才允许按平台探索 19–21。

## Stop / return conditions

只有发现权威 SPEC 与最终实现存在无法局部修复的产品冲突、或需要真实平台操作才能判定 Wave 12 通用合同时才返回主线程；平台上传能力未知不是 Ticket 18 blocker，而是 19–21 的独立 gate。

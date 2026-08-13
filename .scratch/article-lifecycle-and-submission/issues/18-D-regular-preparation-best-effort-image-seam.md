# 18-D — 普通投稿 Prepare Seam 与 Best-effort 图片接线

**Goal:** 把 18-C 的安全 image plan 接入现有 `preparePlatformSubmission` 调用链，同时保持 08/09 提交边界不变，并为 19–21 提供唯一平台图片输入 seam。

**Blocked by:** 18-C `COMPLETE`。

## 本线程职责

1. `regular-platform-preparation-port` 在账号初次核验后、adapter prepare 前获取当前文章 image plan；获取失败按 18-C 规则退化为空计划。
2. 以窄、稳定方式将 `imagePlan` 交给 adapter prepare（例如第二参数或封闭 command extension，最终形式由 18-0 inventory 决定）；executor 不检查 platformId 分支。
3. 当前尚未实现图片能力的 adapter 必须继续安全产出既有纯文本 `PreparedSubmission`；18-D 不在通用层伪造 with-images evidence。
4. 19–21 后续 adapter 对选中图片进行真实上传/插入后，只有实际成功图片进入同一个 `preparedSubmissionEvidenceV1.images`；全部失败则合法 `text_only`。`decisionKind` 始终 `initial`。
5. 删除/禁止旧 Ticket 18 所设想的 `preSubmitImageDecisionRequired`、`retry_preparation`、`replace_image`、`continue_text_only` 调用链；若这些 enum 仍存在 V1 validator，仅作为历史兼容，不由新路径发出。
6. 任何图片准备失败只能减少最终成功图片集合；不得把本来正常的文字文章映射为 `article_rejected`、`group_blocked` 或暂停其他队列组。账号/平台本身的真实错误仍按 08/09 原规则处理。
7. 保持严格顺序：`prepare (含图片 best-effort) → freeze manifest / beginRegularRemoteSubmission → submitPreparedPublication`。manifest 冻结后禁止重新选图、补图或改正文。
8. 增加 seam contract、纯文本回归、image-plan fault、边界前 crash、边界后 uncertain 和 adapter capability isolation 测试。

## Owner / 允许修改

- `desktop/services/regular-platform-preparation-port.js`
- 直接 executor/orchestrator seam（仅当真实调用链需要）
- domain 公开合同仅允许复用/补充 contract tests；原则上不改 schema
- 当前三平台 adapter 只允许最小签名兼容，不实现真实图片 DOM/API/Python 逻辑
- 对应 Ticket 08/09 direct integration tests

## 禁止跨界

- 不修改 queue `imageCount` 持久化或 Renderer。
- 不实现列举网/头条/河畔具体上传；由 19–21 完成。
- 不做通用均匀布局，不解析平台编辑器。
- 不创建图片 retry queue、decision table、人工 resolution 或第二 outcome union。
- 不在 submission-start 之后重跑 image plan。

## Acceptance criteria

- [ ] prepare port 对每个 claim 最多获取一次最终候选 image plan，并把它交给 adapter；无 platform 分支。
- [ ] image-plan service 抛出可恢复图片错误时 adapter 仍收到空 plan/等价 text-only 输入，正文 prepare 继续。
- [ ] 未实现图片的现有 adapter 行为与 Ticket 25 纯文本 acceptance 不变。
- [ ] seam 允许 19–21 仅在各自 adapter 内把实际成功图片映射为同一 V1 `with_images` evidence；通用层不伪造成功。
- [ ] 新路径永远不返回/暴露 `preSubmitImageDecisionRequired`，不触发 retry/replace/continue-text-only UI 动作，`decisionKind=initial`。
- [ ] 图片部分/全部失败的假 adapter 测试证明文字仍可进入正常提交；只有真实账号/平台/正文错误按既有规则失败。
- [ ] 在 `beginRegularRemoteSubmission` 前 fault 可安全结束本次 prepare；边界后 fault 只按 09 `uncertain`，不会重新随机或再次提交正文。
- [ ] PreparedSubmission 仍不可序列化/日志化，image plan/绝对路径不进入持久 evidence；最终 evidence 只含安全 fingerprint + layoutSlot。
- [ ] Ticket 08/09 定向回归和新 seam tests PASS；handoff 明确 19–21 唯一接入点。

## Stop / return conditions

若接入 image plan 必须改变 08/09 已冻结的 submission-start writer 或 outcome enum，停止并返回主线程；不得在 Ticket 18 内重定义核心发布状态机。

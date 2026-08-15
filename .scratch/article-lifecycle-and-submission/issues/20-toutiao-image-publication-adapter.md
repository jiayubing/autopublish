# 20 — 今日头条图片投稿适配

**What to build:** 按今日头条当前真实图文能力，消费 Ticket 18 的随机 image plan，将可成功处理的图片随正文提交；任意图片失败只减少最终图片数量，全部失败自动纯文本，正文投稿优先。

**Blocked by:** 18 — 普通平台随机配图准备

**Status:** deferred；已移出当前 Wave 13，当前无探索或实施调度

**Scheduling gate:** 本文仅保留为未来独立计划的候选范围，不属于当前 Wave 13。不得因 Wave 13 或 Ticket 19 完成而自动探索、实施或验收；只有用户未来建立独立计划、重新核对当前 Git/平台事实并对今日头条单独明确授权真实能力探索后，才可重新定义调度 gate。

## 执行过程

1. 冻结 `SUPPORTED` 探索得到的上传/插入流程、格式/数量限制、编辑器成功信号和接受证据；未知事实不得猜。
2. 在今日头条 adapter 内建立图片交付深模块；准备期通过 Ticket 17 resolver 临时解析 18 image plan 的稳定图片引用并复核客户边界。
3. 每张图独立 best-effort；上传/插入或验证失败即跳过。0 张成功时继续纯文本。
4. 只有编辑器中实际确认成功的图片进入 `preparedSubmissionEvidenceV1.images`；`deliveryMode` 按实际结果，`decisionKind=initial`，`layoutSlot` 由今日头条实际位置/顺序决定。
5. 图片问题不返回 decision、不暂停组。账号/认证/平台本身明确失败继续使用既有 group/article 分类。
6. manifest 冻结后只允许 `submitPreparedPublication()`；编辑器/会话漂移导致结果无法确定时只返回 `uncertain`，不得重做图片或正文。
7. 假页面覆盖 0–5、N>M、部分/全部图片失败、编辑器图片数量校验、认证错误、提交边界前后 fault。
8. 输出真实今日头条带图验收清单；实施线程不得真实登录/发布。

## 职责边界

- 今日头条图片模块拥有 DOM/API、上传/插入验证、实际图片成功集合与 layoutSlot。
- Ticket 18 只负责随机 image plan；Ticket 17 只负责安全解析；09 只负责 outcome。
- Renderer 不知道今日头条 DOM，也没有逐图恢复动作。

## Acceptance criteria

- [ ] 0–5 image plan 可安全准备，图片不足/失败自动减量直至纯文本。
- [ ] 只有编辑器实际出现的成功图片进入 evidence，失败图片不会被“假记录”。
- [ ] 图片失败不会生成 retry/replace/continue-text-only decision，不影响其他平台组。
- [ ] 账号/认证/平台失败仍与图片失败严格区分。
- [ ] 边界后 unknown 只 uncertain，绝不重新随机或重复正文提交。
- [ ] 本地绝对路径、Cookie、DOM 原文不进入持久事实/日志。
- [ ] 假页面测试 PASS；handoff 包含真实能力限制、best-effort 矩阵和真实验收清单。
- [ ] 前置探索 `SUPPORTED` 且有独立授权；缺少实施后真实验收证据时保持 `USER_EXTERNAL_IMAGE_ACCEPTANCE_REQUIRED`。

## Non-goals

- 不修改列举网、蓝色河畔或网站媒体图片流程。
- 不建立图片用户 decision 状态机。

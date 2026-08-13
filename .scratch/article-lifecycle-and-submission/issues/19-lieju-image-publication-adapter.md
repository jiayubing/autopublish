# 19 — 列举网图片投稿适配

**What to build:** 按列举网当前真实图文能力，消费 Ticket 18 的随机 image plan，将可成功处理的图片随正文提交；任意图片失败只减少最终图片数量，全部失败自动纯文本，正文投稿优先。

**Blocked by:** 18 — 普通平台随机配图准备

**Status:** deferred-until-core-complete；当前不可调度

**Scheduling gate:** Wave 12 `COMPLETE` 后，必须由用户对列举网单独明确授权真实能力探索并得到 `SUPPORTED`。`UNSUPPORTED` / `INCONCLUSIVE` 不创建实施线程且图片入口保持关闭。探索授权不等于实施期真实发布授权；adapter 合并后的真实带图验收需再次单独授权。

## 执行过程

1. 将 `SUPPORTED` 探索证据冻结为列举网图片格式、数量、上传/插入方式、实际成功信号与限制；未知事实不得猜。
2. 在列举网 adapter 内建立图片交付深模块，消费 18 的安全 image plan；通过 Ticket 17 resolver 在准备期临时取得文件路径并再次验证客户边界。
3. 每张图片独立 best-effort：成功则进入最终编辑器/图集和 manifest；失败只记录安全 warning 并跳过。0 张成功时继续纯文本 `PreparedSubmission`。
4. 最终 `preparedSubmissionEvidenceV1` 只记录**实际成功**图片，`deliveryMode=with_images|text_only`，`decisionKind=initial`，`layoutSlot` 反映列举网真实提交位置/顺序。
5. adapter 不返回图片 retry/replace/continue-text-only decision；只有账号/平台本身明确不可用等非图片问题才按既有 `group_blocked/article_rejected` 规则处理。
6. executor 仍按 `prepare → beginRegularRemoteSubmission → submitPreparedPublication`。manifest 冻结后不得换图/补图/降级/重做正文；边界后未知只能 `uncertain`。
7. 使用假页面覆盖 0、1–5、N>M、单图失败、部分失败、全部失败、上传成功但编辑器未落图、账号错误、提交边界前后故障。
8. 输出真实列举网带图验收清单；ticket 线程不得自行登录或发布。

## 职责边界

- 列举网 adapter 拥有该平台上传、插入、实际图片成功集合和 `layoutSlot`。
- Ticket 18 拥有随机选择，不知道列举网 DOM/API。
- Ticket 17 拥有路径边界与 resolver；adapter 不复制扫描逻辑。
- 09 继续拥有最终 outcome；图片失败不是新的 outcome。

## Acceptance criteria

- [ ] 0–5 image plan 均可准备；成功几张 manifest 就记录几张，0 张成功仍可提交正文。
- [ ] 单图/部分/全部图片失败不会生成图片 decision、不会暂停组、不会把文字文章改成失败。
- [ ] 实际成功图片 fingerprint/layoutSlot 与编辑器最终内容一致；失败图片不进入 evidence。
- [ ] 文件上传前重新验证客户边界，日志/持久化无绝对路径/Cookie/DOM 原文。
- [ ] submission-start 前失败可结束 prepare；边界后 unknown 只 uncertain 且不重复正文投稿。
- [ ] 平台 DOM/API 只存在列举网适配边界，通用队列无 platform 分支。
- [ ] 假页面测试 PASS；handoff 包含能力限制、best-effort 矩阵、提交边界和真实验收清单。
- [ ] 前置真实探索结论为 `SUPPORTED` 且有独立授权；未获得实施后真实验收授权时保持 `USER_EXTERNAL_IMAGE_ACCEPTANCE_REQUIRED`。

## Non-goals

- 不修改今日头条、蓝色河畔或网站媒体图片流程。
- 不建立图片重试/换图/人工降级状态机。

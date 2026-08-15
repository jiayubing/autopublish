# 21 — 蓝色河畔图片投稿适配

**What to build:** 按蓝色河畔当前真实编辑器/Python 运行时能力，消费 Ticket 18 的随机 image plan，将可成功处理的客户图片随正文提交；图片失败自动减量或纯文本，正文投稿优先。

**Blocked by:** 18 — 普通平台随机配图准备

**Status:** deferred；已移出当前 Wave 13，当前无探索或实施调度

**Scheduling gate:** 本文仅保留为未来独立计划的候选范围，不属于当前 Wave 13。不得因 Wave 13 或 Ticket 19 完成而自动探索、实施或验收；只有用户未来建立独立计划、重新核对当前 Git/平台事实并对蓝色河畔单独明确授权真实能力探索后，才可重新定义调度 gate。

## 启动约定

- 先清点并移除/替代现有 `hepan_publish.py` 中“平台目录 + 同名图片 + 单图随机段落”的旧图片来源，不能与客户随机图片池并存。
- Python/浏览器只接收本次 Ticket 18 image plan 对应的客户图片，不再自行扫描 `input/hepan/images` 或按文章文件名找图。

## 执行过程

1. 冻结 `SUPPORTED` 探索得到的蓝色河畔上传能力、payload、编辑器插入方式、格式/数量限制和成功信号；未知事实不得猜。
2. 建立窄版本化 Python/浏览器图片桥接；准备期通过 Ticket 17 resolver 解析 18 image plan，并在 Node 边界复核客户文件。
3. 每张图片独立 best-effort；桥接/上传/插入失败只跳过该图片，全部失败继续纯文本。
4. 只有实际成功图片进入最终 `preparedSubmissionEvidenceV1`；`deliveryMode` 按实际结果、`decisionKind=initial`、`layoutSlot` 反映蓝色河畔真实位置/顺序。
5. 图片失败不返回用户 decision。Python runtime/会话/认证/平台本身明确不可用仍按既有平台错误分类。
6. `beginRegularRemoteSubmission` 后 bridge 或平台结果未知只 `uncertain`；不得因图片 best-effort 重新启动 Python、重选图或重放正文。
7. 假运行时覆盖旧图片源 absence、0–5、N>M、部分/全部失败、payload、安全路径、运行时缺失、提交边界前后 fault。
8. 输出实施后真实蓝色河畔带图验收清单；ticket 线程不得真实登录/发布。

## 职责边界

- Ticket 18 拥有客户随机选择；Ticket 17 拥有路径安全；蓝色河畔 adapter/bridge 拥有 Python payload、上传/插入和实际 layoutSlot。
- Python 不扫描客户目录，不决定随机策略，不产生 queue/outcome。
- 旧 `input/hepan/images + 同名文件` 逻辑必须退出生产发布路径，避免双重图片来源。

## Acceptance criteria

- [ ] 生产蓝色河畔发布不再自行从旧平台图片目录找同名图片；唯一图片来源是 18 image plan。
- [ ] 0–5、N>M、部分/全部图片失败均可继续文字提交；失败图片不进入 evidence。
- [ ] 图片失败无 retry/replace/人工降级 decision；runtime/认证/平台错误分类仍明确。
- [ ] Node↔Python 契约窄且版本化，不泄漏 Cookie/不必要绝对路径到日志/持久事实。
- [ ] 边界后 unknown 只 uncertain，不重新随机、不重复正文。
- [ ] 假运行时测试 PASS；handoff 包含旧逻辑移除证据、桥接合同、best-effort 矩阵和真实验收清单。
- [ ] 前置探索 `SUPPORTED` 且有独立授权；缺少实施后真实验收证据时保持 `USER_EXTERNAL_IMAGE_ACCEPTANCE_REQUIRED`。

## Non-goals

- 不修改列举网、今日头条或网站媒体图片流程。
- 不保留旧平台目录同名图片作为 fallback。
- 不建立图片用户 decision 状态机。

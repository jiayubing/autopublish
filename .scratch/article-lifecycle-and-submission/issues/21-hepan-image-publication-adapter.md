# 21 — 蓝色河畔图片投稿适配

**What to build:** 按蓝色河畔当前编辑器和运行时要求，将 18 准备的本地随机图片随正文提交，并保持 Python/浏览器传输细节封装在该平台适配边界。

**Blocked by:** 18 — 普通平台队列组图片准备

**Status:** ready-for-agent

## 启动约定

- 只修改蓝色河畔平台适配边界；先检查现有 Python payload、浏览器会话和 Markdown/HTML 转换契约。
- 不假定它与列举网或今日头条采用相同上传方式。

## 执行过程

1. 确认蓝色河畔的图片能力、传输载荷、编辑器插入方式和可验证成功信号。
2. 为阶段一 `preparePlatformSubmission` 建立平台图片交付子模块，将安全图片引用转换为平台所需输入、完成上传/插入，并返回符合 08/18 合同的进程内 `PreparedSubmission`；safe manifest 精确反映最终标题、正文、图片布局和降级决定，Python payload/浏览器会话只隐藏在 capability 内部，不成为通用 DTO。
3. 上传/插入前后验证文件边界、预期数量和正文顺序；平台运行时缺少能力时返回明确不可用结果。
4. 阶段一图片级失败返回 18 的 `preSubmitImageDecisionRequired`，会话、认证、运行时明确失败返回 group_blocked。executor 冻结 manifest 后调用 capability 的 `submitPreparedPublication()` 通过 Python/浏览器提交，它只返回 09 四种 outcome；边界后缺少明确结果必须 uncertain，不得返回图片动作或重放正文。
5. 保持现有浏览器生命周期和敏感数据清理，不把本地路径或 Cookie 写入诊断。
6. 使用假运行时覆盖 0–5 张、payload、部分失败、降级、运行时缺失和发布接受。

## 职责边界

- 蓝色河畔图片子模块拥有平台 payload 与上传协议。
- 浏览器会话模块只管理生命周期，不决定图片选择和文章结果。
- 通用图片准备器不依赖 Python、Playwright 或平台 DOM。
- 结果分类与队列控制继续复用 09，不在平台适配器启动其他组。
- 蓝色河畔 adapter 只消费规范投稿命令和 18 的图片计划，不读取迁移 DTO、生命周期事实或订单状态；它拥有 Python/浏览器准备、最终提交协议和结果解析，但不写 submission-start，executor 通过 08 capability 持有两阶段调用顺序。

## 架构硬门槛

- 图片协议在蓝色河畔适配边界内通过窄版本化契约隐藏 Python/浏览器细节；只在形成独立变化与测试接缝时提取，禁止透传拆分。
- Python/浏览器桥接使用窄版本化契约，可单独替换和测试。
- 不复制路径安全、随机选择、正文布局或错误范围策略。
- 自动化测试使用假运行时，不需要真实账号或可见浏览器。
- 不让 adapter 通过通用 OperationalStore 或迁移门面自行判断文章是否可发布。
- `PreparedSubmission` 不暴露 Python payload、Cookie、浏览器 session/token，不可序列化或日志化；adapter 私有状态与 safe manifest 分离。

## Acceptance criteria

- [ ] 蓝色河畔按 0–5 配置提交纯文本或带图正文。
- [ ] 平台 payload/上传细节不泄漏到通用队列和 Renderer。
- [ ] 图片与运行时失败分类明确，不静默丢图或自动重复投稿。
- [ ] 在桥接与提交边界前后注入故障，证明恢复动作不会跨边界重放正文，边界后未知结果只进入 uncertain。
- [ ] 阶段一与阶段二结果 union 严格分离，capability 私有状态不泄漏，safe manifest 与 Python/编辑器最终内容一致。
- [ ] 浏览器/Cookie/本地路径安全约束保持通过。
- [ ] 蓝色河畔组的完成、暂停和失败不影响其他平台。
- [ ] 交接记录包含能力、桥接契约、假运行时证据、模块职责、依赖方向及显著规模变化说明。

## 审计建议

- 等级：深度独立审计。
- 范围：Python/浏览器桥接版本契约、payload/上传/插入、Cookie/路径安全、提交边界、运行时缺失、接受证据和 unknown 失败关闭。
- 必须检查不把 Python 细节泄漏到通用 DTO、不会跨边界重放正文；不重复审计 18 布局或 09 状态机，不运行完整 `npm test`。

## Non-goals

- 不修改列举网、今日头条或网站媒体图片流程。

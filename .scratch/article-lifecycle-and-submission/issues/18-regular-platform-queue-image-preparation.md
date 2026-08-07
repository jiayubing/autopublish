# 18 — 普通平台队列组图片准备

**What to build:** 允许每个普通平台队列组统一选择 0–5 张随机图片，并在每篇文章实际开始投稿时生成平台无关的图片准备结果和均匀正文布局。

**Blocked by:** 08 — 普通平台独立队列组执行；09 — 普通平台结果分类与人工收口；10 — 精简普通平台投稿队列界面；17 — 客户本地图片库深模块

**Status:** deferred-until-core-complete；当前不可调度

**Scheduling gate:** 仅在波次 11 核心地基验收 `COMPLETE` 后，作为波次 12 唯一 ticket 调度；此前生产 UI 必须保持图片入口关闭。本门槛不改变 08、09、10、17 的业务依赖。

## 启动约定

- 本 ticket 负责队列配置和平台无关准备，不承诺所有平台使用同一种上传方式。
- 图片始终可选，文字是必需内容；请求 0 张或客户无图时必须继续纯文本投稿。
- 先读取 08 的 `PreparedSubmission`/submission-start/唯一 `preparedSubmissionEvidenceV1` validator 和 09 的唯一 `publicationEvidenceV1` validator/outcome 合同；本 ticket 只填充 V1 已声明的图片字段与提交前 decision，不重定义 owner、字段、enum、上界或创建平行 validator。

## 执行过程

1. 为普通平台队列组增加 `imageCount` 配置，范围 0–5；新建组默认 1，追加文章继承现有组配置。对波次 11 及更早版本已经持久化、尚无该字段的队列组执行版本化迁移并固定为 0，保持原纯文本确认语义；不得把新组默认值反向套到旧组。旧组只有在用户明确修改配置并重新确认后才能启用图片。
2. 入队确认和队列组界面显示配置，但不预先为每篇固定图片；真正领取任务时才调用 17 选择。
3. 建立平台无关图片准备端口，输出正文段落结构、选中资产、能力要求和诊断，不执行上传，也不返回 Ticket 09 的投稿 outcome。
4. 计算均匀插入位置：不在标题前、不连续堆叠；段落不足和图片不足时安全收敛。
5. 固定两阶段封闭合同。阶段一 `preparePlatformSubmission(command, imagePlan)` 只可返回 `readyToSubmit(PreparedSubmission)`、`preSubmitImageDecisionRequired`、`article_rejected` 或 `group_blocked`；decision 只包含稳定安全原因和固定动作 `retry_preparation`、`replace_image`、`continue_text_only`，不得伪装成 09 outcome。用户选择动作后只能重做阶段一。
6. 图片版 evidence 必须通过 08 的同一个 `preparedSubmissionEvidenceV1` validator：保留 V1 全部既有字段，只把 `deliveryMode` 设为 `with_images|text_only`、按最终顺序填充最多 5 个既有 `{assetFingerprint, layoutSlot}` 条目，并从既有 `decisionKind=initial|retry_preparation|replace_image|continue_text_only` 中选择。禁止增加字段、版本或 metadata；禁止绝对路径、二进制、上传 token、DOM、Cookie 和供应商响应。每次重做阶段一只产生候选 manifest，只有最终 chosen manifest 随 08 submission-start 原子冻结。
7. `PreparedSubmission` 是仅进程内 capability，不是 DTO/handle：公开只读 manifest 与唯一具名 `submitPreparedPublication()`，adapter 私有会话隐藏在实现内部。executor 先把 manifest 交给 08 `beginRegularRemoteSubmission`，成功后只调用该具名方法；submit 必须使用与冻结 manifest 对应的已准备内容，禁止再换图/降级/改正文。若编辑器或会话漂移，阶段二只能 uncertain。阶段二只返回 09 四种 outcome，不得再返回 decision 或再次提交。
8. 图片准备器只输出安全资产与布局，不持有 `PreparedSubmission`、不判断提交边界；19–21 各自创建 capability 并隐藏上传/会话状态，executor 不包含平台分支。
9. 增加旧组迁移/重启/回滚、新旧默认值、用户重新确认、配置继承、随机时机、不重复、manifest、能力隔离、两阶段结果、失败动作和纯文本回归测试。

## 职责边界

- 队列组拥有 imageCount 配置，不保存图片二进制。
- 图片准备器拥有选择与布局，不知道浏览器选择器或供应商 API。
- 平台能力声明决定是否接受准备结果，不改变通用算法。
- Renderer 只编辑组配置、展示服务返回的 decision 与固定允许动作并收集用户意图；“换图”只发具名命令，不让组件选择具体图片或从错误文本自行推导动作。
- adapter 拥有平台准备/提交协议，executor 拥有调用 08 durable submission-start 的顺序；通用图片准备器不得读取队列 outcome、生命周期事实或自行决定边界后的恢复动作。

## 架构硬门槛

- 图片准备以窄接口封装配置、选择、布局和安全校验；平台交付保持独立端口，只在具有独立变化或测试理由时拆分内部职责，禁止透传层。
- 新平台可通过实现交付端口接入，不修改队列编排核心。
- 不让图片失败覆盖文字成功语义；所有降级必须显式可观察。
- `preSubmitImageDecisionRequired` 与 09 outcome 是两个不同的封闭 union；不得共用 retry code、通用 `result(type, metadata)` 或由 Renderer/09 推导互转。
- `PreparedSubmission` 只允许 executor 调用稳定方法，不能序列化、日志化、跨 IPC/平台传递或暴露任意 token；其 safe manifest 与私有提交能力必须分离。
- 队列快照只传安全元数据，不传绝对路径或二进制。

## Acceptance criteria

- [ ] 每个普通平台队列组可设置 0–5，默认 1，追加文章继承配置。
- [ ] 核心阶段已有且缺少 `imageCount` 的队列组升级后固定为 0；迁移幂等、重启稳定且不会静默启用图片。新组才默认 1，旧组必须经过用户明确修改和重新确认才能改为带图。
- [ ] 图片只在文章开始投稿时选择，不要求逐篇预配置。
- [ ] 同篇图片不重复并均匀置于正文段落之间。
- [ ] 图片不足或无图时继续纯文本，处理失败不会静默忽略。
- [ ] 合同测试证明重试、换图和纯文本降级只发生在远端提交前；跨过提交边界后的未知结果进入 09 uncertain 且不会重复正文投稿。
- [ ] 平台无关准备结果不包含平台选择器或供应商字段。
- [ ] 交接记录包含配置契约、布局算法、失败模型、适配端口、依赖方向及显著规模变化说明。
- [ ] 阶段一公开结果严格为 ready/decision/article_rejected/group_blocked，阶段二严格为 09 四种 outcome；09 不消费 decision，阶段二不返回图片恢复动作。
- [ ] `PreparedSubmission` capability 无平台字段/任意 callback/开放 metadata；executor 不检查平台类型，只冻结 safe manifest并调用具名 submit。
- [ ] 换图、纯文本降级、带图和 outcome 前崩溃测试证明冻结 manifest 精确对应实际准备内容，09 人工 accepted 可在 capability 消失后生成完整档案。
- [ ] manifest 冻结后注入编辑器图片数量、正文或会话漂移，阶段二不会重建/改写 evidence 或继续确定提交；只返回 uncertain。
- [ ] executor 只能按“prepare → beginRegularRemoteSubmission → submit”顺序工作；在三个接缝注入故障，证明标记前可安全重做准备、标记后只进入 uncertain。
- [ ] schema 兼容测试证明 08 的纯文本 evidence 在本 ticket 后无需迁移；队列组配置只执行上述 `imageCount` 版本化迁移，18 只填充 evidence 既有字段并复用 08/09 唯一 validator，任何新 evidence 字段、未知 decision 或平行 V1 都失败关闭。

## 审计建议

- 等级：定向独立复核。
- 范围：队列组 `imageCount` 0–5、新旧组默认值、旧组幂等迁移与重新确认、追加继承、任务开始时选择、客户边界、无图/不足、安全布局、prepared manifest、进程内 capability、两阶段封闭结果和提交边界前后的失败分类。
- 重点通过纯函数/公开准备端口验证布局与不重复，不重复审计 17 图片库内部或 19–21 平台 DOM，不运行完整 `npm test`。

## Non-goals

- 不在此 ticket 实现列举网、今日头条或蓝色河畔上传细节。
- 不实现网站媒体图片传输。

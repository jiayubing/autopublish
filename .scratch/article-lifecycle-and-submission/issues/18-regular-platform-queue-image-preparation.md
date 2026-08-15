# 18 — 普通平台随机配图准备（瘦身版 umbrella）

**What to build:** 为普通平台队列组提供 0–5 张随机客户图片的配置与投稿前准备能力。每篇文章真正开始投稿时，从文章所属客户的专用图片目录随机选择最多 `imageCount` 张；图片不足、无图或图片准备失败都自动降级，文字投稿继续。

**Blocked by:** 08 — 普通平台独立队列组执行；09 — 普通平台结果分类与人工收口；10 — 精简普通平台投稿队列界面；17 — 客户本地图片库深模块

**Status:** `PARTIAL` umbrella；18-0 已在 integration HEAD `55ecc3f0f81d7b3fd7c17853ff486e48ea0f55b6` 完成合同/owner map 冻结与定向回归，evidence 见 `handoffs/18-0-image-contract-owner-map.md`。Ticket 26 的 26-I 本地 closure 已闭合；后续只能按 `18-A → 18-B → 18-C → 18-D → 18-E` 严格串行调度，当前尚未启动 `18-A`。

**Scheduling gate:** 08、09、10、17 已完成；Ticket 26 的 26-I 本地 closure、combined audit、bounded re-audit 和 package/smoke gate 已闭合。按 Wave Plan 的 Wave 12 本地 closure 调度例外，不等待 Ticket 25/26 的真实外部验收；该例外不继承任何真实操作授权。Ticket 17 是已完成只读依赖，不重新调度。18 完成前不宣称任何具体平台已具备真实图片上传能力；19–21 仍需各平台独立探索、实现和真实验收授权。

## 瘦身与低耦合执行决定

1. **只增加一个持久业务事实。** Wave 12 只在 queue group owner 增加 `imageCount`；选中图片、绝对路径、上传结果和平台布局均不进入 queue schema、IPC 或 Renderer。
2. **复用而不包裹 Ticket 17。** 图片发现、缓存、稳定引用、随机选择和安全解析继续由 Ticket 17 唯一拥有。18-C 只组合 `clientId + imageCount`、可恢复失败降级和安全计划；若实时 owner map 证明现有 preparation owner 可以直接承载该职责，不得为了文件数量另建纯透传 service/manager。
3. **只有一个跨 owner seam。** 通用队列链只向 adapter prepare 传递一个仅进程内、无绝对路径的窄 `imagePlan`。Wave 12 不认识 platformId 分支、DOM、HTTP、Python、multipart、布局或平台图片上限。
4. **Capability 复用现有平台目录。** 18-B 只能在现有 platform catalog/capability 投影中增加 fail-closed 图片能力，不得新增独立 registry、manager、Renderer 白名单或第二份平台支持事实。
5. **不扩公开 evidence 合同。** 继续复用既有 `PreparedSubmission`、`preparedSubmissionEvidenceV1` 和 `publicationEvidenceV1`；Wave 12 不新增 V2、generic image DTO 或 compatibility layer。
6. **首尾工作包保持有界。** 18-0 只输出当前 HEAD 的 owner/file map、最小测试清单和停止条件；18-E 只审计 18-A–D 的组合不变量并完成一次 bounded closure，不重新审计历史 Wave 或平台 adapter。

该拆分会让 `imageCount` 按正常 transport 映射穿过 store/application/IPC/UI，但不会让任何一层拥有第二份事实；平台变化只影响 Wave 13 adapter，客户图片规则变化只影响 Ticket 17/18-C，因此不建立反向依赖或平台耦合。

## 已确认产品语义

1. **完全随机。** 每篇文章都从该客户当前可用图片全集重新随机；同一篇内不重复，不同文章之间不记录使用历史，同一张图允许连续两篇再次被选中。
2. **请求 N，有几张用几张。** `imageCount` 范围 0–5；目录只有 M 张且 `M < N` 时选择 M 张，不报错。
3. **图片永远是 best-effort。** 图片目录不存在、目录为空、损坏图片、扫描失败、单图解析失败、平台图片准备失败、部分图片失败或全部图片失败，都不能把原本可投稿的文字文章改成失败。
4. **0 张图片就是合法纯文本。** 不创建需处理、不暂停队列、不要求人工确认。
5. **不做图片恢复状态机。** Wave 12 不产生 `retry_preparation`、`replace_image`、`continue_text_only` 用户动作，也不创建 `preSubmitImageDecisionRequired`。既有 V1 `decisionKind` schema 为兼容历史保留，但本功能路径始终写 `initial`。
6. **不做通用“均匀插图”算法。** Ticket 18 只选择安全图片资产；图片是正文插图、图集、封面还是其他布局，由 19–21 各平台真实能力决定。最终 `layoutSlot` 由平台准备结果按实际提交内容填写。
7. **提交边界仍然严格。** 图片可选不改变 08/09：`beginRegularRemoteSubmission` 之后结果未知只能 `uncertain`，不得因为图片失败自动重发正文。

## 工作包顺序

| 工作包 | 单线程目标 | 主要 owner / 文件边界 | 输出 |
| --- | --- | --- | --- |
| `18-0` | 冻结瘦身合同和真实 owner map | 文档、公开合同/测试只读 | 可执行 contract inventory；不得写 production |
| `18-A` | 持久化队列组 `imageCount` | OperationalStore queue group schema/runtime/transition | 旧组=0、新组=1、0–5 校验、重启稳定 |
| `18-B` | 接通 application / IPC / Renderer 配置面 | regular queue application、typed IPC/bridge/types、queue UI | 配置 API + capability-gated UI；不触碰图片库和上传实现 |
| `18-C` | 接通客户图片计划 | Ticket 17 library、claim/preparation owner、composition | claim 时产生安全随机 image plan；失败自动变空计划；不强制新增纯透传层 |
| `18-D` | 接通 prepare seam 与 evidence 约束 | regular preparation port/executor contracts/tests | 把 image plan 交给 adapter；文字路径不因图片失败被阻断 |
| `18-E` | 组合审计与 closure | 只修复 18-A–D 暴露的直接问题 | combined evidence、bounded remediation、final gate |

每个工作包必须从包含前一包的 clean integration HEAD 开始；不得并行修改共享 owner。工作包合同见同目录 `18-0-*`、`18-A-*` 至 `18-E-*`。

## 统一职责边界

- **Queue Group Owner** 只拥有 `imageCount` 配置和迁移，不保存已选图片、绝对路径、二进制或上传结果。
- **Ticket 17 Client Image Library** 只拥有客户边界内的发现、缓存、稳定引用和随机选择；18 不复制扫描器、路径安全或随机算法。
- **Regular Image Plan Service** 只在文章实际领取时按 `clientId + imageCount` 形成安全计划；它不上传、不修改正文、不写投稿 outcome。
- **Platform Adapter（19–21）** 才拥有图片上传、平台位置/布局、实际成功图片集合和最终 `with_images|text_only` manifest。
- **Preparation Port / Executor** 只保持 `prepare → beginRegularRemoteSubmission → submitPreparedPublication` 顺序，不拥有平台 DOM，不建立图片重试状态机。
- **Renderer** 只编辑组级数量和展示安全状态；不逐篇选图、不选择具体图片、不显示绝对路径、不提供“换图/重试图片”按钮。

## 安全与失败规则

- 生产 composition 必须给 Ticket 17 的 `createClientImageLibrary` 显式传入专用 `imageDirectoryName`；**不得使用其“扫描整个客户根目录”的默认行为作为生产图片来源**。
- 专用目录名由现有 workspace/config/path policy 明确提供；若配置缺失或目录不存在，image plan 退化为 0 张并记录安全 warning，文字继续。
- Image plan 与队列快照只含稳定图片引用和安全元数据；绝对路径只能在平台准备期间通过 Ticket 17 的 `resolveImage(clientId, imageId)` 临时解析，不持久化、不跨 IPC。
- 18 不预先为队列中的每篇文章冻结图片。每次文章真正取得 claim 后再随机选择；同一文章的一次 prepare 尝试内计划固定，提交边界后禁止重新选择。
- 图片诊断只能是安全 code/count/stage；不得包含 Cookie、DOM、供应商原始响应、本地绝对路径或图片二进制。

## Acceptance criteria

- [ ] Ticket 18 已按 `18-0 → 18-A → 18-B → 18-C → 18-D → 18-E` 拆为单线程可完成工作包，每包有独立职责边界、禁止事项、验收和停止条件。
- [ ] 队列组 `imageCount` 仅允许 0–5；核心阶段已有旧组升级后固定为 0，新建组默认 1，追加文章继承现有组配置，迁移幂等且重启稳定。
- [ ] 队列组级 `imageCount` 可被 application/typed IPC 管理；Renderer 只有在目标平台 capability 明确支持图片时才显示编辑入口，不能逐篇选图或选择具体图片。
- [ ] 图片只在文章实际开始投稿时按文章所属 `clientId` 随机选择；同篇不重复、跨篇可重复，不记录素材消耗历史。
- [ ] 请求 N 而可用 M<N 时返回 M；0 张、目录缺失、损坏/不可读图片和计划服务异常都形成 0..N 安全计划并允许纯文本继续。
- [ ] 生产图片库显式指向客户专用图片子目录，不扫描客户根目录中的其他文件。
- [ ] 18 不包含自动均匀插图算法，不包含平台 DOM/API/Python 上传，不产生图片用户 decision。
- [ ] 既有 `preparedSubmissionEvidenceV1` / `publicationEvidenceV1` schema 不新增字段或版本；本路径 `decisionKind` 始终为 `initial`。图片实际成功后由 19–21 通过同一 validator 写 `with_images` 和实际 `{assetFingerprint, layoutSlot}`；全部图片失败则合法 `text_only`。
- [ ] 自动化证明图片计划失败、部分/全部平台图片准备失败不会把文字投稿转成 article_rejected/group_blocked；只有原本的文章、账号、平台或提交结果错误可以按 08/09 既有规则失败/暂停/uncertain。
- [ ] `beginRegularRemoteSubmission` 前可安全丢弃尚未提交的图片计划；边界后未知结果不会因图片 best-effort 规则而重做 prepare 或重复正文投稿。
- [ ] 18-E handoff 记录 owner map、迁移策略、配置面、随机时机、best-effort 矩阵、实际测试命令、audit/remediation 结果和最终 clean-HEAD evidence。

## Non-goals

- 不在 Ticket 18 实现列举网、今日头条或蓝色河畔真实图片上传；由 19–21 分别负责。
- 不实现网站媒体图片传输。
- 不实现图片使用历史、近期去重、素材消耗、手工逐篇选图、图片生成、图片压缩/编辑或跨客户共享图库。
- 不删除既有 V1 中历史兼容的 `decisionKind` enum；只是不在新自动配图路径产生非 `initial` 值。

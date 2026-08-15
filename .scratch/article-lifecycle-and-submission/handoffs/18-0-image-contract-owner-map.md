# 18-0 图片合同与 Owner Map 冻结

## 身份与范围

- Integration HEAD：`55ecc3f0f81d7b3fd7c17853ff486e48ea0f55b6`（`codex/article-lifecycle-submission`，开始及验证时工作树干净）。
- 工作包：`18-0-image-scope-contract-freeze`；按 Manual Dispatch 仅完成实时合同 inventory、定向回归和本 handoff。
- 本包 production diff：无。未修改 schema、migration、Renderer、IPC、platform adapter 或 Ticket 19–21 文档；未执行真实登录、上传或发布。
- 下一项：`18-A`，必须从包含本 handoff 的 clean integration HEAD 串行开始；本次不调度它。

## 已冻结产品与公开合同

### Ticket 17 是只读图片 owner

`src/content/client-image-selector.js` 的公开选择规则已经满足 Ticket 18 的随机语义：计数只接受 `0..5`（默认 `1`），每次调用从当前候选集无放回抽样，同一调用内不重复；它没有跨调用的消耗/已使用状态。因此同一文章计划内不重复、不同文章可重复。候选少于请求数时返回实际数量；`0` 或空候选返回 `textOnly=true`。

`src/content/client-image-library.js` 是客户隔离的扫描、缓存、稳定引用和 resolver owner。`selectImages(clientId, { count })` 只返回安全图片元数据和稳定 `client-image:*` ID；`resolveImage(clientId, imageId)` 会在即时使用前再次检查客户目录边界，且其 `filePath`/`realPath` 只能留在 adapter 准备期，不能进入 image plan、IPC、queue 或 evidence。

`src/content/client-image-path-policy.js` 的 `imageDirectoryName` 当前是可选项；省略时会扫描整个客户根目录。当前 desktop/composition 没有生产 `ClientImageLibrary` 实例。故 18-C 的 production composition 必须显式传入客户专用子目录名，绝不能采用该默认值。当前 HEAD 没有命名的图片目录配置字段；18-C 应先从既有 workspace/config/path-policy owner 取得一个命名的相对目录配置。若仍不存在该来源，按 18-C stop condition 返回该最小 owner 决策，不能硬编码用户机器绝对路径或退回客户根目录。

### PreparedSubmission / evidence V1 已足够

`src/domain/regular-publication-contract.js` 的 `parsePreparedSubmissionEvidenceV1` 已封闭地表达：

- `deliveryMode` 是 `text_only | with_images`；前者必须是空 `images`，后者必须至少一张；最多五张。
- 每张最终图片是实际 `{ assetFingerprint, layoutSlot }`；fingerprint 不可重复，`layoutSlot` 是 `0..9999` 整数。
- `decisionKind` 的 V1 enum 保留 `initial`、`retry_preparation`、`replace_image`、`continue_text_only` 以兼容历史，但 Wave 12 新路径固定写 `initial`，不发出任何后三种图片决策。
- `PreparedSubmission` 是不可序列化的 capability；持久化边界只接收它已验证的 `preparedSubmissionEvidenceV1`。

`src/domain/publication-evidence-contract.js` 将同一 image summary 投影进 `publicationEvidenceV1.imageSummaryV1`。因此无需 V2 evidence、图片 DTO 版本或新字段。19–21 只有在平台确实上传/插入成功后，才在现有 validator 内写 `with_images` 和实际成功集合；全部失败仍是合法的 `text_only`。通用层不拥有均匀布局算法，最终 `layoutSlot` 由各平台 adapter 的实际准备结果拥有。

### 固定的普通平台时序

当前直接链为：`submission_queue_groups` 持久组 → `claimRegularQueueGroupHead` 取得文章 claim → `regular-queue-group-orchestrator.executeClaim` → `regular-platform-preparation-port.preparePlatformSubmission`（先账号核验）→ adapter `preparePlatformSubmission` → `beginRegularRemoteSubmission` 冻结 V1 manifest → `submitPreparedPublication`。

18-A 会让 group 是 `imageCount` 的唯一持久 writer；18-C 只能在 claim 已取得后选择图片；18-D 只能在首次账号核验成功后、adapter prepare 前取得一次 image plan。准备期失败可结束本次准备；一旦 `beginRegularRemoteSubmission` 完成，任何不确定结果仍按 08/09 进入 `uncertain`，不得重新选图、补图或重发正文。

## 18-A–D 互斥 owner / 文件 map

| 工作包 | 唯一事实与主要可写 owner | 已冻结文件范围 | 不得触碰的边界 |
| --- | --- | --- | --- |
| 18-A | `imageCount` 是 `OperationalStore` queue-group schema/runtime 的唯一持久事实。 | `src/infrastructure/operational-store/internal/operational-store-schema.js`、新的正式 schema v8 migration、`operational-store-queue-admission-transaction.js`、`operational-store-regular-queue-runtime.js`、`operational-store-queue-aggregate.js`、`operational-store-transition-ports.js`，以及直接 OperationalStore/migration tests。 | 不修改 application、IPC、Renderer、Ticket 17、prepare port、adapter 或 evidence schema。旧组迁移为 0；新建组默认 1；既有组追加不得改写该字段。 |
| 18-B | application 只调用 18-A 的受控 transition；图片 capability 继续是既有 platform adapter/catalog 投影的属性，默认 fail-closed。 | `desktop/services/regular-queue-application.js`、`desktop/ipc/content-submission-ipc.js`、`desktop/ipc/contracts/submission-regular-contracts.js`、对应 preload/bridge/types、`media-workbench/src/components/RegularQueueGroupsPanel.tsx` 及直接 feature/read-model，`src/core/platforms.js` / `desktop/services/submission-target-catalog.js` 的最小既有投影扩展，以及 application/IPC/Renderer tests。 | 不修改 OperationalStore internal schema、图片库、prepare port、上传 adapter；不建立图片 capability registry、Renderer 平台白名单或逐篇 picker。 |
| 18-C | 新的窄 `RegularImagePlanService`（名称可按现有规范微调）拥有“按 `clientId + imageCount` 调用 Ticket 17、将可恢复图片故障降级为空计划并输出安全 warning”的行为；它不缓存、不上传、不持久化。 | 新 service 与其 tests；`desktop/composition/workspace-runtime-composition.js`（唯一 `ClientImageLibrary` composition，并显式提供专用 `imageDirectoryName`）；必要时已有 workspace/config/path-policy owner 的最小命名配置接线。`src/content/client-image-*` 正常只读消费。 | 不改 queue schema/IPC/UI/evidence/adapter；不新增第二图片缓存、使用历史、图片库或通用 manager。 |
| 18-D | `desktop/services/regular-platform-preparation-port.js` 拥有唯一通用 prepare seam；adapter 才拥有实际图片交付和最终 layout。 | `regular-platform-preparation-port.js`、其 direct executor/orchestration tests，以及仅为第二个 prepare 参数兼容所必需的 `src/platforms/lieju/adapter.js`、`src/platforms/toutiao/adapter.js`、`src/platforms/hepan/adapter.js` 最小签名测试。 | 不改 queue `imageCount`/Renderer，不实现任何 DOM、HTTP、Python 上传或通用布局，不改 outcome enum、submission-start writer 或 evidence schema。 |

这些范围只有在 `18-0 → 18-A → 18-B → 18-C → 18-D` 的单一串行链上才能修改。共享文件的后续写入必须建立在前一包新的 clean integration HEAD 上；不得并行启动任何共享 owner。

## 18-C / 18-D 的实现决策

18-C **应创建有真实行为的窄 image-plan owner**，而不是纯透传 service/manager：它集中承担一次随机选择、`N>M` 截断、零图、可恢复 I/O/扫描/解析失败的安全 warning 和空计划降级，并且禁止路径/二进制外泄。这些职责不属于当前 preparation port，也不能复制到每个 adapter；删除它会删除实际降级与安全逻辑，故不属于禁止的透传模块。

18-D 使用唯一进程内 seam：在首次账号核验成功后由 port 取得一次 `imagePlan`，再以独立第二参数传给 `adapter.preparePlatformSubmission(adapterInput, imagePlan)`；不得把 plan 混入可持久化 claim。计划只可包含 `imageId` 和必要安全元数据/`{ code, stage }` warning，不含绝对路径、realPath、bytes、DOM、Cookie 或上传 token。当前 adapter 在 Wave 12 仍产生既有纯文本 `PreparedSubmission`；Wave 13 的 19、20、21 分别通过该参数消费计划，并经 Ticket 17 `resolveImage` 在准备期临时取得受复核路径。

这也冻结了 image-plan 生命周期：每个 claim 最多生成一次；`beginRegularRemoteSubmission` 前可以随该次 prepare 丢弃；边界后不重新生成。图片失败只能减少该 adapter 的实际成功集合，不能转为 `article_rejected`、`group_blocked` 或影响其他队列组。

## 下游 19–21 仅核对的前提

- 19-D 已明确消费 18-D imagePlan，按 plan 顺序经 Ticket 17 resolver 重新验证，最多使用列举网当次真实的 4 个槽，并以实际图集顺序写 `layoutSlot`。
- 20 与 21 也只消费 image plan + Ticket 17 resolver；各自 adapter 拥有上传/插入验证、实际成功图片和 layout。21 还要求替换旧的平台目录同名图片来源。
- 本包未修改这些文档或 adapter，未推断任何平台协议，也没有把任何平台标为已支持。

## 最小定向验证与 escalation

| 包 | 最小定向验证 | 只在以下情况下升级/返回 |
| --- | --- | --- |
| 18-A | 正式 migration（旧组=0、重复/重启稳定）、create/update/inherit、无效输入、revision/fault/concurrency；现有 queue/outcome 直接回归。 | 现有 migration owner 不能安全加字段，或 group identity/唯一约束与字段发生产品冲突。 |
| 18-B | application admission/update、IPC closed-contract、preload/bridge typecheck、Renderer 的 capability hidden/disabled/0-1-5/busy/失败/窄宽状态。 | 现有 platform catalog 无法表达“已保存配置但未支持上传”；只报告最小缺口，不能在 Renderer 创造第二真源。 |
| 18-C | 专用子目录、客户隔离、`N>M`、0 图、跨文章可复用/单计划去重、可恢复图片异常降级、路径不泄漏；回归 Ticket 17。 | 不存在可由既有 workspace/config/path-policy owner 提供的专用目录来源，或公开图片 API 无法安全表达计划。 |
| 18-D | plan-once seam、纯文本 adapter 回归、plan fault、部分/全部图片失败、边界前结束与边界后 `uncertain`、无平台分支/无序列化泄漏；08/09 direct 回归。 | 接线必须改变已冻结 submission-start writer、outcome enum 或远端副作用边界。 |

本包在当前 HEAD 实际运行：

```text
node --test --test-concurrency=1 tests/client-image-selector.test.js tests/client-image-library.test.js tests/regular-publication-evidence-contract.test.js tests/submission-preparation-lifecycle.test.js tests/regular-platform-outcomes.test.js tests/ticket-25-c-regular-platform-acceptance.test.js
```

结果：58 passed，0 failed，Node `v24.16.0`。该回归覆盖 Ticket 17 的随机/不足/零图/隔离/resolver，V1 evidence，以及 prepare → submission-start → outcome 的纯文本与不确定边界；它不替代后续各包新增的行为测试或 Wave 12 final gate。

## 18-0 结论

当前 V1 可表达冻结语义，Ticket 17 随机行为未回归，owner 与 umbrella 一致；无 `BLOCKED_*` 条件。`18-0` 本地 closure 完成。按 Manual Dispatch，本次没有执行 Primary Audit、commit、merge、18-A 或任何真实外部操作。

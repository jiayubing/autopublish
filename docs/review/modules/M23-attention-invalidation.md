# M23 Article attention/management/invalidation 深度审查

> 状态：已完成（2026-07-23）。固定基线 `master@e8d817847bab3a9e6020006cab35340f645e527f`；无业务基线偏差。

## 模块职责和边界

M23 从队列 pair、submission batch、publication ledger、删除事务和本地归档失败派生“需处理项”及文章管理 workflow snapshot；它不创造新的 publication 状态。resolver 只在 revision/fingerprint/确认通过后调用 M20/M19/M22 action port。主进程 `workspace-data-invalidation` 是 revision/scopes 唯一生产者；renderer 的 attention、platform queue、content management、media workbench 分别消费自己拥有的只读 scope。

十项维度均已覆盖：DTO 去路径/正文/凭据、stable attention ID、revision stale 防护、动作能力矩阵、客户端过滤、缓存失效、跨目标 workflow 和 publication summary 均已核对。发现 media 目标信息在 attention DTO 和 retry 路径丢失；另有 M24 造成的 `submitting` stranded 记录不会进入 attention，是跨模块有效后果。

## 已检查目录与关键文件

- 全部生产文件：`desktop/services/article-attention-policy.js`、`article-attention-query.js`、`article-attention-resolver.js`、`article-management-snapshot.js`、`desktop/workspace-data-invalidation.js`、`workspace-invalidation-policy.js`、`desktop/ipc/article-attention-ipc.js`、`article-management-ipc.js`。
- 直接依赖/动作方：`desktop/services/content-submission-service.js`、`services/submission/*`、`article-removal-service`/`ai-content-service`、publication IPC/ledger、`platform-workbench-service.retryArchive`。
- Renderer 消费：`media-workbench/src/article-attention-store.tsx`、`workspace-data-store.tsx`、`App.tsx`、`ContentWorkbench.tsx`、`bridge/workspace.ts` 与 publication bridge；完整核对主进程 workspace-runtime 组合。
- 相关测试：`article-attention-{invalidation,policy,query,resolver}.test.js`、`article-management-{snapshot,benchmark,filter-model,controller}.test.js`、`workspace-{invalidation-policy,data-invalidation}.test.js`、`renderer-content-refresh-lifecycle.test.js`、`runtime-publication-wiring.test.js`、`published-article-trash.test.js`。无未读 M23 生产文件。

## 关键调用链与横向验证

1. mutation → `invalidation.invalidate(reasonCode)` → 单调 `revision/scopes` → renderer stores 各自 refresh；生产组合根使用 `workspace-data-invalidation.js`，旧 `workspace-invalidation-policy.js` 只由旧 runtime/test 使用。
2. attention query → residues/transactions/publications/archive failures → stable ID + safe DTO → policy action list。
3. attention resolver preview → action policy → execute 时重新查 revision → M20/M19/M22 action → invalidation。
4. management snapshot 按 workspace/client/revision cache，读取文章、trash、batch、publication、attention、transaction 并在末尾检查 revision 变化后重试。

## 候选发现

## TEMP-M23-01：需处理中心允许 media failed publication 重试，但 attention DTO 丢失 `mediaResourceId`，动作无法绑定原资源

- 分类：正确性 / API 契约 / 资金与重复投稿保护
- 所属模块：M23 Article attention/management/invalidation
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`auto—publish/desktop/services/article-attention-query.js:225-243` `publicationEntries`；`:160-181` `makeEntry`；`article-attention-policy.js:5,77-80`
- 问题描述：publication 记录含 `mediaResourceId` 和 `targetKey=media-resource:*` 时，query 仍把 target 映射成 `platformId:"media"`，`makeEntry` DTO 不输出 `mediaResourceId`/`targetKey`。因为 media 能力声明 `contentQueueImport:true`，failed 项仍得到 `retry-publication`。
- 代码证据：`publicationEntries` 只设置 `platformId/targetPlatformId`；safe copy 字段没有 media resource；policy 对 failed publication 提供 retry。resolver 将 item.publicationId 交给 M20，而 M20 retry 只读 platformId。
- 触发条件：付费媒体资源投稿明确失败，操作员从 attention 面板点击重试。
- 可达路径或调用链：media ledger failed(resource R) → attention list → retry action allowed → M20 `previewRetryFailedPublication` → generic `targetPlatformIds:["media"]` → untracked queue。
- 实际影响：用户看到可重试但无法恢复同一 resource/attempt；后续资源可能取自可变 draft，导致错误媒体、重复扣费或失败记录悬挂。
- 影响范围：付费媒体 failed publication 的 attention/retry；普通平台 attention 不受影响。
- 现有测试是否覆盖：attention tests 覆盖普通 failed policy/安全 DTO；media workbench tests 覆盖首次资源级提交，未覆盖 attention media retry。
- 验证方法与结果：最小 attention query 输入 mediaResourceId=`R-9` 的 failed record，返回 allowedActions `[retry-publication, open-publication]`，但 DTO `mediaResourceId` 为 null。退出码 0。
- 修复方向：attention identity 必须包含并校验 `targetKey/mediaResourceId`；对 media 禁止 generic retry，委托资源级 media coordinator，或扩展 M20 action DTO 显式携带原 resource/attempt。
- 关联发现：TEMP-M20-02、TEMP-M27-02。

## TEMP-M23-02：`submitting` stranded publication 不生成 attention 项，且管理快照只把它显示为 queued，缺少恢复动作

- 分类：错误处理 / 可观测性 / 生命周期
- 所属模块：M23 Article attention/management/invalidation
- 严重程度：高
- 置信度：高
- 验证状态：部分验证
- 位置：`auto—publish/desktop/services/article-attention-query.js:225-243` 仅筛 `uncertain/failed`；`article-management-snapshot.js:69-125` `ACTIVE_PUBLICATIONS/deriveWorkflow`；`src/publication/publication-ledger.js:259-267` reconcile 仅接受 uncertain
- 问题描述：ledger 若因 M24 watchdog/进程退出停在 `submitting`，attention publicationEntries 直接过滤，management workflow 只把 active submitting 归为普通 `queued/view_progress`。没有 expose reconcile/repair 动作，而 ledger 也不允许从 submitting 进入 reconcile。
- 代码证据：attention publication filter 明确只取 `uncertain`、`failed`；management active set 包含 submitting；resolver 的 reconcile 只能作用于 query 返回项，ledger `reconcile` 对非 uncertain 抛错。
- 触发条件：远端调用已开始后 worker 被杀、ledger outcome 写失败或机器断电，publication 保留 submitting。
- 可达路径或调用链：M24 → publication submitting stranded → M23 query/list → 无 attention；management snapshot → queued；用户无法核对/修复。
- 实际影响：重要目标永久阻塞重复保护，却不出现在需处理中心；操作员可能误以为只是排队，无法判断远端成功并避免重复扣费。
- 影响范围：所有 stranded submitting publication；与 M24 watchdog/ledger write failure 相关。
- 现有测试是否覆盖：测试覆盖 uncertain attention、queued workflow 和 revision；没有 submitting crash recovery/attention fixture。
- 验证方法与结果：静态沿 M24 的 markSubmitting→kill 路径确认；management/attention 过滤条件和 ledger transition 互相闭合地证明不可达修复。由于未强杀真实 worker，状态为部分验证。
- 修复方向：引入 durable “worker interrupted/ledger outcome pending” 状态或启动恢复器，将 submitting 保守转换为 uncertain；attention 显示核对/repair，禁止管理快照把它伪装成普通 queued。
- 关联发现：TEMP-M22-01、TEMP-M24-02、TEMP-M24-03。

## 失效协议验证

- 生产使用 `workspace-data-invalidation.js`；reason→scope 映射完整覆盖当前 mutation 原因，revision 即使 scope 分散也单调递增。
- `articleAttentionStore`、`workspaceDataStore`、`App` 和 `ContentWorkbench` 的订阅都按 scope/revision 去重，并在客户端切换时重建 attention store；既有 invalidation 测试全部通过。
- 本轮没有把“多消费者”结构本身报告为缺陷：在已检查 mutation 链上未证明漏刷新；但 media retry/stranded submitting 是状态事实未被正确派生，而非单纯 UI 订阅问题。

## 测试情况

- 联合定向命令 133/133 通过；attention policy/query/resolver/invalidation、management snapshot、runtime wiring 均通过。
- 最小 media attention 复现和静态 submitting 过滤验证退出码 0。
- renderer seam 专项红测不属于 M23 生产调用链，记录在第一阶段 R4/验证汇总，不在此模块重复计数。

## 未覆盖区域与待验证

- 未在真实 Electron 界面点击 media failed retry，因当前 DTO 已足以证明 resource 丢失。
- 真实 stranded submitting 的产生频率和启动时是否有外部人工清理流程待现场验证。
- 旧 `workspace-invalidation-policy.js` 的非生产消费者仅作兼容读取，不作为当前 defect。

## 模块审查结论

M23 达到深审完成门槛，2 条有效候选（高 1、中 1）。revision/缓存失效协议本身在当前 mutation 链上通过验证；主要问题是派生 attention 没有表达资源级 media 身份，也没有为 stranded submitting 提供可见、可恢复的状态。

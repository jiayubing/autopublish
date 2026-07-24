# M20 投稿导出与 batch/action 深度审查

> 状态：已完成（2026-07-23）。固定基线 `master@e8d817847bab3a9e6020006cab35340f645e527f`；无业务基线偏差。

## 模块职责和边界

M20 把投稿就绪文章转换为本地队列副本，负责资格校验、预检、文章×目标占位、Markdown/sidecar pair、submission batch、取消/清理/失败重试动作计划、执行前 fingerprint 重验，以及 ledger/batch/文件三方的补偿与查询。它不执行远端投稿，也不拥有远端发布事实；ledger 是发布权威，batch 与 sidecar 是本地工作和审计材料。

十项维度已覆盖：资格输入闭集、路径和 pair 检查、preview→execute 重验、取消终态、attempt rebind、部分失败补偿、安全 DTO、批次查询复杂度和测试 seam 均已核对。主要缺口是 batch store 的跨进程并发保护，以及付费媒体失败重试未携带资源级目标。

## 已检查目录与关键文件

- 全部生产文件：`src/content/article-submission-eligibility.js`、`submission-export-service.js`、`submission-batch-store.js`；`desktop/services/content-submission-service.js`；`desktop/services/submission/` 下 8 个生产文件（含兼容 facade 与 `submission-{read-snapshot,query,preparation,action}.js`）。
- 直接边界：`desktop/ipc/content-submission-ipc.js`、`desktop/services/submission-boundary.js`、`desktop/workspace-runtime.js`、`src/publication/` 全部文件、`desktop/services/platform-workbench-service.js`、`desktop/services/article-attention-{query,resolver}.js`。
- Renderer 调用方：content bridge、生成交接与文章需处理调用点；只核对本模块 DTO/动作调用，不把 renderer 视为权威校验。
- 相关测试：`content-submission-{export,batch}.test.js`、`submission-{attempt-rebind,batch-reconcile-write,batch-worker-integration,pair-state,preflight-integration,module-interface,query-interface}.test.js`、`ipc-submission-boundary.test.js`、`staged-media-removal-preview.test.js`、`article-trash-submission-lifecycle.test.js`、`runtime-publication-wiring.test.js`。无未读 M20 生产文件。

## 关键调用链

1. IPC preview/create → 文章 store → `evaluateArticleSubmissionEligibility` → `publicationContext` → pair 检查 → ledger reserve → batch `reserving` → 原子写 pair → batch `queued`。
2. 取消/清理 → 请求级 read snapshot → ledger/sidecar/hash/pair 交叉验证 → binding fingerprint → 重新建 snapshot → ledger cancel/文件删除 → batch transition；异常时尽力恢复原 pair。
3. worker outcome → ledger outcome → `submissionBatchStore.updateItem` → 远端 `published` 后本地归档状态单独写 `localArchive`。
4. failed retry → publication 记录 → 当前文章资格 → `previewBatch` → `createBatch` → attempt rebind。

R6 在此层被部分缓解：pair 写失败会取消新 reservation，取消/清理有计划和 fingerprint，旧 attempt 不能覆盖新 attempt；但 batch 文件仍是无 revision/CAS 的独立事实源。

## 候选发现

## TEMP-M20-01：submission batch 采用无锁“读完整 JSON→覆盖写”，主进程与 worker 并发更新会丢失彼此状态

- 分类：数据一致性、事务、并发与幂等性
- 所属模块：M20 投稿导出与 batch/action
- 严重程度：中
- 置信度：高
- 验证状态：部分验证
- 位置：`auto—publish/src/content/submission-batch-store.js:80-91` `save`；`:152-158` `updateItem`；`:188-197` `reconcile`；`desktop/workspace-runtime.js:65-83`；`desktop/worker/run-task.js:130-166`
- 问题描述：每个更新者先读取整批 JSON、在内存修改一项，再 rename 覆盖同一文件；没有 `.lock`、revision compare-and-swap 或合并重试。主进程的查询 reconciliation/取消/attention cleanup 与子进程 worker outcome/archive 写使用不同 store 实例，可在相同旧版本上写入，后写者覆盖先写者对其他 item 或 `localArchive` 的修改。
- 代码证据：`save` 的临时文件仅防止半写，不防止 lost update；`updateItem`/`reconcile` 都是 `get` 后无版本条件 `save`。worker 与主进程各自构造 `createSubmissionBatchStore`。
- 触发条件：平台 worker 更新一个 batch item 的远端/归档结果时，主进程同时列批次触发 reconciliation、取消另一项、清理残留或更新归档状态。
- 可达路径或调用链：renderer 查询/attention action → 主进程 batch store；同时 worker `submitSelectedPlanSerially` → worker batch store → 两个 rename 竞争同一 `batch-*.json`。
- 实际影响：batch 可回退为旧状态、丢掉另一个目标结果或本地归档失败标记；ledger 仍可恢复部分 publication 状态，但 `localArchive` 只有 batch 持有，丢失后需处理中心可能不再提示归档失败。
- 影响范围：同一 submission batch 内并发更新的所有 item；不直接篡改 ledger 的远端事实。
- 现有测试是否覆盖：覆盖单进程多 transition 一次 rename、worker→batch 正常同步与旧 attempt 拒绝；没有真实双进程 lost-update/CAS 测试。
- 验证方法与结果：完整检查两个进程的 store 构造和所有写路径；静态确认无锁/无 revision。未在审查中故意竞争写真实 batch 文件，因此标记部分验证。
- 修复方向：为 batch 引入记录 revision 与跨进程排他更新，锁内重读并只合并目标 item；`localArchive` 必须纳入冲突检测；增加两个 store 实例并发故障测试。
- 关联发现：TEMP-M24-01、TEMP-M24-02。

## TEMP-M20-02：失败付费媒体重试只保留 `platformId=media`，丢失资源目标并生成不受 ledger 跟踪的通用队列动作

- 分类：正确性 / 资金与重复投稿保护 / API 契约
- 所属模块：M20 投稿导出与 batch/action
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`auto—publish/desktop/services/submission/submission-preparation.js:86-108` `previewRetryFailedPublication/retryFailedPublication`；`src/content/submission-export-service.js:24-47` `publicationContext`
- 问题描述：失败记录本来含 `mediaResourceId`/`targetKey=media-resource:*`，重试却只把 `record.platformId` 放入 `targetPlatformIds`。`publicationContext(article,"media")` 因缺资源 ID 捕获 `PUBLICATION_PLATFORM_RESOURCE_REQUIRED` 并降级为 `tracked:false`，所以新 batch 无法 reserve 同一 publication attempt，也无法证明仍投向原资源。
- 代码证据：重试预览、平台能力判断、createBatch 都只使用 `record.platformId`；没有读取或返回 `record.mediaResourceId`。通用 export 明确把该错误当旧/custom 平台兼容路径吞掉。
- 触发条件：任一付费媒体资源 publication 明确失败，需处理中心/失败重试接口执行 `retry-publication`。
- 可达路径或调用链：media submit → ledger `failed(media-resource:R)` → attention → submission retry preview → `previewBatch(... targetPlatformIds:["media"])` → untracked media queue。
- 实际影响：接口可能返回“重试已创建”但旧 publication 没有新 attempt，失败项持续存在；后续通用 media adapter 若消费该文件，资源来自可变 draft 而不是原 publication target，目标级去重/扣费保护失效。
- 影响范围：所有付费媒体明确失败后的统一 retry/attention 路径；普通平台不受影响。
- 现有测试是否覆盖：`submission-batch-worker-integration` 仅覆盖普通平台 failed retry；media 测试覆盖资源级首次提交与 timeout，却没有 media failed→attention→retry 端到端测试。
- 验证方法与结果：最小 query 复现显示失败 media 项允许 `retry-publication`，DTO 中 `mediaResourceId=null`；逐调用验证 retry 只传 `platformId`。退出码 0。
- 修复方向：failed retry DTO/动作必须绑定原 `targetKey/mediaResourceId/publicationId/latestAttempt`；media 重试应回到资源级 media submission 协调器，或让 batch target 类型显式携带资源且重新 reserve 同一聚合。
- 关联发现：TEMP-M23-01、TEMP-M27-02。

## 测试情况

- 联合定向命令：133/133 通过，0 失败；覆盖资格、pair 状态、批次取消、attempt rebind、worker outcome、archive failure 和 staged media 删除。
- 默认 `npm test` 会包含上述 `.test.js`；本轮未执行全量仓库测试。
- 当前测试没有跨进程 batch 冲突，也没有付费媒体失败资源重试。

## 未覆盖区域与待验证

- 未对真实工作区进行并发破坏性写入；跨进程 lost update 仍需故障注入确认发生频率。
- 未连接真实媒体 API；资源目标丢失在本地代码/DTO 已确认，现场是否有人使用失败重试未知。
- 兼容 wrapper 文件仍完整读取；当前生产使用 `submission-*` 实现，旧 facade 不单独计为缺陷。

## 模块审查结论

M20 达到深审完成门槛。普通平台队列的资格、pair、动作计划和 attempt rebind 设计较强；media 失败重试动作失去资源绑定、batch 跨进程存在 lost-update 风险，均评为中（直接 media workbench 仍是可行规避路径）。R6 在正常路径已有补偿，但不能视为完全解决。

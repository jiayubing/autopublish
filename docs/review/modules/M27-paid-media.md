# M27 付费媒体 adapter/stores/API 深度审查

> 状态：已完成（2026-07-23）。固定基线 `master@e8d817847bab3a9e6020006cab35340f645e527f`；无业务基线偏差。

## 模块职责和边界

M27 管理付费媒体 API 配置、资源缓存/资源池、稿件 draft、文章转换、资源级预检和串行提交、订单本地记录/同步，并把每次付费投稿绑定到 `article × mediaResource` publication。外部 API、远端扣费与订单状态是不可信边界；ledger 是重复保护权威，订单 JSONL 是可查询证据，不应替代 ledger。

十项维度均已覆盖。资源级占位和 timeout→uncertain 的直接 media workbench 路径设计正确，API key 不写入订单 params；但默认传输为明文 HTTP、远端成功后的 order ID 持久化顺序存在不可恢复窗口，资源全量刷新/渲染无容量边界。

## 已检查目录与关键文件

- 全部生产文件：`auto—publish/src/platforms/media/` 下 10 个 JS 文件（`adapter`、`article-converter`、`config`、`media-client`、draft/pool/resource/order stores、`preflight`、`store-paths`）。
- 全部 M27 桌面服务：`desktop/services/media-workbench-service.js`、`media-resource-service.js`、`media-order-service.js`、`desktop/ipc/media-ipc.js`、`desktop/services/platform-settings/media-settings-adapter.js`、`submission-boundary.js`。
- 直接调用方：`media-workbench/src/App.tsx`、media/settings bridges、ResourceLibrary/OrdersView/MediaProviderSettings，及 `desktop/workspace-runtime.js`。
- 权威被调用方：publication 全部文件、`SubmissionOrderStore`、`MediaClient`、外部 multipart API。
- 相关测试：`media-{client,provider-settings,resource-service,resource-ux,runtime-workspace,workbench-service,order-service}.test.js`、`media-preflight.test.js`、`media-draft-store.test.js`、`media-article-converter.test.js`、`submission-preflight-integration.test.js`、`publication-duplicate-guard.test.js`。无未读 M27 生产文件。

## 关键调用链

1. Settings → 加密 config store → media adapter `validate/createClient` → `MediaClient` multipart POST。
2. App → media IPC `resolveSubmissions`（filename/draft revision/resource IDs 重验）→ preflight → 每资源 ledger reserve/markSubmitting → `sendArticle` → ledger outcome → order JSONL。
3. orders sync → `orderInfo` → 本地 JSONL 更新 → order 状态映射 → ledger `recordOutcome/reconcile`。
4. resource refresh → 多页 API → 全量 JSON cache → IPC → App 一次加载全部资源。

## 候选发现

## TEMP-M27-01：批准的默认媒体地址绕过 insecure 确认，以 HTTP 明文发送 API Key 和稿件

- 分类：安全性 / 配置与第三方依赖
- 所属模块：M27 付费媒体 adapter/stores/API
- 严重程度：高
- 置信度：中
- 验证状态：部分验证
- 位置：`auto—publish/src/platforms/media/media-client.js:8,27-33,137-151`；`desktop/services/platform-settings/media-settings-adapter.js:6,51-57`
- 问题描述：默认 base URL 是公网 IP 的 `http://8.138.187.158:8082`。配置校验只要求“其他 HTTP”设置 `allowInsecure`，恰好等于默认地址时即使 `allowInsecure:false` 也通过。每个请求在 multipart 中携带 `api_key`；提交还包含标题和完整 HTML。
- 代码证据：默认常量为 HTTP；条件 `baseUrl !== DEFAULT_MEDIA_BASE_URL && !allowInsecure` 特意豁免默认值；`MediaClient._post` 允许 `http/https`。
- 触发条件：首次/环境配置只给 API key，或保存默认地址，且生产网络没有外部加密隧道/反向代理把此 IP:8082 安全封装。
- 可达路径或调用链：设置/环境 → `createMediaSettingsAdapter.validate` → `MediaClient` → HTTP multipart → 公网媒体 API。
- 实际影响：API Key、稿件内容、余额、资源与订单响应可被同链路观察者窃听或篡改，进而造成凭据滥用和付费投稿风险。
- 影响范围：所有使用默认地址的媒体 API 操作。
- 现有测试是否覆盖：测试明确把默认地址视为“approved default”并验证可通过；未验证 TLS 或生产覆盖配置。
- 验证方法与结果：最小验证 `validate({apiKey:"secret"})` 返回默认 HTTP 且 `allowInsecure:false`；退出码 0。生产实际 base URL/TLS 未入库，故置信度为中、状态部分验证。
- 修复方向：生产只允许 HTTPS；若确需 HTTP，默认地址也必须显式、一次性风险确认并限制可信网络，且不应把公网明文传输作为开箱默认。
- 关联发现：第一阶段 R2（本轮确认代码事实，现场 TLS 仍待验证）。

## TEMP-M27-02：远端已接受后先写 ledger“submitted”但不保存 order ID，订单落盘失败会永久失去付费订单关联

- 分类：数据一致性 / 错误处理 / 资金操作可靠性
- 所属模块：M27 付费媒体 adapter/stores/API
- 严重程度：高
- 置信度：高
- 验证状态：已验证
- 位置：`auto—publish/desktop/services/media-workbench-service.js:423-468` `submitTasksSerially`；`src/platforms/media/submission-order-store.js:30-64`
- 问题描述：API 返回后，代码先用 `{status:"submitted"}` 更新 ledger，却没有把已经解析出的 `order_nid` 作为 `remoteId`；随后才 append 订单 JSONL。append 失败被降为结果字段 `orderWriteError`，整个任务仍返回 success。ledger 的 submitted attempt 无远端 ID，而本地也没有订单记录，后续 `syncOrder` 没有 orderNid 可用。
- 代码证据：`:430` `recordOutcome(... outcome)` 时 outcome 不含 order ID；`:440` 才解析 `orderNid`；`:443-468` 吞下 order store 错误并返回 success。
- 触发条件：媒体 API 已接受并返回订单号后，本地磁盘满、权限错误、杀软锁定或 JSONL append 失败。
- 可达路径或调用链：media submit → remote accepted/charged → ledger submitted(no remoteId) → order JSONL append throws → UI success + `orderWriteError` → 无订单可同步。
- 实际影响：重复投稿仍被 ledger 阻止，但操作员无法在本地定位、同步或审计已付费订单；响应离开内存后关联可能不可恢复。
- 影响范围：发生本地订单写失败的单个或连续媒体任务。
- 现有测试是否覆盖：测试覆盖正常 publicationId/order 写入和 timeout uncertain；没有“远端成功 + order store 失败”持久化恢复断言。
- 验证方法与结果：临时工作区模拟 API 返回 `ORDER-9`、order store 抛 `ENOSPC`；结果仍为 `success/submitted`，ledger `remoteId:null`，仅返回内存 `orderWriteError:"disk full"`。退出码 0。
- 修复方向：把 orderNid/URL 与 submitted outcome 一起原子持久化到 ledger；订单 append 失败应产生可恢复 attention/事务意图，不能仅存在返回 DTO；启动/同步支持按 ledger remoteId 重建订单视图。
- 关联发现：TEMP-M20-01、TEMP-M24-02、第一阶段 R6。

## TEMP-M27-03：资源刷新以“空页”为唯一终止条件并允许 600 页，随后 renderer 一次加载全部资源

- 分类：性能与容量 / 外部系统可靠性
- 所属模块：M27 付费媒体 adapter/stores/API
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`auto—publish/desktop/services/media-resource-service.js:64-96`；`media-workbench/src/App.tsx:86-92,123-128`
- 问题描述：`fetchAll` 不使用远端 total/hasNext，也不在短页结束，只在空页或 `maxPages=600` 结束；重复/忽略 page 的 API 会把相同资源累计 600 次。App 随后请求 `pageSize:99999`，把全量 cache 结构化克隆到 renderer。
- 代码证据：while 仅判断 `pageItems.length === 0`；没有 resourceId 去重；renderer 两处固定 99999。
- 触发条件：远端最后一页是满页后重复、分页参数被忽略、资源量增长或 API 异常持续返回非空页。
- 可达路径或调用链：资源刷新按钮 → `refreshResources({fetchAll:true})` → 最多 600 HTTP 请求/重复数组 → JSON cache → 单次巨大 IPC/renderer state。
- 实际影响：长时间刷新、请求放大、磁盘/内存峰值、主进程和 UI 卡顿；重复资源污染选择列表。
- 影响范围：资源缓存、付费媒体首屏和资源库。
- 现有测试是否覆盖：覆盖正常“最终空页”分页；没有重复页、total、去重或容量上限测试。
- 验证方法与结果：mock 每页固定返回同一资源，`maxPages:3`；实际请求 3 页、cache 得到 3 个相同 ID，确认机制。退出码 0。
- 修复方向：使用可靠分页元数据/短页终止，resourceId 去重和重复页检测，限制单次刷新容量；renderer 使用真实分页/虚拟化，不请求 99999。
- 关联发现：第一阶段 R15（本轮已复现重复页机制）。

## 测试情况

- 联合定向命令 133/133 通过，包含 media client/settings/resource/order/workbench 全套相关测试。
- 三个最小验证均退出码 0：默认 HTTP；order store 失败后 ledger remoteId 缺失；重复分页累计。
- 未调用真实媒体 API，避免外部扣费/数据发送。

## 未覆盖区域与待验证

- 生产 base URL、TLS 终止、专线/VPN/代理拓扑仍无仓库证据。
- 外部 API 是否以 `third_id` 提供服务端幂等、价格/余额语义、订单状态码完整集合需供应方契约。
- 真实资源规模、单稿费用、API 限速和 Windows 磁盘故障率未知。

## 模块审查结论

M27 达到深审完成门槛，3 条有效候选（高 2、中 1）。资源级 ledger 正常路径和 unknown→uncertain 设计有效，但明文默认、远端成功后订单关联丢失窗口和无界全量资源链必须在优化设计阶段优先处理。

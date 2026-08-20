# 27 — 投稿结果闭环整改：发布档案、需处理事项与最终投影

**What to build:** 修复第三阶段审计确认的 publication evidence、明确失败投影、运行期 uncertain 收敛和 Renderer 结果工作台问题，使成功、明确失败和不确定结果都能稳定、幂等、可理解地形成用户闭环。

**Status:** `PARTIAL`；27-A 已在本地完成实现、定向验证、Primary Audit、blocking remediation 与 Bounded Re-audit，evidence 见 `handoffs/27-A-publication-evidence-and-failure-read-model.md`。用户要求在此停止；27-B 尚未开始。

**Scheduling gate:** 基于 commit `7da7ec4` 的第三阶段只读审计结论启动。执行前必须重新确认当前 HEAD、clean/dirty 状态和本文件在 Wave Plan / `docs/WORK-INDEX.md` 中仍是唯一当前入口。27-A → 27-B → 27-C → 27-D 串行；不得并行修改 publication evidence、OperationalStore outcome/recovery 或共享 Renderer read model。

## 1. 已确认产品决定

1. 普通平台直接 accepted 仍必须携带至少一个远端身份：`remoteId` 或安全 `remoteUrl`。
2. **人工“确认已接受”不强制填写 `remoteUrl`。** 链接可能缺失、失效或不可靠，不得因此阻止人工 resolution，也不得因链接后来不可访问而撤销首次发布成功。
3. 人工确认成功的稳定证据是：绑定原 attempt/uncertain observation 的 operator decision、`manual_positive_evidence_time`、resolution fingerprint 与冻结投稿证据。`remoteId` / `remoteUrl` 都是可选的补充远端定位信息，不是人工 resolution 的成功 owner。
4. 人工确认没有可用链接时，发布档案必须明确展示“已人工确认发布，未记录可用链接”，不能留下含义不明的空白，也不能伪造 URL、远端 ID 或供应商发布时间。
5. 有安全 URL 时继续允许打开；URL 不存在或不可用时只影响跳转体验，不改变 publication、Article Lifecycle 或永久只读事实。
6. 明确失败继续进入“需处理事项”，但它是帮助用户理解原因并返回统一投稿入口的派生待办，不获得独立 resolved 状态或通用 retry。

这组决定替代第三阶段审计中“人工确认成功必须填写远端 URL/ID”的整改建议；该项不再作为 P1 阻塞。仍需修复的是人工确认无链接时的清晰档案表达。

## 2. 审计基线与需关闭 Findings

| ID | 优先级 | Finding | 当前 owner |
| --- | --- | --- | --- |
| RC-1 | P1 | 直接 accepted 的 `remoteId` 未进入 canonical publication archive/read model；ID-only 成功最终没有可见远端身份 | `publication-evidence-contract`、publication success/outcome aggregate、archive query |
| RC-2 | P1 | 明确失败的稳定 reason code 已持久化，但 publication/attention/UI read model 返回空原因 | recovery/publication query、attention projection |
| RC-3 | P1 | 远端调用返回后 outcome 本地提交失败时，当前运行期停留在 `remote_call_started`，只在重启后转 uncertain | regular queue orchestrator、regular recovery transition |
| RC-4 | P2 | Attention 的“打开发起投稿/打开发布详情/打开文章”存在重复或错误落点 | Renderer navigation intent |
| RC-5 | P2 | 发布档案首屏混入 raw target、result code、正文和图片决策等 execution/debug 信息 | Publication History UI/read model |
| RC-6 | P2 | Attention 偏技术状态展示，不能稳定说明发生了什么、远端风险和下一步 | attention user-facing projection/UI |

第三阶段审计已经证明并要求保留：publication first-wins、重复 finalize 幂等、uncertain 去重、stale token、resolution 原子收口、重启后 resolved attention 不复现、主进程安全打开外链，以及 Attention 作为派生 read model 而不是第二状态机。

## 3. Owner 与架构边界

- `src/domain/` 拥有版本化、递归封闭的 publication evidence 和安全 failure/read-model DTO；Renderer 不解释 operational row。
- OperationalStore 的唯一 publication-success primitive 继续拥有首次可信成功、不可变证据、竞争目标冻结和 first-wins；不得增加第二 writer。
- regular outcome/recovery aggregate 继续拥有 failed/uncertain/resolution 的一致性事务；Attention resolver 只路由具名命令。
- Attention query 根据 publication/recovery/order/removal/archive 事实决定事项是否存在，不新增 attention 表、hidden flag 或第二套 resolution 状态。
- Article Lifecycle 只消费最终事实。本 Ticket 只验证 publication/attention 对 lifecycle 的投影，不重审或改写第一阶段状态机。
- Renderer 首屏展示最终业务结果；execution attempt、完整投稿快照和安全审计 evidence 只能作为清楚分隔的次级详情。
- 27-B 只闭合 outcome 已产生后的本地恢复缺口，不重新审 queue scheduling、lease、adapter publish 或平台协议。

## 4. 27-A — Publication evidence 与失败 read model

**目标：** 关闭 RC-1、RC-2，并为 27-C 提供单一、稳定、用户安全的查询合同。

### 实施要求

1. 先确定 publication evidence 的版本演进方式。当前 V1 是封闭持久合同，不得静默改变旧 evidence 的含义或伪造历史 `remoteId`。优先建立明确版本化的新 evidence 合同或等价的单 owner 演进方式，使在线普通 accepted 可保存可选 `remoteId`；旧 V1 继续只读且缺失字段明确为 unknown。
2. `remoteId` 必须经过长度、控制字符和敏感信息边界校验。它用于显示/核对，不得直接拼成外链。
3. 直接 accepted 的三种合法矩阵必须完整投影：ID-only、URL-only、ID+URL。重复/并发 accepted 不得生成第二 publication 或覆盖首次证据。
4. 人工确认成功允许 ID/URL 都为空；若提供任一安全定位信息则保真保存。缺少定位信息时保留 manual positive decision/time/fingerprint，并在 archive read model 提供稳定的“无可用链接”展示语义。
5. 从明确失败的权威 observation/recovery detail 投影稳定 `reasonCode`。只暴露安全 code 和受控用户摘要，不泄露供应商原始异常、响应正文、Cookie、请求头或任意 metadata。
6. publication record、Attention 和 article/submission snapshots 复用同一失败原因映射，不建立 Renderer 私有 code 表或第二份失败事实。
7. 同步必要的 domain/schema/spec 合同和公开行为测试；不手改生产数据库，不回填无法证明的历史 ID/URL。

### 验收矩阵

- ID-only accepted：published、唯一 archive、显示 remote ID、没有打开链接按钮。
- URL-only accepted：published、唯一 archive、显示并可安全打开 URL。
- ID+URL accepted：两项证据均保留。
- 重复/并发 finalize：publication/attempt/archive identity 稳定，首次成功不可覆盖。
- manual accepted without locator：published、attention 消失、重启后不复现、档案明确显示人工确认且无可用链接。
- manual accepted with optional URL/ID：补充证据保真，但不改变 resolution 幂等/first-wins。
- explicit failure：稳定原因进入 publication、Attention 和 UI read model；未知 code 使用受控 fallback。
- legacy evidence：不伪造新字段，仍能安全读取和展示缺失原因。

### 最低验证

- domain evidence contract/validator tests；
- regular outcome accepted/failure/idempotency/fault tests；
- publication archive/query、article-management snapshot、attention query tests；
- typed IPC/preload contract tests；
- `git diff --check`。

完成后写 `handoffs/27-A-publication-evidence-and-failure-read-model.md`，27-B 才可开始。

## 5. 27-B — 当前运行期 uncertain 收敛

**目标：** 关闭 RC-3；远端副作用可能已经发生时，不依赖用户重启才能进入人工核实，同时绝不重放投稿。

### 实施要求

1. 仅处理 `remote_call_started` 之后、adapter 已返回或抛出不确定结果、但 outcome transition 本地提交未完成的 attempt。
2. outcome commit failure 不得被解释为远端明确失败，也不得触发 adapter/queue 自动 retry。
3. 在当前运行期通过既有具名 recovery transition 收敛为 durable uncertain/manual-check。不得新建 intent、替换 attempt identity 或增加旁路 status writer。
4. 原 outcome 错误与 recovery 错误必须区分；best-effort recovery failure 不能覆盖原业务错误。若底层存储持续不可用，保留 startup recovery 作为最终兜底。
5. 同一 attempt 的即时恢复、重复恢复、startup recovery 与迟到可信 accepted 必须遵守现有 first-success/stale 优先级。
6. 只扩展必要的 composition capability，不向 orchestrator 注入完整 OperationalStore。

### 验收矩阵

- 注入一次性 outcome transaction failure：当前进程内最终出现且只出现一条 uncertain Attention。
- adapter 调用次数保持 1；任何 recovery 路径都不再次执行远端投稿。
- 即时 recovery 重复调用幂等。
- recovery 自身持续失败：不伪造成功或失败；重启后按原 attempt 收敛 uncertain。
- 迟到 accepted 与人工 resolution 并发：可信首次成功优先，不错误解冻。
- 当前项进入 uncertain 后同组暂停、文章冻结，其他组行为不因本 Ticket 改写。

### 最低验证

- regular queue orchestrator fault-injection tests；
- recovery aggregate idempotency/restart tests；
- Attention query integration；
- no-replay/adaptor-call-count assertion；
- `git diff --check`。

完成后写 `handoffs/27-B-runtime-uncertain-recovery.md`，27-C 才可开始。

## 6. 27-C — Attention 与发布档案用户体验

**目标：** 关闭 RC-4～RC-6；不改变底层业务状态机，只重构用户 read model、导航 intent 和信息层级。

### 发布档案

1. 首屏优先显示：文章、平台、账号、最终结果、确认/发布时间、remote ID、可用链接及证据来源。
2. manual accepted 且无链接时明确显示“已人工确认发布，未记录可用链接”；不显示伪造链接，不要求补填 URL。
3. 只有安全 URL 才显示“打开发布链接”；链接打不开不改变已发布状态，并给出普通可理解的打开失败反馈。
4. raw `targetKey`、内部 result/status code、attempt/recovery 信息不作为主标题或核心说明。
5. 实际投稿正文/图片摘要可以保留为“投稿内容快照”次级区；execution history、安全诊断 evidence 放入独立折叠区，不与最终发布档案混为同一层级。

### 需处理事项

1. 每条事项必须回答：哪篇文章、哪个平台/账号、发生了什么、远端是否可能成功、为什么需要处理、动作完成后的业务结果。
2. 明确失败显示受控原因摘要和下一步；“打开发起投稿”进入统一投稿入口，不直接伪装 retry。
3. ordinary uncertain 只保留“确认已接受/确认未接受”；确认文案说明前者会永久标记已发布，且 URL 不是必填项。
4. “打开文章”“打开发布详情”“打开发起投稿”分别传递稳定且不同的 navigation intent，不再全部落到同一 publication drawer。
5. 技术 code 可在次级详情保留用于支持核对，但主卡使用产品语言。
6. resolved item 必须依赖刷新后的权威 read model 消失；不得用 Renderer 本地 hide 状态冒充关闭。

### 最低验证

- Renderer attention actions/navigation tests；
- Publication History 的 ID-only、URL-only、manual-no-link、failure reason fixtures；
- loading/empty/error/disabled/stale/窄屏行为；
- external URL opening contract；
- Renderer strict typecheck、lint、production build；
- 受影响 headless browser tests；
- `git diff --check`。

完成后写 `handoffs/27-C-result-closure-renderer.md`，27-D 才可开始。

## 7. 27-D — Combined Audit 与 Closure

**目标：** 对 27-A～C 的最终 integration HEAD 做一次 Primary Audit、blocking remediation、Bounded Re-audit 和 final clean-HEAD gate。

### 审计范围

- Success：accepted → publication → archive → lifecycle → article library detail。
- Failure：stable reason → Attention/UI → unified submission entry → safe new attempt。
- Uncertain：no retry → Attention → accepted/not-accepted resolution → final fact → restart persistence。
- publication first-wins、evidence immutability、attempt identity、Attention derivation、resolution stale fencing。
- 27-B 的当前运行期 recovery 与 startup fallback，不扩展到完整执行器审计。
- Renderer 的最终档案与次级 execution evidence 分层。

### Final gate

1. 重跑 27-A～C 所有定向测试和相关 ticket 09/22/26-F/26-H 回归。
2. 运行 Renderer typecheck/lint/build 与受影响 browser tests。
3. 按风险运行 publication/recovery/lifecycle/IPC 组合门禁；完整 `npm test` 只有当前 package/CI 合同要求时执行。
4. 所有 P0/P1 关闭；直接违反本计划 acceptance 的 P2 关闭；其余非阻塞项登记明确未来 owner。
5. 最终测试必须绑定最终 clean HEAD；测试后 production source、schema、关键测试或构建合同变化则 gate 失效。
6. 写 `handoffs/27-D-result-closure-integration.md`，更新 Wave Plan 和 `docs/WORK-INDEX.md`；完成后停止，不自动开始真实平台发布或其他 Ticket。

## 8. Non-goals

- 不强制人工确认填写 URL，也不抓取公开页面验证链接可达性。
- 不因链接失效、退款、未收录或售后撤销首次发布成功。
- 不重新设计 Article Lifecycle。
- 不重新审 queue scheduling、claim、lease、adapter publish 或各平台响应协议。
- 不完整审计 paid batch、订单创建/轮询/取消/售后状态机。
- 不实现第三方自媒体、同文多目标并发发布或发布后再次投稿。
- 不执行真实登录、真实发布、付费、取消、生产迁移或其他用户可见外部副作用。

## 9. 停止条件

仅在以下情况停止请求用户决定：

- evidence 版本演进需要不可逆生产迁移或删除历史事实；
- 当前 SPEC 与本文件第 1 节已确认决定存在实质冲突；
- owner 无法确定且继续会产生第二 publication/attention/resolution writer；
- 必须使用真实账号、真实发布或付费才能继续；
- 发现人工确认无 URL 无法与既有持久合同兼容，且无法通过版本化、安全缺失语义解决。

普通实现选择、测试失败、in-scope finding、局部 Renderer 重构和 bounded re-audit 不构成停止理由。

## 10. 27-A execution record

- Base integration commit：`7da7ec4675f73ec5d5e7c218cc693692b4a4bb02`。
- 完成范围：V2 regular publication evidence、canonical archive locator projection、统一明确失败安全 read model 及其 IPC/renderer 类型合同；没有 schema migration、真实外部操作或新的 publication/attention writer。
- Primary Audit 的 blocking finding 已在同一工作包修复，并通过 Bounded Re-audit；完整 evidence、命令和工作树状态见 `handoffs/27-A-publication-evidence-and-failure-read-model.md`。
- 27-A implementation 已提交到当前分支；尚未进行 merge/integration。27-B 为独立后续工作包，必须在用户另行授权后从新的 scheduling preflight 开始，不得自动进入。
